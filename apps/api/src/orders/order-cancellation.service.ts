import { Injectable } from "@nestjs/common";
import type { RefundSourceType, RefundStatus } from "@variety/contracts";
import { Database } from "../database/database";
import { AllocationService } from "../inventory/allocation.service";
import { DeliveryConfigService } from "../delivery-config/delivery-config.service";
import { ApiProblem } from "../http/errors";
import { PaymentCaptureService } from "../payments/payment-capture.service";
import { PaymentRefundProjectionService } from "../payments/payment-refund-projection.service";
import { RefundObligationService } from "../refunds/refund-obligation.service";
import { normalizeRefundReason } from "../refunds/refund.values";

const blockedFulfilment = new Set(["dispatched", "delivered", "collected"]);
const capturedProjectionWithoutCapture = new Set([
  "succeeded", "partially_refunded", "refund_pending", "refunded", "requires_review",
]);

@Injectable()
export class OrderCancellationService {
  constructor(
    private readonly db: Database,
    private readonly allocation: AllocationService,
    private readonly delivery: DeliveryConfigService,
    private readonly captures: PaymentCaptureService,
    private readonly refunds: RefundObligationService,
    private readonly projection: PaymentRefundProjectionService,
  ) {}

  async cancel(userId: string, requestId: string, orderId: string, reason: string) {
    const normalized = normalizeRefundReason(reason);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.customerUserId !== userId)
        throw new ApiProblem(404, "NOT_FOUND", "Order not found.");

      const alreadyCancelled = order.fulfilmentStatus === "cancelled";
      if (alreadyCancelled && order.cancelledReason !== normalized)
        throw new ApiProblem(409, "CONFLICT", "Order was already cancelled with a different reason.");

      // Global financial lock order: Order -> PaymentAttempts -> Refunds.
      const captureState = await this.captures.lockForOrder(tx, orderId);
      if (captureState.liveAttempts.length > 0)
        throw new ApiProblem(
          422,
          "RULE_VIOLATION",
          "Payment reconciliation is required before this order can be cancelled.",
        );

      if (!alreadyCancelled && (order.stockConsumedAt || blockedFulfilment.has(order.fulfilmentStatus)))
        throw new ApiProblem(409, "CONFLICT", "Order can no longer be cancelled before handover.");

      const hasCaptures = captureState.successfulCaptures.length > 0;
      if (!hasCaptures && capturedProjectionWithoutCapture.has(order.paymentStatus))
        throw new ApiProblem(
          422,
          "RULE_VIOLATION",
          "This order has refund-sensitive payment state but no verified refundable capture.",
        );

      const context = { actorId: userId, requestId };
      const createdRefunds = hasCaptures
        ? await this.refunds.ensureFullCancellation(
            tx,
            order,
            captureState,
            "customer_cancellation",
            normalized,
            context,
          )
        : [];

      if (!alreadyCancelled) {
        await tx.order.update({
          where: { id: orderId },
          data: {
            fulfilmentStatus: "cancelled",
            cancelledAt: new Date(),
            cancelledReason: normalized,
            version: { increment: 1 },
          },
        });
      }

      if (hasCaptures) {
        const durableRefunds = await tx.refund.findMany({
          where: { orderId },
          orderBy: { id: "asc" },
          select: { amountMinor: true, status: true, sourceType: true },
        });
        await this.projection.apply(tx, {
          order: {
            id: order.id,
            totalMinor: order.totalMinor,
            fulfilmentStatus: "cancelled",
            paymentStatus: order.paymentStatus,
          },
          captures: captureState.successfulCaptures.map((capture) => ({
            id: capture.id,
            amountMinor: capture.amountMinor,
          })),
          refunds: durableRefunds.map((refund) => ({
            amountMinor: refund.amountMinor,
            status: refund.status as RefundStatus,
            sourceType: refund.sourceType as RefundSourceType,
          })),
        });
      }

      if (!alreadyCancelled) {
        await this.allocation.release(tx, "order", orderId, context);
        await this.delivery.releaseBooking(tx, orderId, context);
      }

      const financialCancellation = hasCaptures;
      const shouldRecordCancellation = !alreadyCancelled || createdRefunds.length > 0;
      if (shouldRecordCancellation) {
        const action = financialCancellation ? "order.cancelled_with_refund" : "order.cancelled";
        await tx.orderEvent.create({ data: {
          orderId,
          actorKind: "customer",
          actorId: userId,
          action,
          fromStatus: order.fulfilmentStatus,
          toStatus: "cancelled",
          note: normalized,
          customerSafe: true,
        } });
        await tx.auditEvent.create({ data: {
          actorId: userId,
          action,
          entityId: orderId,
          requestId,
          details: { reason: normalized, refundCount: createdRefunds.length },
        } });
        await tx.outboxEvent.create({ data: {
          type: action,
          aggregateId: orderId,
          payload: { orderId, reason: normalized, refundCount: createdRefunds.length },
        } });
      }

      return { fulfilmentStatus: "cancelled" };
    }, { timeout: 15_000 });
  }
}
