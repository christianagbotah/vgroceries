import { Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import type { RefundProviderObservation } from "../payments/refund-provider";
import { RefundOutcomeService } from "./refund-outcome.service";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(source: JsonRecord | null, ...keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function amountMinor(source: JsonRecord | null): number | undefined {
  const raw = source?.Amount ?? source?.amount;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return undefined;
  const minor = Math.round(raw * 100);
  return Math.abs(raw * 100 - minor) < 1e-7 ? minor : undefined;
}

@Injectable()
export class HubtelRefundCallbackService {
  constructor(
    private readonly db: Database,
    private readonly outcomes: RefundOutcomeService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private assertSecret(candidate: string) {
    const expected = this.config.hubtelRefund?.callbackSecret;
    if (!expected) throw new ApiProblem(404, "NOT_FOUND", "Refund callback is unavailable.");
    const left = Buffer.from(candidate, "utf8");
    const right = Buffer.from(expected, "utf8");
    if (left.length !== right.length || !timingSafeEqual(left, right))
      throw new ApiProblem(404, "NOT_FOUND", "Refund callback is unavailable.");
  }

  async apply(secret: string, body: unknown, requestId: string) {
    this.assertSecret(secret);
    const root = record(body);
    const data = record(root?.Data ?? root?.data);
    const responseCode = text(root, "ResponseCode", "responseCode");
    const originalOrderId = text(data, "OrderId", "orderId");
    if (!root || !data || !responseCode || !originalOrderId)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid Hubtel refund callback.");

    const executions = await this.db.refundExecution.findMany({
      where: { provider: "hubtel", originalPaymentProviderReference: originalOrderId },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    if (executions.length === 0)
      throw new ApiProblem(404, "NOT_FOUND", "Refund execution was not found.");
    if (executions.length !== 1)
      throw new ApiProblem(409, "CONFLICT", "Refund callback matched more than one execution.");
    const execution = executions[0]!;
    const providerRefundReference = text(data, "ExternalTransactionId", "externalTransactionId", "TransactionId", "transactionId");

    let observation: RefundProviderObservation;
    if (responseCode === "0000") {
      const observedAmountMinor = amountMinor(data);
      if (observedAmountMinor === undefined)
        throw new ApiProblem(400, "VALIDATION_FAILED", "Successful Hubtel refund callback requires a valid amount.");
      observation = {
        providerId: "hubtel",
        merchantRefundReference: execution.merchantRefundReference,
        ...(providerRefundReference ? { providerRefundReference } : {}),
        state: "succeeded",
        amountMinor: observedAmountMinor,
        currency: "GHS",
      };
    } else if (responseCode === "0001" || responseCode === "4515") {
      observation = {
        providerId: "hubtel",
        merchantRefundReference: execution.merchantRefundReference,
        ...(providerRefundReference ? { providerRefundReference } : {}),
        state: "pending",
      };
    } else if (responseCode === "0005") {
      observation = {
        providerId: "hubtel",
        merchantRefundReference: execution.merchantRefundReference,
        ...(providerRefundReference ? { providerRefundReference } : {}),
        state: "unknown",
        customerSafeMessage: "Hubtel reported an uncertain refund outcome.",
      };
    } else {
      observation = {
        providerId: "hubtel",
        merchantRefundReference: execution.merchantRefundReference,
        ...(providerRefundReference ? { providerRefundReference } : {}),
        state: "failed",
        failureCode: responseCode,
        customerSafeMessage: "Hubtel could not complete the refund.",
      };
    }

    return this.db.$transaction(async (tx) => {
      const result = await this.outcomes.apply(tx, execution.id, observation, {
        actorId: "provider:hubtel",
        requestId,
        trigger: "provider_callback",
      });
      await tx.refundReconciliation.create({
        data: {
          refundId: execution.refundId,
          refundExecutionId: execution.id,
          provider: "hubtel",
          trigger: "provider_callback",
          observedState: observation.state,
          providerRefundReference: observation.providerRefundReference,
          observedAmountMinor: observation.amountMinor,
          observedCurrency: observation.currency,
          result:
            result.processingResult === "applied" || result.processingResult === "duplicate" ? "matched" :
            result.processingResult === "pending" ? "pending" :
            result.processingResult === "failed" ? "failed" : "exception",
          safeNote: observation.customerSafeMessage,
          requestId,
        },
      });
      return result;
    }, { timeout: 15_000 });
  }
}
