import { Injectable, Inject } from "@nestjs/common";
import { API_CONFIG, type ApiConfig } from "../config";
import type { CheckoutPrincipal } from "../commerce-identity/checkout-principal.service";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { isHostedRecoveryCandidate } from "./hosted-payment-recovery";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

@Injectable()
export class CustomerPaymentRefreshService {
  constructor(private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly reconciliation: PaymentReconciliationService) {}

  async refresh(principal: CheckoutPrincipal, orderId: string, requestId: string) {
    const ownership = principal.kind === "customer"
      ? { customerUserId: principal.userId } : { guestSessionId: principal.guestSessionId };
    const order = await this.db.order.findFirst({ where: { id: orderId, ...ownership },
      select: { id: true, paymentStatus: true, fulfilmentStatus: true } });
    if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");
    if (process.env.HUBTEL_CUSTOMER_PAYMENT_REFRESH_ENABLED !== "true" ||
        this.config.payments?.providerId !== "hubtel" ||
        order.paymentStatus !== "pending" || order.fulfilmentStatus === "cancelled") return;
    const cooldown = Math.max(8_000, this.config.payments.requestTimeoutMs + 2_000);
    const attemptId = await this.db.$transaction(async tx => {
      // Durable per-order rate limit across API replicas. No lock is held
      // during network calls or the separate payment outcome transaction.
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${"checkout-payment-refresh:" + orderId}, 0)) AS locked`;
      if (!lock[0]?.locked) return null;
      const fresh = await tx.order.findFirst({ where: { id: orderId, ...ownership },
        select: { paymentStatus: true, fulfilmentStatus: true } });
      if (!fresh || fresh.paymentStatus !== "pending" || fresh.fulfilmentStatus === "cancelled") return null;
      const attempt = await tx.paymentAttempt.findFirst({ where: { orderId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (!attempt || !isHostedRecoveryCandidate(attempt)) return null;
      const recent = await tx.auditEvent.findFirst({ where: { entityId: attempt.id,
        action: "payment.customer_lookup_started", createdAt: { gte: new Date(Date.now() - cooldown) } },
        select: { id: true } });
      if (recent) return null;
      await tx.auditEvent.create({ data: { actorId: principal.actorId, entityId: attempt.id,
        action: "payment.customer_lookup_started", requestId, details: {} } });
      return attempt.id;
    });
    if (attemptId) await this.reconciliation.reconcile(attemptId, "customer_retry", principal.actorId, requestId);
  }
}
