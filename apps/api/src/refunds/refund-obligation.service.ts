import { Injectable } from "@nestjs/common";
import type { Order, PaymentAttempt, Prisma, Refund } from "@prisma/client";
import { ApiProblem } from "../http/errors";
import type { PaymentCaptureState } from "../payments/payment-capture.service";
import { normalizeRefundReason } from "./refund.values";

export interface RefundActorContext {
  actorId: string;
  requestId: string;
}

export type CancellationRefundSource =
  | "customer_cancellation"
  | "payment_review_cancellation";

@Injectable()
export class RefundObligationService {
  private async lockRefunds(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<Refund[]> {
    await tx.$queryRaw`SELECT id FROM "Refund" WHERE "orderId"=${orderId} ORDER BY id FOR UPDATE`;
    return tx.refund.findMany({ where: { orderId }, orderBy: { id: "asc" } });
  }

  private assertCaptureCapacity(
    captures: PaymentAttempt[],
    existing: Refund[],
  ) {
    const committed = new Map<string, number>();
    for (const refund of existing)
      committed.set(
        refund.paymentAttemptId,
        (committed.get(refund.paymentAttemptId) ?? 0) + refund.amountMinor,
      );
    for (const capture of captures) {
      const used = committed.get(capture.id) ?? 0;
      if (used > capture.amountMinor)
        throw new ApiProblem(
          422,
          "RULE_VIOLATION",
          "Refund obligations exceed the successful payment capture.",
        );
    }
    return committed;
  }

  private async create(
    tx: Prisma.TransactionClient,
    order: Pick<Order, "id">,
    capture: PaymentAttempt,
    amountMinor: number,
    sourceType: CancellationRefundSource | "overcharge_correction",
    reason: string,
    context: RefundActorContext,
  ): Promise<Refund> {
    if (capture.status !== "succeeded")
      throw new ApiProblem(422, "RULE_VIOLATION", "Only a successful payment capture can fund a refund.");
    const refund = await tx.refund.create({
      data: {
        orderId: order.id,
        paymentAttemptId: capture.id,
        provider: capture.provider,
        method: capture.method,
        currency: "GHS",
        amountMinor,
        sourceType,
        reason,
        status: "awaiting_approval",
        requestedBy: context.actorId,
      },
    });
    const details = {
      orderId: order.id,
      paymentAttemptId: capture.id,
      provider: capture.provider,
      method: capture.method,
      amountMinor,
      currency: "GHS",
      sourceType,
      reason,
    };
    await tx.auditEvent.create({
      data: {
        actorId: context.actorId,
        action: "refund.requested",
        entityId: refund.id,
        requestId: context.requestId,
        details,
      },
    });
    await tx.outboxEvent.create({
      data: {
        type: "refund.requested",
        aggregateId: refund.id,
        payload: { refundId: refund.id, ...details },
      },
    });
    return refund;
  }

  async ensureFullCancellation(
    tx: Prisma.TransactionClient,
    order: Order,
    captureState: PaymentCaptureState,
    sourceType: CancellationRefundSource,
    reason: string,
    context: RefundActorContext,
  ): Promise<Refund[]> {
    const normalized = normalizeRefundReason(reason);
    const captures = [...captureState.successfulCaptures].sort((a, b) => a.id.localeCompare(b.id));
    if (captures.length === 0) return [];
    const existing = await this.lockRefunds(tx, order.id);
    const committed = this.assertCaptureCapacity(captures, existing);
    const created: Refund[] = [];
    for (const capture of captures) {
      const remaining = capture.amountMinor - (committed.get(capture.id) ?? 0);
      if (remaining <= 0) continue;
      const refund = await this.create(
        tx,
        order,
        capture,
        remaining,
        sourceType,
        normalized,
        context,
      );
      created.push(refund);
      committed.set(capture.id, capture.amountMinor);
    }
    return created;
  }

  async ensureExcessCorrection(
    tx: Prisma.TransactionClient,
    order: Order,
    captureState: PaymentCaptureState,
    reason: string,
    context: RefundActorContext,
  ): Promise<Refund[]> {
    const normalized = normalizeRefundReason(reason);
    const captures = [...captureState.successfulCaptures];
    if (captures.length === 0) return [];
    const existing = await this.lockRefunds(tx, order.id);
    const committedByCapture = this.assertCaptureCapacity(captures, existing);
    const capturedMinor = captures.reduce((sum, capture) => sum + capture.amountMinor, 0);
    const committedMinor = existing.reduce((sum, refund) => sum + refund.amountMinor, 0);
    let remainingExcess = Math.max(0, capturedMinor - order.totalMinor - committedMinor);
    if (remainingExcess === 0) return [];

    const newestFirst = captures.sort((a, b) => {
      const time = b.createdAt.getTime() - a.createdAt.getTime();
      return time || b.id.localeCompare(a.id);
    });
    const created: Refund[] = [];
    for (const capture of newestFirst) {
      if (remainingExcess === 0) break;
      const available = capture.amountMinor - (committedByCapture.get(capture.id) ?? 0);
      if (available <= 0) continue;
      const amountMinor = Math.min(available, remainingExcess);
      const refund = await this.create(
        tx,
        order,
        capture,
        amountMinor,
        "overcharge_correction",
        normalized,
        context,
      );
      created.push(refund);
      committedByCapture.set(
        capture.id,
        (committedByCapture.get(capture.id) ?? 0) + amountMinor,
      );
      remainingExcess -= amountMinor;
    }
    if (remainingExcess !== 0)
      throw new ApiProblem(422, "RULE_VIOLATION", "Refund capacity cannot cover the verified excess capture.");
    return created;
  }
}
