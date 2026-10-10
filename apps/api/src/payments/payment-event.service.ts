import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PaymentProviderEventVerification, PaymentProviderObservation } from "./payment-provider";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { PaymentOutcomeService } from "./payment-outcome.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";

export interface PaymentEventResult {
  accepted: true;
  duplicate: boolean;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

@Injectable()
export class PaymentEventService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly registry: PaymentProviderRegistry,
    private readonly outcomes: PaymentOutcomeService,
  ) {}

  private adapter(providerId: string) {
    if (!this.config.payments || this.config.payments.providerId !== providerId)
      throw new ApiProblem(404, "NOT_FOUND", "Payment provider endpoint not found.");
    const adapter = this.registry.requireConfigured();
    if (adapter.id !== providerId)
      throw new ApiProblem(404, "NOT_FOUND", "Payment provider endpoint not found.");
    return adapter;
  }

  private async resolveAttempt(
    provider: string,
    verification: Exclude<PaymentProviderEventVerification, { verification: "invalid" }>,
  ) {
    const merchantReference = verification.verification === "verified"
      ? verification.observation.merchantReference
      : verification.merchantReference;
    const providerReference = verification.verification === "verified"
      ? verification.observation.providerReference
      : verification.providerReference;
    if (merchantReference) {
      const byMerchant = await this.db.paymentAttempt.findUnique({ where: { merchantReference } });
      if (byMerchant?.provider === provider) return byMerchant;
    }
    if (providerReference) {
      const byProvider = await this.db.paymentAttempt.findFirst({ where: { provider, providerRef: providerReference } });
      if (byProvider) return byProvider;
    }
    return null;
  }

  private evidenceFields(
    verification: Exclude<PaymentProviderEventVerification, { verification: "invalid" }>,
  ) {
    const observation = verification.verification === "verified" ? verification.observation : null;
    const observedAmountMinor = observation?.amountMinor;
    return {
      providerEventId: verification.providerEventId ?? observation?.providerEventId ?? null,
      providerRef: observation?.providerReference ?? (verification.verification === "lookup_required" ? verification.providerReference : undefined) ?? null,
      observedState: observation?.state ?? null,
      observedAmountMinor: Number.isInteger(observedAmountMinor) && observedAmountMinor! >= 0 ? observedAmountMinor : null,
      observedCurrency: observation?.currency === "GHS" ? "GHS" : null,
      providerTimestamp: observation?.providerTimestamp ?? null,
      safeMetadata: {
        source: "provider_event",
        hasProviderEventId: !!(verification.providerEventId ?? observation?.providerEventId),
        amountObserved: observation?.amountMinor !== undefined,
        currencyObserved: observation?.currency !== undefined,
        currencyMatchesGhs: observation?.currency === undefined ? null : observation.currency === "GHS",
      },
    };
  }

  private async persistEvidence(
    provider: string,
    verification: Exclude<PaymentProviderEventVerification, { verification: "invalid" }>,
    rawBodyHash: string,
    attemptId: string | null,
  ) {
    const fields = this.evidenceFields(verification);
    const dedupeKey = sha256(`${provider}:${fields.providerEventId ?? rawBodyHash}`);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([provider, dedupeKey])},0))`;
      const existing = await tx.paymentProviderEvent.findFirst({
        where: {
          provider,
          OR: [
            ...(fields.providerEventId ? [{ providerEventId: fields.providerEventId }] : []),
            { dedupeKey },
          ],
        },
      });
      const linkedAttemptId = existing?.paymentAttemptId ?? attemptId;
      if (linkedAttemptId) {
        const seed = await tx.paymentAttempt.findUnique({ where: { id: linkedAttemptId }, select: { orderId: true } });
        if (seed) {
          await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${seed.orderId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE "orderId"=${seed.orderId} ORDER BY id FOR UPDATE`;
          await tx.paymentAttempt.update({ where: { id: linkedAttemptId }, data: { callbackCount: { increment: 1 }, version: { increment: 1 } } });
        }
      }
      if (existing) {
        const row = !existing.paymentAttemptId && linkedAttemptId
          ? await tx.paymentProviderEvent.update({ where: { id: existing.id }, data: { paymentAttemptId: linkedAttemptId } })
          : existing;
        return { row, duplicate: true };
      }
      const row = await tx.paymentProviderEvent.create({
        data: {
          provider,
          providerEventId: fields.providerEventId,
          dedupeKey,
          paymentAttemptId: linkedAttemptId,
          providerRef: fields.providerRef,
          rawBodyHash,
          verificationResult: verification.verification,
          observedState: fields.observedState,
          observedAmountMinor: fields.observedAmountMinor,
          observedCurrency: fields.observedCurrency,
          providerTimestamp: fields.providerTimestamp,
          safeMetadata: fields.safeMetadata,
        },
      });
      return { row, duplicate: false };
    });
  }

  private async markProcessing(eventId: string, result: "mismatch" | "exception" | "rejected") {
    await this.db.paymentProviderEvent.update({
      where: { id: eventId },
      data: { processingResult: result, processedAt: new Date() },
    });
  }

  private async applyObservation(
    eventId: string,
    attemptId: string,
    observation: PaymentProviderObservation,
    requestId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const result = await this.outcomes.apply(tx, attemptId, observation, {
        actorId: "payment-provider",
        requestId,
        source: "provider_event",
      });
      await tx.paymentProviderEvent.update({
        where: { id: eventId },
        data: { paymentAttemptId: attemptId, processingResult: result.processingResult, processedAt: new Date() },
      });
      return result;
    }, { timeout: 15_000 });
  }

  async handle(
    providerId: string,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    requestId: string,
  ): Promise<PaymentEventResult> {
    const adapter = this.adapter(providerId);
    let verification: PaymentProviderEventVerification;
    try {
      verification = await adapter.verifyEvent({ rawBody, headers });
    } catch {
      throw new ApiProblem(401, "UNAUTHENTICATED", "Payment provider event could not be verified.");
    }
    if (verification.verification === "invalid")
      throw new ApiProblem(401, "UNAUTHENTICATED", "Payment provider event could not be verified.");

    const resolved = await this.resolveAttempt(providerId, verification);
    const evidence = await this.persistEvidence(providerId, verification, sha256(rawBody), resolved?.id ?? null);
    const alreadyComplete = ["applied", "pending", "mismatch", "rejected", "duplicate"].includes(evidence.row.processingResult ?? "");
    if (alreadyComplete) return { accepted: true, duplicate: true };

    const attemptId = evidence.row.paymentAttemptId ?? resolved?.id;
    if (!attemptId) {
      await this.markProcessing(evidence.row.id, "mismatch");
      return { accepted: true, duplicate: evidence.duplicate };
    }

    let observation: PaymentProviderObservation;
    if (verification.verification === "verified") {
      observation = verification.observation;
    } else {
      const attempt = await this.db.paymentAttempt.findUnique({ where: { id: attemptId } });
      if (!attempt) {
        await this.markProcessing(evidence.row.id, "mismatch");
        return { accepted: true, duplicate: evidence.duplicate };
      }
      try {
        observation = await adapter.lookup({
          merchantReference: verification.merchantReference ?? attempt.merchantReference,
          providerReference: verification.providerReference ?? attempt.providerRef ?? undefined,
          signal: AbortSignal.timeout(this.config.payments!.requestTimeoutMs),
        });
      } catch {
        await this.markProcessing(evidence.row.id, "exception");
        return { accepted: true, duplicate: evidence.duplicate };
      }
    }

    try {
      await this.applyObservation(evidence.row.id, attemptId, observation, requestId);
    } catch (error) {
      try { await this.markProcessing(evidence.row.id, "exception"); } catch { /* preserve original failure */ }
      throw error;
    }
    return { accepted: true, duplicate: evidence.duplicate };
  }
}
