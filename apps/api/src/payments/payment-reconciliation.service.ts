import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import type { PaymentProviderObservation } from "./payment-provider";
import { PaymentOutcomeService } from "./payment-outcome.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";

export type ReconciliationTrigger = "staff" | "worker" | "customer_retry" | "webhook";

@Injectable()
export class PaymentReconciliationService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly registry: PaymentProviderRegistry,
    private readonly outcomes: PaymentOutcomeService,
  ) {}

  private paymentConfig() {
    if (!this.config.payments)
      throw new ApiProblem(503, "UNAVAILABLE", "Electronic payments are not configured.");
    return this.config.payments;
  }

  private async snapshot(attemptId: string) {
    const attempt = await this.db.paymentAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new ApiProblem(404, "NOT_FOUND", "Payment attempt not found.");
    return attempt;
  }

  private async emit(
    tx: Prisma.TransactionClient,
    type: "payment.reconciled" | "payment.reconciliation_exception",
    attemptId: string,
    orderId: string,
    actorId: string,
    requestId: string,
    details: Record<string, unknown>,
  ) {
    await tx.auditEvent.create({
      data: { actorId, action: type, entityId: attemptId, requestId, details: { orderId, ...details } },
    });
    await tx.outboxEvent.create({
      data: { type, aggregateId: attemptId, payload: { attemptId, orderId, ...details } },
    });
  }

  private reconciliationData(
    attemptId: string,
    provider: string,
    trigger: ReconciliationTrigger,
    observation: PaymentProviderObservation,
    result: "matched" | "state_changed" | "no_record" | "mismatch" | "exception",
    requestId: string,
    safeNote?: string,
  ) {
    return {
      paymentAttemptId: attemptId,
      provider,
      trigger,
      observedState: observation.state,
      providerRef: observation.providerReference ?? null,
      observedAmountMinor: observation.amountMinor ?? null,
      observedCurrency: observation.currency ?? null,
      result,
      safeNote: safeNote ?? null,
      requestId,
    };
  }

  private async forceException(
    tx: Prisma.TransactionClient,
    current: { id: string; orderId: string; settlementState: string },
    actorId: string,
    requestId: string,
    reason: string,
  ) {
    const first = current.settlementState !== "exception";
    await tx.paymentAttempt.update({
      where: { id: current.id },
      data: { settlementState: "exception", version: { increment: 1 } },
    });
    await tx.order.update({ where: { id: current.orderId }, data: { paymentStatus: "requires_review" } });
    if (first)
      await this.emit(tx, "payment.reconciliation_exception", current.id, current.orderId, actorId, requestId, { reason });
  }

  async reconcile(
    attemptId: string,
    trigger: ReconciliationTrigger,
    actorId: string,
    requestId: string,
  ) {
    const snapshot = await this.snapshot(attemptId);
    const adapter = this.registry.requireConfigured();
    if (adapter.id !== snapshot.provider)
      throw new ApiProblem(409, "CONFLICT", "The payment attempt provider is not currently authoritative.");

    let observation: PaymentProviderObservation;
    try {
      observation = await adapter.lookup({
        merchantReference: snapshot.merchantReference,
        providerReference: snapshot.providerRef ?? undefined,
        signal: AbortSignal.timeout(this.paymentConfig().requestTimeoutMs),
      });
    } catch {
      observation = {
        providerId: snapshot.provider,
        merchantReference: snapshot.merchantReference,
        providerReference: snapshot.providerRef ?? undefined,
        state: "unknown",
      };
    }

    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${snapshot.orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE "orderId"=${snapshot.orderId} ORDER BY id FOR UPDATE`;
      const current = await tx.paymentAttempt.findUnique({ where: { id: attemptId } });
      if (!current) throw new ApiProblem(404, "NOT_FOUND", "Payment attempt not found.");

      const stale =
        current.version !== snapshot.version ||
        current.provider !== snapshot.provider ||
        current.merchantReference !== snapshot.merchantReference ||
        current.providerRef !== snapshot.providerRef ||
        current.amountMinor !== snapshot.amountMinor ||
        current.currency !== snapshot.currency;
      if (stale) {
        await this.forceException(tx, current, actorId, requestId, "stale_reconciliation_snapshot");
        await tx.paymentReconciliation.create({
          data: this.reconciliationData(attemptId, snapshot.provider, trigger, observation, "exception", requestId, "Attempt changed while provider lookup was in progress."),
        });
        return { attemptId, result: "exception" as const };
      }

      if (observation.state === "unknown") {
        await this.forceException(tx, current, actorId, requestId, "provider_lookup_no_record");
        await tx.paymentReconciliation.create({
          data: this.reconciliationData(attemptId, snapshot.provider, trigger, observation, "exception", requestId, "Provider lookup returned no authoritative payment record."),
        });
        return { attemptId, result: "exception" as const };
      }

      const outcome = await this.outcomes.apply(tx, attemptId, observation, {
        actorId,
        requestId,
        source: "reconciliation",
      });
      if (outcome.processingResult === "mismatch" || outcome.processingResult === "exception") {
        await tx.paymentReconciliation.create({
          data: this.reconciliationData(attemptId, snapshot.provider, trigger, observation, "exception", requestId, "Provider observation conflicts with durable payment authority."),
        });
        await this.emit(tx, "payment.reconciliation_exception", attemptId, snapshot.orderId, actorId, requestId, { reason: outcome.processingResult });
        return { attemptId, result: "exception" as const };
      }

      const after = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: snapshot.orderId }, select: { paymentStatus: true } });
      if (order.paymentStatus === "requires_review") {
        await tx.paymentReconciliation.create({
          data: this.reconciliationData(attemptId, snapshot.provider, trigger, observation, "exception", requestId, "Payment remains in operator review."),
        });
        return { attemptId, result: "exception" as const };
      }

      const alreadyReconciled = after.settlementState === "reconciled";
      if (!alreadyReconciled)
        await tx.paymentAttempt.update({
          where: { id: attemptId },
          data: { settlementState: "reconciled", version: { increment: 1 } },
        });
      await tx.paymentReconciliation.create({
        data: this.reconciliationData(attemptId, snapshot.provider, trigger, observation, "matched", requestId),
      });
      if (!alreadyReconciled)
        await this.emit(tx, "payment.reconciled", attemptId, snapshot.orderId, actorId, requestId, { observedState: observation.state });
      return { attemptId, result: "matched" as const };
    }, { timeout: 15_000 });
  }
}
