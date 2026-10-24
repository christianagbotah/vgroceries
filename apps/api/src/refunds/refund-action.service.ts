import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { ElectronicPaymentMethod, RefundAction, RefundActionResponse } from "@variety/contracts";
import { refundActionResponseSchema } from "@variety/contracts";
import type { PaymentAttempt, Prisma, Refund, RefundExecution } from "@prisma/client";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem, type ApiRequest } from "../http/errors";
import { PaymentCaptureService } from "../payments/payment-capture.service";
import type {
  RefundProviderAdapter,
  RefundProviderInitiationResult,
  RefundProviderObservation,
} from "../payments/refund-provider";
import { RefundProviderRegistry } from "../payments/refund-provider.registry";
import { RefundOutcomeService } from "./refund-outcome.service";

const OPERATION = "refunds.action";

type Snapshot = {
  refund: Refund;
  execution: RefundExecution;
  capture: PaymentAttempt;
  orderReference: string;
  orderPaymentStatus: string;
};

type Stage =
  | { kind: "direct"; outcome: RefundActionResponse }
  | { kind: "execute"; snapshot: Snapshot; trigger: "execute" | "retry" }
  | { kind: "lookup"; snapshot: Snapshot; trigger: "execute_recovery" | "retry" | "manual_reconcile" };

function semanticHash(refundId: string, action: RefundAction) {
  return createHash("sha256").update(JSON.stringify({ refundId, action })).digest("hex");
}

function merchantRefundReference() {
  return `VG-REF-${randomUUID().replaceAll("-", "").toUpperCase()}`;
}

@Injectable()
export class RefundActionService {
  constructor(
    private readonly db: Database,
    private readonly captures: PaymentCaptureService,
    private readonly providers: RefundProviderRegistry,
    private readonly outcomes: RefundOutcomeService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private timeoutMs() {
    if (!this.config.payments)
      throw new ApiProblem(503, "UNAVAILABLE", "Electronic payment refunds are not configured.");
    return this.config.payments.requestTimeoutMs;
  }

  private async advisory(tx: Prisma.TransactionClient, actorId: string, key: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId, OPERATION, key])},0))`;
  }

  private response(refund: Refund, execution: RefundExecution | null, orderPaymentStatus: string): RefundActionResponse {
    return refundActionResponseSchema.parse({
      refundId: refund.id,
      refundStatus: refund.status,
      ...(execution ? {
        executionStatus: execution.status,
        reconciliationState: execution.reconciliationState,
      } : {}),
      orderPaymentStatus,
    });
  }

  private parseReplay(outcome: Prisma.JsonValue): RefundActionResponse {
    const parsed = refundActionResponseSchema.safeParse(outcome);
    if (!parsed.success)
      throw new ApiProblem(409, "CONFLICT", "Refund action replay state is incomplete.");
    return parsed.data;
  }

  private async lockRefundAuthority(tx: Prisma.TransactionClient, refundId: string) {
    const seed = await tx.refund.findUnique({ where: { id: refundId }, select: { orderId: true } });
    if (!seed) throw new ApiProblem(404, "NOT_FOUND", "Refund not found.");
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${seed.orderId} FOR UPDATE`;
    const captureState = await this.captures.lockForOrder(tx, seed.orderId);
    await tx.$queryRaw`SELECT id FROM "Refund" WHERE "orderId"=${seed.orderId} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT e.id FROM "RefundExecution" e JOIN "Refund" r ON r.id=e."refundId" WHERE r."orderId"=${seed.orderId} ORDER BY e.id FOR UPDATE OF e`;
    const refund = await tx.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new ApiProblem(404, "NOT_FOUND", "Refund not found.");
    const order = await tx.order.findUniqueOrThrow({ where: { id: seed.orderId } });
    const capture = captureState.successfulCaptures.find((row) => row.id === refund.paymentAttemptId);
    if (!capture || capture.orderId !== refund.orderId || capture.provider !== refund.provider || capture.method !== refund.method || capture.currency !== refund.currency)
      throw new ApiProblem(409, "CONFLICT", "Refund is not backed by matching successful payment capture truth.");
    const obligations = await tx.refund.aggregate({
      where: { paymentAttemptId: refund.paymentAttemptId },
      _sum: { amountMinor: true },
    });
    if ((obligations._sum.amountMinor ?? 0) > capture.amountMinor)
      throw new ApiProblem(409, "CONFLICT", "Refund obligations exceed the successful payment capture.");
    const execution = await tx.refundExecution.findUnique({ where: { refundId } });
    return { refund, order, capture, execution };
  }

  private async persistReplay(
    tx: Prisma.TransactionClient,
    actorId: string,
    key: string,
    hash: string,
    outcome: RefundActionResponse,
  ) {
    const existing = await tx.idempotency.findUnique({
      where: { actorId_operation_key: { actorId, operation: OPERATION, key } },
    });
    if (existing && existing.requestHash !== hash)
      throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different refund action.");
    await tx.idempotency.upsert({
      where: { actorId_operation_key: { actorId, operation: OPERATION, key } },
      create: { actorId, operation: OPERATION, key, requestHash: hash, outcome },
      update: { outcome },
    });
  }

  private async approve(req: ApiRequest, actorId: string, refundId: string, key: string, hash: string): Promise<Stage> {
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, key);
      const replay = await tx.idempotency.findUnique({
        where: { actorId_operation_key: { actorId, operation: OPERATION, key } },
      });
      if (replay) {
        if (replay.requestHash !== hash)
          throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different refund action.");
        return { kind: "direct", outcome: this.parseReplay(replay.outcome) } as Stage;
      }
      const state = await this.lockRefundAuthority(tx, refundId);
      if (state.execution)
        throw new ApiProblem(409, "CONFLICT", "Refund execution already exists.");
      if (state.refund.status !== "awaiting_approval")
        throw new ApiProblem(409, "CONFLICT", "Refund is not awaiting approval.");
      const approved = await tx.refund.update({
        where: { id: refundId },
        data: { status: "approved", approvedBy: actorId, approvedAt: new Date(), failureReason: null, version: { increment: 1 } },
      });
      await tx.auditEvent.create({ data: {
        actorId, action: "refund.approved", entityId: refundId, requestId: req.requestId,
        details: { orderId: approved.orderId },
      } });
      await tx.outboxEvent.create({ data: {
        type: "refund.approved", aggregateId: refundId, payload: { refundId, orderId: approved.orderId },
      } });
      const outcome = this.response(approved, null, state.order.paymentStatus);
      await this.persistReplay(tx, actorId, key, hash, outcome);
      return { kind: "direct", outcome } as Stage;
    }, { timeout: 15_000 });
  }

  private snapshot(state: Awaited<ReturnType<RefundActionService["lockRefundAuthority"]>>, execution: RefundExecution): Snapshot {
    return {
      refund: state.refund,
      execution,
      capture: state.capture,
      orderReference: state.order.reference,
      orderPaymentStatus: state.order.paymentStatus,
    };
  }

  private async stageNetworkAction(
    req: ApiRequest,
    actorId: string,
    refundId: string,
    action: Exclude<RefundAction, "approve">,
    key: string,
    hash: string,
  ): Promise<Stage> {
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, key);
      const replay = await tx.idempotency.findUnique({
        where: { actorId_operation_key: { actorId, operation: OPERATION, key } },
      });
      if (replay?.requestHash !== undefined && replay.requestHash !== hash)
        throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different refund action.");

      const state = await this.lockRefundAuthority(tx, refundId);
      this.providers.require(state.refund.provider, state.refund.method as ElectronicPaymentMethod);
      let execution = state.execution;

      if (action === "execute") {
        if (!execution) {
          if (state.refund.status !== "approved")
            throw new ApiProblem(409, "CONFLICT", "Refund must be approved before execution.");
          execution = await tx.refundExecution.create({ data: {
            refundId,
            provider: state.refund.provider,
            method: state.refund.method,
            currency: "GHS",
            amountMinor: state.refund.amountMinor,
            merchantRefundReference: merchantRefundReference(),
            originalPaymentMerchantReference: state.capture.merchantReference,
            originalPaymentProviderReference: state.capture.providerRef,
            status: "created",
            reconciliationState: "unreconciled",
          } });
          await tx.auditEvent.create({ data: {
            actorId, action: "refund.execution_created", entityId: refundId, requestId: req.requestId,
            details: { executionId: execution.id, orderId: state.order.id },
          } });
          await tx.outboxEvent.create({ data: {
            type: "refund.execution_created", aggregateId: refundId,
            payload: { refundId, executionId: execution.id, orderId: state.order.id },
          } });
        }

        const current = this.response(state.refund, execution, state.order.paymentStatus);
        await this.persistReplay(tx, actorId, key, hash, current);
        if (execution.status === "succeeded" || state.refund.status === "succeeded")
          return { kind: "direct", outcome: current } as Stage;
        if (execution.status === "created" && execution.attemptCount === 0 && state.refund.status === "approved")
          return { kind: "execute", snapshot: this.snapshot(state, execution), trigger: "execute" } as Stage;
        if (execution.status === "pending")
          return replay ? { kind: "direct", outcome: this.parseReplay(replay.outcome) } as Stage : { kind: "direct", outcome: current } as Stage;
        return { kind: "lookup", snapshot: this.snapshot(state, execution), trigger: "execute_recovery" } as Stage;
      }

      if (!execution)
        throw new ApiProblem(409, "CONFLICT", "Refund execution does not exist.");
      const current = this.response(state.refund, execution, state.order.paymentStatus);
      await this.persistReplay(tx, actorId, key, hash, current);
      if (execution.status === "succeeded" || state.refund.status === "succeeded")
        return { kind: "direct", outcome: current } as Stage;
      return {
        kind: "lookup",
        snapshot: this.snapshot(state, execution),
        trigger: action === "retry" ? "retry" : "manual_reconcile",
      } as Stage;
    }, { timeout: 15_000 });
  }

  private async markAttemptStarted(executionId: string) {
    await this.db.$transaction(async (tx) => {
      const seed = await tx.refundExecution.findUnique({ where: { id: executionId }, select: { refundId: true } });
      if (!seed) throw new ApiProblem(404, "NOT_FOUND", "Refund execution not found.");
      const state = await this.lockRefundAuthority(tx, seed.refundId);
      const execution = state.execution;
      if (!execution || execution.id !== executionId)
        throw new ApiProblem(409, "CONFLICT", "Refund execution changed before provider call.");
      await tx.refundExecution.update({
        where: { id: executionId }, data: { attemptCount: { increment: 1 }, version: { increment: 1 } },
      });
    }, { timeout: 15_000 });
  }

  private async markUncertain(req: ApiRequest, actorId: string, refundId: string): Promise<RefundActionResponse> {
    return this.db.$transaction(async (tx) => {
      const state = await this.lockRefundAuthority(tx, refundId);
      if (!state.execution)
        throw new ApiProblem(409, "CONFLICT", "Refund execution does not exist.");
      const refund = state.refund.status === "succeeded" ? state.refund : await tx.refund.update({
        where: { id: refundId },
        data: { status: "requires_review", failureReason: "Refund provider outcome is uncertain.", version: { increment: 1 } },
      });
      const execution = state.execution.status === "succeeded" ? state.execution : await tx.refundExecution.update({
        where: { id: state.execution.id },
        data: { status: "uncertain", reconciliationState: "exception", version: { increment: 1 } },
      });
      if (state.refund.status !== "requires_review" && state.refund.status !== "succeeded") {
        await tx.auditEvent.create({ data: {
          actorId, action: "refund.execution_uncertain", entityId: refundId, requestId: req.requestId,
          details: { executionId: execution.id, orderId: state.order.id },
        } });
        await tx.outboxEvent.create({ data: {
          type: "refund.execution_uncertain", aggregateId: refundId,
          payload: { refundId, executionId: execution.id, orderId: state.order.id },
        } });
      }
      return this.response(refund, execution, state.order.paymentStatus);
    }, { timeout: 15_000 });
  }

  private initiationObservation(snapshot: Snapshot, result: RefundProviderInitiationResult): RefundProviderObservation {
    if (result.kind === "rejected") return {
      providerId: snapshot.execution.provider,
      merchantRefundReference: snapshot.execution.merchantRefundReference,
      state: "failed",
      failureCode: result.failureCode,
      customerSafeMessage: result.customerSafeMessage,
    };
    if (result.state === "pending") return {
      providerId: snapshot.execution.provider,
      merchantRefundReference: snapshot.execution.merchantRefundReference,
      providerRefundReference: result.providerRefundReference,
      state: "pending",
    };
    return {
      providerId: snapshot.execution.provider,
      merchantRefundReference: snapshot.execution.merchantRefundReference,
      providerRefundReference: result.providerRefundReference,
      state: "succeeded",
      amountMinor: result.amountMinor,
      currency: result.currency,
    };
  }

  private async currentResponse(refundId: string): Promise<RefundActionResponse> {
    const refund = await this.db.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new ApiProblem(404, "NOT_FOUND", "Refund not found.");
    const [execution, order] = await Promise.all([
      this.db.refundExecution.findUnique({ where: { refundId } }),
      this.db.order.findUniqueOrThrow({ where: { id: refund.orderId }, select: { paymentStatus: true } }),
    ]);
    return this.response(refund, execution, order.paymentStatus);
  }

  private async saveLatest(actorId: string, key: string, hash: string, outcome: RefundActionResponse) {
    await this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, key);
      await this.persistReplay(tx, actorId, key, hash, outcome);
    });
  }

  private async applyObservation(
    req: ApiRequest,
    actorId: string,
    snapshot: Snapshot,
    observation: RefundProviderObservation,
    trigger: "execute" | "retry" | "manual_reconcile",
  ) {
    return this.db.$transaction(
      (tx) => this.outcomes.apply(tx, snapshot.execution.id, observation, {
        actorId, requestId: req.requestId, trigger,
      }),
      { timeout: 15_000 },
    );
  }

  private async executeProvider(req: ApiRequest, actorId: string, snapshot: Snapshot, trigger: "execute" | "retry") {
    const adapter = this.providers.require(snapshot.execution.provider, snapshot.execution.method as ElectronicPaymentMethod);
    const settled = adapter.initiateRefund({
      refundId: snapshot.refund.id,
      executionId: snapshot.execution.id,
      merchantRefundReference: snapshot.execution.merchantRefundReference,
      originalPaymentMerchantReference: snapshot.execution.originalPaymentMerchantReference,
      originalPaymentProviderReference: snapshot.execution.originalPaymentProviderReference ?? undefined,
      originalPaymentAmountMinor: snapshot.capture.amountMinor,
      originalPaymentResolvedAt: snapshot.capture.resolvedAt ?? undefined,
      orderReference: snapshot.orderReference,
      method: snapshot.execution.method as ElectronicPaymentMethod,
      amountMinor: snapshot.execution.amountMinor,
      currency: "GHS",
      signal: AbortSignal.timeout(this.timeoutMs()),
    }).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );
    // Await provider I/O with no database transaction/row lock held. The attempt
    // counter advances only after the provider-call promise has actually existed.
    const result = await settled;
    await this.markAttemptStarted(snapshot.execution.id);
    if (!result.ok) return this.markUncertain(req, actorId, snapshot.refund.id);
    try {
      await this.applyObservation(req, actorId, snapshot, this.initiationObservation(snapshot, result.value), trigger);
      return this.currentResponse(snapshot.refund.id);
    } catch {
      return this.markUncertain(req, actorId, snapshot.refund.id);
    }
  }

  private observationResult(snapshot: Snapshot, observation: RefundProviderObservation) {
    const mismatch =
      observation.providerId !== snapshot.execution.provider ||
      observation.merchantRefundReference !== snapshot.execution.merchantRefundReference ||
      (snapshot.execution.providerRefundReference && observation.providerRefundReference && snapshot.execution.providerRefundReference !== observation.providerRefundReference) ||
      (observation.amountMinor !== undefined && observation.amountMinor !== snapshot.execution.amountMinor) ||
      (observation.currency !== undefined && observation.currency !== snapshot.execution.currency) ||
      (observation.state === "succeeded" && (observation.amountMinor === undefined || observation.currency === undefined));
    if (mismatch) return "exception" as const;
    if (observation.state === "succeeded") return "matched" as const;
    if (observation.state === "pending") return "pending" as const;
    if (observation.state === "failed") return "failed" as const;
    if (observation.state === "not_found") return "no_record" as const;
    return "exception" as const;
  }

  private async recordReconciliation(
    snapshot: Snapshot,
    observation: RefundProviderObservation,
    trigger: "execute_recovery" | "retry" | "manual_reconcile",
    requestId: string,
  ) {
    await this.db.refundReconciliation.create({ data: {
      refundId: snapshot.refund.id,
      refundExecutionId: snapshot.execution.id,
      provider: snapshot.execution.provider,
      trigger,
      observedState: observation.state,
      providerRefundReference: observation.providerRefundReference,
      observedAmountMinor: observation.amountMinor,
      observedCurrency: observation.currency,
      result: this.observationResult(snapshot, observation),
      safeNote: observation.customerSafeMessage,
      requestId,
    } });
  }

  private mayResend(adapter: RefundProviderAdapter, state: RefundProviderObservation["state"]) {
    const capabilities = adapter.capabilities();
    return (
      (state === "failed" && capabilities.safeRetryAfterDefinitiveFailure) ||
      (state === "not_found" && capabilities.safeRetryAfterNoRecord) ||
      (state === "unknown" && capabilities.safeRetryAfterUnknown)
    );
  }

  private async lookupProvider(
    req: ApiRequest,
    actorId: string,
    snapshot: Snapshot,
    trigger: "execute_recovery" | "retry" | "manual_reconcile",
  ): Promise<{ outcome: RefundActionResponse; resend: boolean }> {
    const adapter = this.providers.require(snapshot.execution.provider, snapshot.execution.method as ElectronicPaymentMethod);
    let observation: RefundProviderObservation;
    try {
      observation = await adapter.lookupRefund({
        merchantRefundReference: snapshot.execution.merchantRefundReference,
        providerRefundReference: snapshot.execution.providerRefundReference ?? undefined,
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    } catch {
      observation = {
        providerId: snapshot.execution.provider,
        merchantRefundReference: snapshot.execution.merchantRefundReference,
        providerRefundReference: snapshot.execution.providerRefundReference ?? undefined,
        state: "unknown",
        customerSafeMessage: "Provider refund lookup could not be completed.",
      };
      await this.recordReconciliation(snapshot, observation, trigger, req.requestId);
      return { outcome: await this.markUncertain(req, actorId, snapshot.refund.id), resend: false };
    }
    await this.recordReconciliation(snapshot, observation, trigger, req.requestId);
    const outcomeTrigger = trigger === "manual_reconcile" ? "manual_reconcile" : trigger === "retry" ? "retry" : "execute";
    try {
      await this.applyObservation(req, actorId, snapshot, observation, outcomeTrigger);
    } catch {
      return { outcome: await this.markUncertain(req, actorId, snapshot.refund.id), resend: false };
    }
    const outcome = await this.currentResponse(snapshot.refund.id);
    const resend = trigger === "retry" && this.mayResend(adapter, observation.state);
    return { outcome, resend };
  }

  async apply(
    req: ApiRequest,
    actorId: string,
    refundId: string,
    action: RefundAction,
    idempotencyKey: string,
  ): Promise<RefundActionResponse> {
    const hash = semanticHash(refundId, action);
    if (action === "approve") {
      const stage = await this.approve(req, actorId, refundId, idempotencyKey, hash);
      if (stage.kind !== "direct") throw new ApiProblem(409, "CONFLICT", "Refund approval state is incomplete.");
      return stage.outcome;
    }

    const stage = await this.stageNetworkAction(req, actorId, refundId, action, idempotencyKey, hash);
    if (stage.kind === "direct") return stage.outcome;

    let outcome: RefundActionResponse;
    if (stage.kind === "execute") {
      outcome = await this.executeProvider(req, actorId, stage.snapshot, stage.trigger);
    } else {
      const lookedUp = await this.lookupProvider(req, actorId, stage.snapshot, stage.trigger);
      outcome = lookedUp.outcome;
      if (lookedUp.resend) {
        const latest = await this.db.refundExecution.findUniqueOrThrow({ where: { id: stage.snapshot.execution.id } });
        const retrySnapshot = { ...stage.snapshot, execution: latest, refund: await this.db.refund.findUniqueOrThrow({ where: { id: refundId } }) };
        outcome = await this.executeProvider(req, actorId, retrySnapshot, "retry");
      }
    }
    await this.saveLatest(actorId, idempotencyKey, hash, outcome);
    return outcome;
  }
}
