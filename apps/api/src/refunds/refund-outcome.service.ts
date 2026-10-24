import { Injectable } from "@nestjs/common";
import type { Prisma, Refund, RefundExecution } from "@prisma/client";
import type { RefundSourceType, RefundStatus } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { PaymentCaptureService, type PaymentCaptureState } from "../payments/payment-capture.service";
import { PaymentRefundProjectionService } from "../payments/payment-refund-projection.service";
import type { RefundProviderObservation } from "../payments/refund-provider";

export interface RefundOutcomeContext {
  actorId: string;
  requestId: string;
  trigger: "execute" | "retry" | "manual_reconcile" | "provider_callback";
}

export interface RefundOutcomeResult {
  processingResult: "applied" | "pending" | "failed" | "exception" | "duplicate";
  refundStatus: string;
  executionStatus: string;
  orderPaymentStatus: string;
}

type LockedAuthority = {
  order: { id: string; totalMinor: number; fulfilmentStatus: string; paymentStatus: string };
  captures: PaymentCaptureState;
  refund: Refund;
  execution: RefundExecution;
};

@Injectable()
export class RefundOutcomeService {
  constructor(
    private readonly captureService: PaymentCaptureService,
    private readonly projection: PaymentRefundProjectionService,
  ) {}

  private async lockAuthority(tx: Prisma.TransactionClient, executionId: string): Promise<LockedAuthority> {
    const seed = await tx.refundExecution.findUnique({
      where: { id: executionId },
      select: { refund: { select: { orderId: true } } },
    });
    if (!seed) throw new ApiProblem(404, "NOT_FOUND", "Refund execution not found.");
    const orderId = seed.refund.orderId;

    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
    const captures = await this.captureService.lockForOrder(tx, orderId);
    await tx.$queryRaw`SELECT id FROM "Refund" WHERE "orderId"=${orderId} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT e.id FROM "RefundExecution" e JOIN "Refund" r ON r.id=e."refundId" WHERE r."orderId"=${orderId} ORDER BY e.id FOR UPDATE OF e`;

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { id: true, totalMinor: true, fulfilmentStatus: true, paymentStatus: true },
    });
    const execution = await tx.refundExecution.findUnique({ where: { id: executionId } });
    if (!execution) throw new ApiProblem(404, "NOT_FOUND", "Refund execution not found.");
    const refund = await tx.refund.findUnique({ where: { id: execution.refundId } });
    if (!refund || refund.orderId !== orderId)
      throw new ApiProblem(409, "CONFLICT", "Refund execution authority is inconsistent.");

    const capture = captures.successfulCaptures.find((row) => row.id === refund.paymentAttemptId);
    if (!capture || capture.orderId !== orderId || capture.provider !== refund.provider || capture.method !== refund.method || capture.currency !== refund.currency)
      throw new ApiProblem(409, "CONFLICT", "Refund is not backed by matching successful payment capture truth.");

    return { order, captures, refund, execution };
  }

  private mismatch(execution: RefundExecution, observation: RefundProviderObservation) {
    if (observation.providerId !== execution.provider) return "provider";
    if (observation.merchantRefundReference !== execution.merchantRefundReference) return "merchant_reference";
    if (
      execution.providerRefundReference &&
      observation.providerRefundReference &&
      observation.providerRefundReference !== execution.providerRefundReference
    ) return "provider_reference";
    if (observation.amountMinor !== undefined && observation.amountMinor !== execution.amountMinor) return "amount";
    if (observation.currency !== undefined && observation.currency !== execution.currency) return "currency";
    if (
      observation.state === "succeeded" &&
      (observation.amountMinor === undefined || observation.currency === undefined)
    ) return "missing_money_identity";
    return null;
  }

  private async emit(
    tx: Prisma.TransactionClient,
    context: RefundOutcomeContext,
    refundId: string,
    orderId: string,
    type: string,
    details: Record<string, unknown>,
  ) {
    await tx.auditEvent.create({
      data: {
        actorId: context.actorId,
        action: type,
        entityId: refundId,
        requestId: context.requestId,
        details: { orderId, ...details },
      },
    });
    await tx.outboxEvent.create({
      data: {
        type,
        aggregateId: refundId,
        payload: { refundId, orderId, ...details },
      },
    });
  }

  private async project(
    tx: Prisma.TransactionClient,
    state: LockedAuthority,
    currentPaymentStatus = state.order.paymentStatus,
  ) {
    const rows = await tx.refund.findMany({
      where: { orderId: state.order.id },
      orderBy: { id: "asc" },
      select: { amountMinor: true, status: true, sourceType: true },
    });
    return this.projection.apply(tx, {
      order: {
        id: state.order.id,
        totalMinor: state.order.totalMinor,
        fulfilmentStatus: state.order.fulfilmentStatus,
        paymentStatus: currentPaymentStatus,
      },
      captures: state.captures.successfulCaptures.map((capture) => ({
        id: capture.id,
        amountMinor: capture.amountMinor,
      })),
      refunds: rows.map((refund) => ({
        amountMinor: refund.amountMinor,
        status: refund.status as RefundStatus,
        sourceType: refund.sourceType as RefundSourceType,
      })),
    });
  }

  private async reviewMismatch(
    tx: Prisma.TransactionClient,
    state: LockedAuthority,
    context: RefundOutcomeContext,
    reason: string,
  ): Promise<RefundOutcomeResult> {
    const first = state.refund.status !== "requires_review" || state.execution.reconciliationState !== "exception";
    if (state.refund.status !== "requires_review") {
      await tx.refund.update({
        where: { id: state.refund.id },
        data: {
          status: "requires_review",
          failureReason: "Provider refund evidence requires review.",
          version: { increment: 1 },
        },
      });
    }
    if (state.execution.reconciliationState !== "exception") {
      await tx.refundExecution.update({
        where: { id: state.execution.id },
        data: { reconciliationState: "exception", version: { increment: 1 } },
      });
    }
    if (first)
      await this.emit(tx, context, state.refund.id, state.order.id, "refund.requires_review", { reason });
    const orderPaymentStatus = await this.project(tx, state);
    return {
      processingResult: "exception",
      refundStatus: "requires_review",
      executionStatus: state.execution.status,
      orderPaymentStatus,
    };
  }

  private async conflict(
    tx: Prisma.TransactionClient,
    state: LockedAuthority,
    observation: RefundProviderObservation,
    context: RefundOutcomeContext,
  ): Promise<RefundOutcomeResult> {
    const first = state.execution.reconciliationState !== "exception";
    if (first) {
      await tx.refundExecution.update({
        where: { id: state.execution.id },
        data: { reconciliationState: "exception", version: { increment: 1 } },
      });
      await this.emit(tx, context, state.refund.id, state.order.id, "refund.outcome_conflict", {
        priorStatus: state.execution.status,
        observedState: observation.state,
      });
    }
    // A verified succeeded refund is irreversible. Conflicting later evidence is an
    // operational exception, not permission to pretend returned money was never sent.
    if (state.refund.status !== "succeeded" && state.refund.status !== "requires_review") {
      await tx.refund.update({
        where: { id: state.refund.id },
        data: {
          status: "requires_review",
          failureReason: "Conflicting terminal provider refund evidence.",
          version: { increment: 1 },
        },
      });
    }
    const orderPaymentStatus = await this.project(tx, state);
    const refundStatus = state.refund.status === "succeeded" ? "succeeded" : "requires_review";
    return {
      processingResult: "exception",
      refundStatus,
      executionStatus: state.execution.status,
      orderPaymentStatus,
    };
  }

  private async applyPending(
    tx: Prisma.TransactionClient,
    state: LockedAuthority,
    observation: RefundProviderObservation,
    context: RefundOutcomeContext,
  ): Promise<RefundOutcomeResult> {
    const changed = state.refund.status !== "processing" || state.execution.status !== "pending";
    if (state.refund.status !== "processing")
      await tx.refund.update({
        where: { id: state.refund.id },
        data: { status: "processing", failureReason: null, resolvedAt: null, version: { increment: 1 } },
      });
    if (state.execution.status !== "pending" || (!state.execution.providerRefundReference && observation.providerRefundReference))
      await tx.refundExecution.update({
        where: { id: state.execution.id },
        data: {
          status: "pending",
          providerRefundReference: state.execution.providerRefundReference ?? observation.providerRefundReference,
          failureCode: null,
          failureReason: null,
          resolvedAt: null,
          version: { increment: 1 },
        },
      });
    if (changed)
      await this.emit(tx, context, state.refund.id, state.order.id, "refund.pending", {});
    const orderPaymentStatus = await this.project(tx, state);
    return {
      processingResult: "pending",
      refundStatus: "processing",
      executionStatus: "pending",
      orderPaymentStatus,
    };
  }

  private async applySuccess(
    tx: Prisma.TransactionClient,
    state: LockedAuthority,
    observation: RefundProviderObservation,
    context: RefundOutcomeContext,
  ): Promise<RefundOutcomeResult> {
    await tx.refund.update({
      where: { id: state.refund.id },
      data: {
        status: "succeeded",
        failureReason: null,
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await tx.refundExecution.update({
      where: { id: state.execution.id },
      data: {
        status: "succeeded",
        reconciliationState: "reconciled",
        providerRefundReference: state.execution.providerRefundReference ?? observation.providerRefundReference,
        failureCode: null,
        failureReason: null,
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.emit(tx, context, state.refund.id, state.order.id, "refund.succeeded", {});
    const orderPaymentStatus = await this.project(tx, state);
    return {
      processingResult: "applied",
      refundStatus: "succeeded",
      executionStatus: "succeeded",
      orderPaymentStatus,
    };
  }

  private async applyFailure(
    tx: Prisma.TransactionClient,
    state: LockedAuthority,
    observation: RefundProviderObservation,
    context: RefundOutcomeContext,
  ): Promise<RefundOutcomeResult> {
    const reason = observation.customerSafeMessage ?? "Refund transfer failed.";
    await tx.refund.update({
      where: { id: state.refund.id },
      data: {
        status: "failed",
        failureReason: reason,
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await tx.refundExecution.update({
      where: { id: state.execution.id },
      data: {
        status: "failed",
        reconciliationState: "reconciled",
        providerRefundReference: state.execution.providerRefundReference ?? observation.providerRefundReference,
        failureCode: observation.failureCode ?? null,
        failureReason: reason,
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.emit(tx, context, state.refund.id, state.order.id, "refund.failed", {
      failureCode: observation.failureCode ?? null,
    });
    const orderPaymentStatus = await this.project(tx, state);
    return {
      processingResult: "failed",
      refundStatus: "failed",
      executionStatus: "failed",
      orderPaymentStatus,
    };
  }

  async apply(
    tx: Prisma.TransactionClient,
    executionId: string,
    observation: RefundProviderObservation,
    context: RefundOutcomeContext,
  ): Promise<RefundOutcomeResult> {
    const state = await this.lockAuthority(tx, executionId);
    const mismatch = this.mismatch(state.execution, observation);
    if (mismatch) {
      if (state.execution.status === "succeeded")
        return this.conflict(tx, state, observation, context);
      return this.reviewMismatch(tx, state, context, `provider_refund_evidence_mismatch_${mismatch}`);
    }

    if (state.execution.status === "succeeded") {
      if (observation.state === "succeeded")
        return {
          processingResult: "duplicate",
          refundStatus: state.refund.status,
          executionStatus: state.execution.status,
          orderPaymentStatus: state.order.paymentStatus,
        };
      return this.conflict(tx, state, observation, context);
    }
    if (state.execution.status === "failed") {
      if (observation.state === "failed") {
        if (state.refund.status === "succeeded")
          return this.conflict(tx, state, observation, context);
        if (state.refund.status !== "failed")
          return this.applyFailure(tx, state, observation, context);
        return {
          processingResult: "duplicate",
          refundStatus: "failed",
          executionStatus: "failed",
          orderPaymentStatus: state.order.paymentStatus,
        };
      }
      if (observation.state === "succeeded")
        return this.conflict(tx, state, observation, context);
    }

    if (observation.state === "pending")
      return this.applyPending(tx, state, observation, context);
    if (observation.state === "succeeded")
      return this.applySuccess(tx, state, observation, context);
    if (observation.state === "failed")
      return this.applyFailure(tx, state, observation, context);

    return this.reviewMismatch(tx, state, context, `provider_refund_state_${observation.state}`);
  }
}
