import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  electronicPaymentMethodSchema,
  type ElectronicPaymentMethod,
  type PaymentInitiationRequest,
  type PaymentInitiationResult,
  type PaymentProviderAction,
} from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import type { CheckoutPrincipal } from "../commerce-identity/checkout-principal.service";
import { Database } from "../database/database";
import { ApiProblem, type ApiRequest } from "../http/errors";
import { PaymentPolicyService } from "./payment-policy.service";
import type {
  PaymentProviderAdapter,
  PaymentProviderObservation,
} from "./payment-provider";

const OPERATION = "payments.initiate";
const LIVE_ATTEMPTS = ["initiated", "pending"] as const;
const MONEY_FINAL = new Set([
  "succeeded",
  "requires_review",
  "partially_refunded",
  "refund_pending",
  "refunded",
]);

interface StageAResult {
  attemptId: string;
  isNew: boolean;
}

function requestHash(orderId: string, input: PaymentInitiationRequest) {
  return createHash("sha256")
    .update(JSON.stringify({ orderId, payerPhone: input.payerPhone ?? null }))
    .digest("hex");
}

function merchantReference() {
  return `VG-PAY-${randomUUID().replaceAll("-", "").toUpperCase()}`;
}

@Injectable()
export class PaymentInitiationService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly policy: PaymentPolicyService,
  ) {}

  private paymentConfig() {
    if (!this.config.payments)
      throw new ApiProblem(503, "UNAVAILABLE", "Electronic payments are not configured.");
    return this.config.payments;
  }

  private owns(
    principal: CheckoutPrincipal,
    order: { customerUserId: string | null; guestSessionId: string | null },
  ) {
    return principal.kind === "customer"
      ? order.customerUserId === principal.userId
      : order.guestSessionId === principal.guestSessionId;
  }

  private method(value: string): ElectronicPaymentMethod {
    const parsed = electronicPaymentMethodSchema.safeParse(value);
    if (!parsed.success)
      throw new ApiProblem(422, "RULE_VIOLATION", "This order does not use an electronic payment method.");
    return parsed.data;
  }

  private async lockOrder(tx: Prisma.TransactionClient, orderId: string) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
    return tx.order.findUnique({ where: { id: orderId } });
  }

  private async lockAttempts(tx: Prisma.TransactionClient, orderId: string) {
    await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE "orderId"=${orderId} ORDER BY id FOR UPDATE`;
    return tx.paymentAttempt.findMany({ where: { orderId }, orderBy: { id: "asc" } });
  }

  private async stageA(
    req: ApiRequest,
    principal: CheckoutPrincipal,
    orderId: string,
    input: PaymentInitiationRequest,
    key: string,
  ): Promise<StageAResult> {
    const hash = requestHash(orderId, input);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([principal.actorScope, OPERATION, key])},0))`;
      const replay = await tx.idempotency.findUnique({
        where: { actorId_operation_key: { actorId: principal.actorScope, operation: OPERATION, key } },
      });
      if (replay) {
        if (replay.requestHash !== hash)
          throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with different payment input.");
        const outcome = replay.outcome as { attemptId?: string };
        if (!outcome.attemptId)
          throw new ApiProblem(409, "CONFLICT", "Payment replay state is incomplete.");
        return { attemptId: outcome.attemptId, isNew: false };
      }

      const order = await this.lockOrder(tx, orderId);
      if (!order || !this.owns(principal, order))
        throw new ApiProblem(404, "NOT_FOUND", "Order not found.");
      const method = this.method(order.paymentMethod);
      const adapter = this.policy.assertElectronicMethodAvailable(method);
      if (
        order.fulfilmentStatus === "cancelled" ||
        order.stockConsumedAt ||
        MONEY_FINAL.has(order.paymentStatus)
      )
        throw new ApiProblem(409, "RULE_VIOLATION", "This order cannot start another payment attempt.");

      const attempts = await this.lockAttempts(tx, orderId);
      if (attempts.some((attempt) => LIVE_ATTEMPTS.includes(attempt.status as (typeof LIVE_ATTEMPTS)[number])))
        throw new ApiProblem(409, "RULE_VIOLATION", "A payment attempt is already in progress for this order.");
      if (attempts.some((attempt) => attempt.status === "succeeded"))
        throw new ApiProblem(409, "RULE_VIOLATION", "This order already has a successful payment attempt.");

      const attemptId = randomUUID();
      const attempt = await tx.paymentAttempt.create({
        data: {
          id: attemptId,
          orderId,
          provider: adapter.id,
          method,
          currency: "GHS",
          amountMinor: order.totalMinor,
          merchantReference: merchantReference(),
          status: "initiated",
          initiationState: "created",
          settlementState: "unsettled",
        },
      });
      if (order.paymentStatus === "failed" || order.paymentStatus === "expired" || order.paymentStatus === "unpaid")
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "pending" } });
      await tx.auditEvent.create({
        data: {
          actorId: principal.actorId,
          action: "payment.attempt_created",
          entityId: attemptId,
          requestId: req.requestId,
          details: { orderId, provider: adapter.id, method, amountMinor: order.totalMinor, currency: "GHS" },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: "payment.attempt_created",
          aggregateId: attemptId,
          payload: { attemptId, orderId, provider: adapter.id, method, amountMinor: order.totalMinor, currency: "GHS" },
        },
      });
      await tx.idempotency.create({
        data: {
          actorId: principal.actorScope,
          operation: OPERATION,
          key,
          requestHash: hash,
          outcome: { attemptId },
        },
      });
      return { attemptId: attempt.id, isNew: true };
    }, { timeout: 15_000 });
  }

  private async snapshot(attemptId: string) {
    const attempt = await this.db.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: { order: { select: { id: true, reference: true, customerPhone: true, paymentStatus: true } } },
    });
    if (!attempt) throw new ApiProblem(409, "CONFLICT", "Payment attempt no longer exists.");
    return attempt;
  }

  private response(
    attempt: Awaited<ReturnType<PaymentInitiationService["snapshot"]>>,
    action: PaymentProviderAction = { kind: "none" },
  ): PaymentInitiationResult {
    return {
      attemptId: attempt.id,
      method: this.method(attempt.method),
      attemptStatus: attempt.status,
      paymentStatus: attempt.order.paymentStatus,
      action,
    };
  }

  private async updateAccepted(
    req: ApiRequest,
    attemptId: string,
    providerReference: string | undefined,
    action: PaymentProviderAction,
    expiresAt?: Date,
  ) {
    await this.db.$transaction(async (tx) => {
      const current = await tx.paymentAttempt.findUnique({ where: { id: attemptId }, select: { orderId: true } });
      if (!current) return;
      await this.lockOrder(tx, current.orderId);
      await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE id=${attemptId} FOR UPDATE`;
      const locked = await tx.paymentAttempt.findUnique({ where: { id: attemptId } });
      if (!locked || !LIVE_ATTEMPTS.includes(locked.status as (typeof LIVE_ATTEMPTS)[number])) return;
      await tx.paymentAttempt.update({
        where: { id: attemptId },
        data: {
          providerRef: providerReference,
          status: "pending",
          initiationState: "accepted",
          settlementState: "unsettled",
          providerExpiresAt: expiresAt,
          failureCode: null,
          failureReason: null,
          version: { increment: 1 },
        },
      });
      await tx.order.update({ where: { id: current.orderId }, data: { paymentStatus: "pending" } });
      await tx.auditEvent.create({
        data: { actorId: "payment-provider", action: "payment.initiation_pending", entityId: attemptId, requestId: req.requestId, details: { providerReference: providerReference ?? null, action: action.kind } },
      });
      await tx.outboxEvent.create({
        data: { type: "payment.initiation_pending", aggregateId: attemptId, payload: { attemptId, orderId: current.orderId, providerReference: providerReference ?? null } },
      });
    });
  }

  private async updateRejected(
    req: ApiRequest,
    attemptId: string,
    failureCode?: string,
    customerSafeMessage?: string,
  ) {
    await this.db.$transaction(async (tx) => {
      const current = await tx.paymentAttempt.findUnique({ where: { id: attemptId }, select: { orderId: true } });
      if (!current) return;
      await this.lockOrder(tx, current.orderId);
      await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE id=${attemptId} FOR UPDATE`;
      const locked = await tx.paymentAttempt.findUnique({ where: { id: attemptId } });
      if (!locked || !LIVE_ATTEMPTS.includes(locked.status as (typeof LIVE_ATTEMPTS)[number])) return;
      await tx.paymentAttempt.update({
        where: { id: attemptId },
        data: {
          status: "failed",
          initiationState: "rejected",
          failureCode: failureCode ?? null,
          failureReason: customerSafeMessage ?? "Payment request was declined.",
          resolvedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.order.update({ where: { id: current.orderId }, data: { paymentStatus: "failed" } });
      await tx.auditEvent.create({
        data: { actorId: "payment-provider", action: "payment.initiation_failed", entityId: attemptId, requestId: req.requestId, details: { failureCode: failureCode ?? null } },
      });
      await tx.outboxEvent.create({
        data: { type: "payment.initiation_failed", aggregateId: attemptId, payload: { attemptId, orderId: current.orderId, failureCode: failureCode ?? null } },
      });
    });
  }

  private async updateUncertain(req: ApiRequest, attemptId: string) {
    await this.db.$transaction(async (tx) => {
      const current = await tx.paymentAttempt.findUnique({ where: { id: attemptId }, select: { orderId: true } });
      if (!current) return;
      await this.lockOrder(tx, current.orderId);
      await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE id=${attemptId} FOR UPDATE`;
      const locked = await tx.paymentAttempt.findUnique({ where: { id: attemptId } });
      if (!locked || !LIVE_ATTEMPTS.includes(locked.status as (typeof LIVE_ATTEMPTS)[number])) return;
      await tx.paymentAttempt.update({
        where: { id: attemptId },
        data: { initiationState: "uncertain", settlementState: "exception", version: { increment: 1 } },
      });
      await tx.auditEvent.create({
        data: { actorId: "payment-provider", action: "payment.initiation_uncertain", entityId: attemptId, requestId: req.requestId, details: { reconciliationRequired: true } },
      });
      await tx.outboxEvent.create({
        data: { type: "payment.initiation_uncertain", aggregateId: attemptId, payload: { attemptId, orderId: current.orderId } },
      });
    });
  }

  private observationMatches(
    attempt: Awaited<ReturnType<PaymentInitiationService["snapshot"]>>,
    adapter: PaymentProviderAdapter,
    observation: PaymentProviderObservation,
  ) {
    return (
      observation.providerId === adapter.id &&
      observation.merchantReference === attempt.merchantReference &&
      (observation.amountMinor === undefined || observation.amountMinor === attempt.amountMinor) &&
      (observation.currency === undefined || observation.currency === "GHS")
    );
  }

  private async applyReplayLookup(
    req: ApiRequest,
    attempt: Awaited<ReturnType<PaymentInitiationService["snapshot"]>>,
    adapter: PaymentProviderAdapter,
  ): Promise<"resolved" | "retry" | "exception"> {
    let observation: PaymentProviderObservation;
    try {
      observation = await adapter.lookup({
        merchantReference: attempt.merchantReference,
        providerReference: attempt.providerRef ?? undefined,
        signal: AbortSignal.timeout(this.paymentConfig().requestTimeoutMs),
      });
    } catch {
      await this.updateUncertain(req, attempt.id);
      return "exception";
    }
    if (!this.observationMatches(attempt, adapter, observation)) {
      await this.updateUncertain(req, attempt.id);
      return "exception";
    }
    if (observation.state === "pending") {
      await this.updateAccepted(req, attempt.id, observation.providerReference, { kind: "none" });
      return "resolved";
    }
    if (observation.state === "failed" || observation.state === "expired") {
      await this.updateRejected(req, attempt.id, observation.failureCode, observation.customerSafeMessage);
      if (observation.state === "expired") {
        await this.db.$transaction(async (tx) => {
          const current = await tx.paymentAttempt.findUnique({ where: { id: attempt.id }, select: { orderId: true } });
          if (!current) return;
          await this.lockOrder(tx, current.orderId);
          await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE id=${attempt.id} FOR UPDATE`;
          await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "expired", version: { increment: 1 } } });
          await tx.order.update({ where: { id: current.orderId }, data: { paymentStatus: "expired" } });
        });
      }
      return "resolved";
    }
    if (observation.state === "succeeded") {
      await this.updateUncertain(req, attempt.id);
      return "exception";
    }
    return adapter.capabilities().safeInitiationRetry ? "retry" : "exception";
  }

  private async callProvider(
    req: ApiRequest,
    attempt: Awaited<ReturnType<PaymentInitiationService["snapshot"]>>,
    adapter: PaymentProviderAdapter,
    payerPhone?: string,
  ): Promise<PaymentProviderAction> {
    try {
      const result = await adapter.initiate({
        attemptId: attempt.id,
        merchantReference: attempt.merchantReference,
        orderReference: attempt.order.reference,
        method: this.method(attempt.method),
        amountMinor: attempt.amountMinor,
        currency: "GHS",
        payerPhone: payerPhone ?? attempt.order.customerPhone,
        signal: AbortSignal.timeout(this.paymentConfig().requestTimeoutMs),
      });
      if (result.kind === "rejected") {
        await this.updateRejected(req, attempt.id, result.failureCode, result.customerSafeMessage);
        return { kind: "none" };
      }
      const action = this.policy.validateProviderAction(result.action);
      await this.updateAccepted(req, attempt.id, result.providerReference, action, result.expiresAt);
      return action;
    } catch {
      await this.updateUncertain(req, attempt.id);
      return { kind: "none" };
    }
  }

  async initiate(
    req: ApiRequest,
    principal: CheckoutPrincipal,
    orderId: string,
    input: PaymentInitiationRequest,
    key: string,
  ): Promise<PaymentInitiationResult> {
    const stage = await this.stageA(req, principal, orderId, input, key);
    let attempt = await this.snapshot(stage.attemptId);
    const adapter = this.policy.assertElectronicMethodAvailable(this.method(attempt.method));
    if (adapter.id !== attempt.provider)
      throw new ApiProblem(503, "UNAVAILABLE", "The payment provider for this attempt is unavailable.");

    let action: PaymentProviderAction = { kind: "none" };
    if (stage.isNew) {
      action = await this.callProvider(req, attempt, adapter, input.payerPhone);
    } else if (attempt.status === "initiated" && ["created", "uncertain"].includes(attempt.initiationState)) {
      const recovery = await this.applyReplayLookup(req, attempt, adapter);
      if (recovery === "retry") {
        attempt = await this.snapshot(stage.attemptId);
        action = await this.callProvider(req, attempt, adapter, input.payerPhone);
      }
    }
    attempt = await this.snapshot(stage.attemptId);
    return this.response(attempt, action);
  }
}
