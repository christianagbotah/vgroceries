import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { API_CONFIG, type ApiConfig } from "../config";
import { AllocationService } from "../inventory/allocation.service";
import { ApiProblem } from "../http/errors";
import type { PaymentProviderObservation } from "./payment-provider";

export interface PaymentOutcomeContext {
  actorId: string;
  requestId: string;
  source: "provider_event" | "reconciliation";
}

export interface PaymentOutcomeResult {
  processingResult: "applied" | "pending" | "mismatch" | "exception" | "duplicate";
  attemptStatus: string;
  orderPaymentStatus: string;
}

const terminal = new Set(["succeeded", "failed", "expired"]);
const coverageProblems = new Set(["OUT_OF_STOCK", "RESERVATION_LOST", "CONFLICT"]);

function problemCode(error: unknown) {
  if (!(error instanceof ApiProblem)) return null;
  const body = error.getResponse();
  return typeof body === "object" && body && "code" in body
    ? String((body as { code: unknown }).code)
    : null;
}

@Injectable()
export class PaymentOutcomeService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly allocation: AllocationService,
  ) {}

  private authority() {
    if (!this.config.payments || !this.config.commerce)
      throw new ApiProblem(503, "UNAVAILABLE", "Payment authority is not configured.");
    return { payments: this.config.payments, commerce: this.config.commerce };
  }

  private async lockAuthority(tx: Prisma.TransactionClient, attemptId: string) {
    const seed = await tx.paymentAttempt.findUnique({ where: { id: attemptId }, select: { orderId: true } });
    if (!seed) throw new ApiProblem(404, "NOT_FOUND", "Payment attempt not found.");
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${seed.orderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE "orderId"=${seed.orderId} ORDER BY id FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({
      where: { id: seed.orderId },
      include: { lines: { orderBy: { id: "asc" } } },
    });
    const attempts = await tx.paymentAttempt.findMany({
      where: { orderId: seed.orderId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const attempt = attempts.find((row) => row.id === attemptId);
    if (!attempt) throw new ApiProblem(404, "NOT_FOUND", "Payment attempt not found.");
    const index = attempts.findIndex((row) => row.id === attemptId);
    return { order, attempts, attempt, hasNewerAttempt: index >= 0 && index < attempts.length - 1 };
  }

  private mismatch(attempt: { provider: string; merchantReference: string; providerRef: string | null; amountMinor: number; currency: string }, observation: PaymentProviderObservation) {
    if (observation.providerId !== attempt.provider) return "provider";
    if (observation.merchantReference !== attempt.merchantReference) return "merchant_reference";
    if (attempt.providerRef && observation.providerReference && observation.providerReference !== attempt.providerRef) return "provider_reference";
    if (observation.amountMinor !== undefined && observation.amountMinor !== attempt.amountMinor) return "amount";
    if (observation.currency !== undefined && observation.currency !== attempt.currency) return "currency";
    if (observation.state === "succeeded" && (observation.amountMinor === undefined || observation.currency === undefined)) return "missing_money_identity";
    return null;
  }

  private async emit(
    tx: Prisma.TransactionClient,
    context: PaymentOutcomeContext,
    attemptId: string,
    orderId: string,
    type: string,
    details: Record<string, unknown>,
  ) {
    await tx.auditEvent.create({
      data: { actorId: context.actorId, action: type, entityId: attemptId, requestId: context.requestId, details: { orderId, ...details } },
    });
    await tx.outboxEvent.create({ data: { type, aggregateId: attemptId, payload: { attemptId, orderId, ...details } } });
  }

  private async review(
    tx: Prisma.TransactionClient,
    context: PaymentOutcomeContext,
    attempt: { id: string; orderId: string; settlementState: string },
    reason: string,
  ) {
    const firstException = attempt.settlementState !== "exception";
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { settlementState: "exception", version: { increment: 1 } },
    });
    await tx.order.update({ where: { id: attempt.orderId }, data: { paymentStatus: "requires_review" } });
    if (firstException)
      await this.emit(tx, context, attempt.id, attempt.orderId, "payment.requires_review", { reason });
  }

  private async applyPending(
    tx: Prisma.TransactionClient,
    context: PaymentOutcomeContext,
    state: Awaited<ReturnType<PaymentOutcomeService["lockAuthority"]>>,
    observation: PaymentProviderObservation,
  ): Promise<PaymentOutcomeResult> {
    const { attempt, order, hasNewerAttempt } = state;
    if (terminal.has(attempt.status))
      return { processingResult: "duplicate", attemptStatus: attempt.status, orderPaymentStatus: order.paymentStatus };
    const providerRef = attempt.providerRef ?? observation.providerReference;
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { providerRef, status: "pending", initiationState: "accepted", version: { increment: 1 } },
    });
    if (!hasNewerAttempt && !["succeeded", "requires_review", "partially_refunded", "refund_pending", "refunded"].includes(order.paymentStatus))
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "pending" } });
    return { processingResult: "pending", attemptStatus: "pending", orderPaymentStatus: hasNewerAttempt ? order.paymentStatus : "pending" };
  }

  private async applyFailure(
    tx: Prisma.TransactionClient,
    context: PaymentOutcomeContext,
    state: Awaited<ReturnType<PaymentOutcomeService["lockAuthority"]>>,
    observation: PaymentProviderObservation,
  ): Promise<PaymentOutcomeResult> {
    const { attempt, order, hasNewerAttempt } = state;
    const next = observation.state as "failed" | "expired";
    if (terminal.has(attempt.status)) {
      if (attempt.status === next)
        return { processingResult: "duplicate", attemptStatus: attempt.status, orderPaymentStatus: order.paymentStatus };
      await this.review(tx, context, attempt, `conflicting_terminal_${attempt.status}_then_${next}`);
      return { processingResult: "exception", attemptStatus: attempt.status, orderPaymentStatus: "requires_review" };
    }
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: next,
        initiationState: next === "failed" ? "rejected" : attempt.initiationState,
        failureCode: observation.failureCode ?? null,
        failureReason: observation.customerSafeMessage ?? (next === "failed" ? "Payment failed." : "Payment expired."),
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (!hasNewerAttempt && !["succeeded", "requires_review", "partially_refunded", "refund_pending", "refunded"].includes(order.paymentStatus)) {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: next } });
      await this.emit(tx, context, attempt.id, order.id, `payment.${next}`, { providerState: observation.state });
    }
    return { processingResult: "applied", attemptStatus: next, orderPaymentStatus: hasNewerAttempt ? order.paymentStatus : next };
  }

  private async applySuccess(
    tx: Prisma.TransactionClient,
    context: PaymentOutcomeContext,
    state: Awaited<ReturnType<PaymentOutcomeService["lockAuthority"]>>,
    observation: PaymentProviderObservation,
  ): Promise<PaymentOutcomeResult> {
    const { payments, commerce } = this.authority();
    const { attempt, order, hasNewerAttempt } = state;
    if (terminal.has(attempt.status)) {
      if (attempt.status === "succeeded")
        return { processingResult: "duplicate", attemptStatus: attempt.status, orderPaymentStatus: order.paymentStatus };
      await this.review(tx, context, attempt, `conflicting_terminal_${attempt.status}_then_succeeded`);
      return { processingResult: "exception", attemptStatus: attempt.status, orderPaymentStatus: "requires_review" };
    }

    const providerRef = attempt.providerRef ?? observation.providerReference;
    const incompatible = hasNewerAttempt || order.fulfilmentStatus === "cancelled" || !!order.stockConsumedAt;
    if (!incompatible) {
      try {
        await this.allocation.ensureClaimCoverage(tx, {
          claimType: "order",
          claimId: order.id,
          locationId: commerce.locationId,
          expiresAt: new Date(Date.now() + payments.confirmedHoldMinutes * 60_000),
          actorId: context.actorId,
          requestId: context.requestId,
          lines: order.lines.map((line) => ({ claimLineId: line.id, variantId: line.variantId, quantity: line.quantity.toString() })),
        });
      } catch (error) {
        const code = problemCode(error);
        if (!code || !coverageProblems.has(code)) throw error;
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { providerRef, status: "succeeded", initiationState: "accepted", settlementState: "exception", resolvedAt: new Date(), version: { increment: 1 } },
        });
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "requires_review" } });
        await this.emit(tx, context, attempt.id, order.id, "payment.succeeded", { coverage: "failed", reason: code });
        await this.emit(tx, context, attempt.id, order.id, "payment.requires_review", { reason: `paid_without_stock_${code}` });
        return { processingResult: "exception", attemptStatus: "succeeded", orderPaymentStatus: "requires_review" };
      }
    }

    if (incompatible) {
      const reason = hasNewerAttempt ? "stale_attempt_succeeded" : order.fulfilmentStatus === "cancelled" ? "succeeded_after_cancellation" : "succeeded_after_stock_handover";
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { providerRef, status: "succeeded", initiationState: "accepted", settlementState: "exception", resolvedAt: new Date(), version: { increment: 1 } },
      });
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "requires_review" } });
      await this.emit(tx, context, attempt.id, order.id, "payment.succeeded", { coverage: "not_applied", reason });
      await this.emit(tx, context, attempt.id, order.id, "payment.requires_review", { reason });
      return { processingResult: "exception", attemptStatus: "succeeded", orderPaymentStatus: "requires_review" };
    }

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { providerRef, status: "succeeded", initiationState: "accepted", resolvedAt: new Date(), version: { increment: 1 } },
    });
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "succeeded" } });
    await tx.orderEvent.create({
      data: { orderId: order.id, actorKind: "system", actorId: context.actorId, action: "payment.succeeded", fromStatus: order.paymentStatus, toStatus: "succeeded", customerSafe: true },
    });
    await this.emit(tx, context, attempt.id, order.id, "payment.succeeded", { coverage: "confirmed" });
    return { processingResult: "applied", attemptStatus: "succeeded", orderPaymentStatus: "succeeded" };
  }

  async apply(
    tx: Prisma.TransactionClient,
    attemptId: string,
    observation: PaymentProviderObservation,
    context: PaymentOutcomeContext,
  ): Promise<PaymentOutcomeResult> {
    const state = await this.lockAuthority(tx, attemptId);
    const mismatch = this.mismatch(state.attempt, observation);
    if (mismatch) {
      await this.review(tx, context, state.attempt, `provider_evidence_mismatch_${mismatch}`);
      return { processingResult: "mismatch", attemptStatus: state.attempt.status, orderPaymentStatus: "requires_review" };
    }
    if (observation.state === "pending") return this.applyPending(tx, context, state, observation);
    if (observation.state === "failed" || observation.state === "expired") return this.applyFailure(tx, context, state, observation);
    if (observation.state === "succeeded") return this.applySuccess(tx, context, state, observation);
    await this.review(tx, context, state.attempt, "provider_state_unknown");
    return { processingResult: "exception", attemptStatus: state.attempt.status, orderPaymentStatus: "requires_review" };
  }
}
