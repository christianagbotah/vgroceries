import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

/**
 * Hubtel's Online Checkout status API is the recovery authority if the callback
 * never arrives. The provider asks merchants to check after five minutes.
 *
 * No timers are started by this service. A separately configured, opt-in
 * one-shot worker invokes it; checkout initiation is never retried here.
 */
export const HUBTEL_MIN_RECOVERY_AGE_SECONDS = 300;
export const HUBTEL_RECOVERY_BATCH_LIMIT = 10;

export function hubtelRecoveryCutoff(now: Date, reconcileAfterSeconds: number): Date {
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(reconcileAfterSeconds) ||
      reconcileAfterSeconds < 1 || reconcileAfterSeconds > 86_400)
    throw new Error("Invalid Hubtel recovery clock or delay.");
  return new Date(now.getTime() - Math.max(HUBTEL_MIN_RECOVERY_AGE_SECONDS, reconcileAfterSeconds) * 1000);
}

export interface HubtelRecoveryReport {
  enabled: boolean;
  dryRun: boolean;
  eligible: number;
  attempted: number;
  matched: number;
  requiresReview: number;
  errors: number;
}

@Injectable()
export class HubtelPaymentRecoveryService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly reconciliation: PaymentReconciliationService,
  ) {}

  async run(execute = false, now = new Date()): Promise<HubtelRecoveryReport> {
    const report: HubtelRecoveryReport = {
      enabled: false, dryRun: !execute, eligible: 0,
      attempted: 0, matched: 0, requiresReview: 0, errors: 0,
    };
    // A Hubtel Direct Request Money or differently configured provider must
    // NEVER be swept by this hosted-checkout-specific recovery job.
    if (this.config.payments?.providerId !== "hubtel" ||
        !this.config.payments.enabledMethods.includes("hosted_checkout") ||
        !this.config.hubtelPayment?.onlineCheckout) return report;

    report.enabled = true;
    const cutoff = hubtelRecoveryCutoff(now, this.config.payments.reconcileAfterSeconds);
    const candidates = await this.db.paymentAttempt.findMany({
      where: {
        provider: "hubtel",
        method: "hosted_checkout",
        status: { in: ["initiated", "pending"] },
        settlementState: "unsettled",
        createdAt: { lte: cutoff },
        order: { paymentStatus: { in: ["pending", "unpaid"] } },
      },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: HUBTEL_RECOVERY_BATCH_LIMIT,
    });
    report.eligible = candidates.length;
    if (!execute) return report;

    for (const { id } of candidates) {
      report.attempted += 1;
      try {
        // Reconciliation independently verifies merchant reference,
        // transaction identity, amount and currency using server credentials.
        // Unknown provider outcomes enter staff review; they never become Paid.
        const result = await this.reconciliation.reconcile(
          id, "worker", "system:hubtel-recovery", randomUUID(),
        );
        if (result.result === "matched") report.matched += 1;
        else report.requiresReview += 1;
      } catch {
        // Do not emit attempted references, provider payloads or credentials.
        // Leave the durable row for staff investigation/retry.
        report.errors += 1;
      }
    }
    return report;
  }
}
