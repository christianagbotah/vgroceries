import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Order, Prisma } from "@prisma/client";
import {
  adminOrderFinancialActionResponseSchema,
  type AdminOrderFinancialActionRequest,
  type AdminOrderFinancialActionResponse,
  type RefundSourceType,
  type RefundStatus,
} from "@variety/contracts";
import { Database } from "../database/database";
import { DeliveryConfigService } from "../delivery-config/delivery-config.service";
import { ApiProblem, type ApiRequest } from "../http/errors";
import { AllocationService } from "../inventory/allocation.service";
import { PaymentCaptureService, type PaymentCaptureState } from "../payments/payment-capture.service";
import { PaymentRefundProjectionService } from "../payments/payment-refund-projection.service";
import { RefundObligationService } from "../refunds/refund-obligation.service";
import { normalizeRefundReason } from "../refunds/refund.values";

const OPERATION = "orders.admin.financial_action";
const HANDOVER_BLOCKED = new Set(["dispatched", "delivered", "collected"]);

function requestHash(orderId: string, input: AdminOrderFinancialActionRequest) {
  return createHash("sha256").update(JSON.stringify({ orderId, ...input })).digest("hex");
}

@Injectable()
export class OrderFinancialActionService {
  constructor(
    private readonly db: Database,
    private readonly allocation: AllocationService,
    private readonly delivery: DeliveryConfigService,
    private readonly captures: PaymentCaptureService,
    private readonly refunds: RefundObligationService,
    private readonly projection: PaymentRefundProjectionService,
  ) {}

  private async project(
    tx: Prisma.TransactionClient,
    order: Order,
    fulfilmentStatus: string,
    captureState: PaymentCaptureState,
  ) {
    const rows = await tx.refund.findMany({
      where: { orderId: order.id },
      orderBy: { id: "asc" },
      select: { amountMinor: true, status: true, sourceType: true },
    });
    return this.projection.apply(tx, {
      order: { id: order.id, totalMinor: order.totalMinor, fulfilmentStatus, paymentStatus: order.paymentStatus },
      captures: captureState.successfulCaptures.map((capture) => ({ id: capture.id, amountMinor: capture.amountMinor })),
      refunds: rows.map((refund) => ({
        amountMinor: refund.amountMinor,
        status: refund.status as RefundStatus,
        sourceType: refund.sourceType as RefundSourceType,
      })),
    });
  }

  async apply(
    req: ApiRequest,
    actorId: string,
    orderId: string,
    input: AdminOrderFinancialActionRequest,
    idempotencyKey: string,
  ): Promise<AdminOrderFinancialActionResponse> {
    const normalizedInput: AdminOrderFinancialActionRequest = {
      action: input.action,
      reason: normalizeRefundReason(input.reason),
    };
    const hash = requestHash(orderId, normalizedInput);

    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId, OPERATION, idempotencyKey])},0))`;
      const replay = await tx.idempotency.findUnique({
        where: { actorId_operation_key: { actorId, operation: OPERATION, key: idempotencyKey } },
      });
      if (replay) {
        if (replay.requestHash !== hash)
          throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with different order financial input.");
        const parsed = adminOrderFinancialActionResponseSchema.safeParse(replay.outcome);
        if (!parsed.success)
          throw new ApiProblem(409, "CONFLICT", "Order financial replay state is incomplete.");
        return parsed.data;
      }

      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");

      const captureState = await this.captures.lockForOrder(tx, orderId);
      if (captureState.liveAttempts.length > 0)
        throw new ApiProblem(422, "RULE_VIOLATION", "Payment reconciliation is required before this financial action.");
      if (captureState.successfulCaptures.length === 0)
        throw new ApiProblem(422, "RULE_VIOLATION", "No verified successful payment capture is available for refund.");

      const context = { actorId, requestId: req.requestId };
      let refundIds: string[] = [];
      let fulfilmentStatus = order.fulfilmentStatus;

      if (normalizedInput.action === "cancel_refund") {
        const alreadyCancelled = order.fulfilmentStatus === "cancelled";
        if (!alreadyCancelled && (order.stockConsumedAt || HANDOVER_BLOCKED.has(order.fulfilmentStatus)))
          throw new ApiProblem(409, "CONFLICT", "This order requires the future returns workflow after handover.");

        const created = await this.refunds.ensureFullCancellation(
          tx,
          order,
          captureState,
          "payment_review_cancellation",
          normalizedInput.reason,
          context,
        );
        refundIds = created.map((refund) => refund.id);

        if (!alreadyCancelled) {
          fulfilmentStatus = "cancelled";
          await tx.order.update({
            where: { id: orderId },
            data: {
              fulfilmentStatus,
              cancelledAt: new Date(),
              cancelledReason: normalizedInput.reason,
              version: { increment: 1 },
            },
          });
          await this.allocation.release(tx, "order", orderId, context);
          await this.delivery.releaseBooking(tx, orderId, context);
          await tx.orderEvent.create({ data: {
            orderId,
            actorKind: "staff",
            actorId,
            action: "order.cancelled_with_refund",
            fromStatus: order.fulfilmentStatus,
            toStatus: "cancelled",
            note: normalizedInput.reason,
            customerSafe: true,
          } });
          await tx.auditEvent.create({ data: {
            actorId,
            action: "order.cancelled_with_refund",
            entityId: orderId,
            requestId: req.requestId,
            details: { reason: normalizedInput.reason, refundCount: refundIds.length },
          } });
          await tx.outboxEvent.create({ data: {
            type: "order.cancelled_with_refund",
            aggregateId: orderId,
            payload: { orderId, reason: normalizedInput.reason, refundCount: refundIds.length },
          } });
        }
      } else {
        if (order.fulfilmentStatus === "cancelled")
          throw new ApiProblem(409, "CONFLICT", "Excess-capture correction does not apply to a cancelled order.");
        const created = await this.refunds.ensureExcessCorrection(
          tx,
          order,
          captureState,
          normalizedInput.reason,
          context,
        );
        if (created.length === 0)
          throw new ApiProblem(422, "RULE_VIOLATION", "There is no verified excess capture remaining to refund.");
        refundIds = created.map((refund) => refund.id);
      }

      const paymentStatus = await this.project(tx, order, fulfilmentStatus, captureState);
      const outcome: AdminOrderFinancialActionResponse = {
        orderId,
        fulfilmentStatus,
        paymentStatus,
        refundIds,
      };
      await tx.idempotency.create({ data: {
        actorId,
        operation: OPERATION,
        key: idempotencyKey,
        requestHash: hash,
        outcome,
      } });
      return outcome;
    }, { timeout: 15_000 });
  }
}
