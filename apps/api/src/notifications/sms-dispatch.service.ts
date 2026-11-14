import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { customerNotificationCopy, type CustomerNotificationType } from "./notification-templates";
import { HubtelSmsGateway, normalizeGhanaMobile } from "./hubtel-sms.gateway";

const eligibleTypes = [
  "order.created", "fulfilment.confirmed", "fulfilment.packed",
  "delivery.out_for_delivery", "delivery.delivered", "delivery.failed",
  "pickup.appointment_booked",
] as const;

/**
 * Separate opt-in SMS worker; the API never calls it during startup.
 * All provider I/O is outside transactions. Indeterminate sends NEVER retry.
 */
@Injectable()
export class SmsDispatchService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly cfg: ApiConfig,
  ) {}

  private isEnabled() {
    return !!(
      this.cfg.hubtelSms && this.cfg.smsDispatchWorkerEnabled &&
      this.cfg.smsDispatchActivatedAt
    );
  }

  async projectBatch(take = 60) {
    if (!Number.isInteger(take) || take < 1 || take > 100)
      throw new Error("Invalid SMS projection batch size");
    if (!this.isEnabled())
      return { disabled: true, scanned: 0, queued: 0, suppressed: 0, busy: false };
    const activatedAt = this.cfg.smsDispatchActivatedAt!;
    return this.db.$transaction(async tx => {
      const advisory = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(20261114, 7) AS locked
      `;
      if (!advisory[0]?.locked)
        return { disabled: false, scanned: 0, queued: 0, suppressed: 0, busy: true };
      // A fixed activation cutoff excludes historical orders from SMS backfill.
      const events = await tx.outboxEvent.findMany({
        where: {
          type: { in: [...eligibleTypes] },
          createdAt: { gte: activatedAt },
          smsDispatch: { is: null },
        },
        select: { id: true, type: true, aggregateId: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take,
      });
      let queued = 0, suppressed = 0;
      for (const event of events) {
        const order = await tx.order.findUnique({
          where: { id: event.aggregateId },
          select: {
            id: true, reference: true, fulfilment: true,
            customerPhone: true, smsUpdatesOptIn: true,
          },
        });
        // Never trust the contact number or content in the outbox payload.
        const phone = order?.smsUpdatesOptIn
          ? normalizeGhanaMobile(order.customerPhone) : null;
        const copy = order && phone
          ? customerNotificationCopy(
            event.type as CustomerNotificationType,
            order.reference, order.fulfilment,
          )
          : null;
        const body = copy && copy.body.length <= 320 ? copy.body : null;
        const allowed = !!(phone && body);
        await tx.smsDispatch.create({ data: {
          id: randomUUID(), sourceEventId: event.id,
          orderId: order?.id ?? null,
          recipientPhone: allowed ? phone : null,
          body: allowed ? body : null,
          state: allowed ? "pending" : "suppressed",
          failureCode: allowed ? null : "no_consent_or_recipient",
        } });
        if (allowed) queued++; else suppressed++;
      }
      return { disabled: false, scanned: events.length, queued, suppressed, busy: false };
    }, { timeout: 15000 });
  }

  /**
   * Claim pending rows (FOR UPDATE SKIP LOCKED) and set in_flight BEFORE HTTP.
   * A worker crash leaves an in_flight row for manual provider reconciliation,
   * not a retryable pending message.
   */
  async sendBatch(
    gateway: HubtelSmsGateway | null = this.cfg.hubtelSms
      ? new HubtelSmsGateway(this.cfg.hubtelSms) : null,
    take = 10,
  ) {
    if (!this.isEnabled() || !gateway)
      return { disabled: true, attempted: 0, accepted: 0, rejected: 0, unknown: 0 };
    if (!Number.isInteger(take) || take < 1 || take > 20)
      throw new Error("Invalid SMS send batch size");
    const claimed = await this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<{
        id: string; recipientPhone: string; body: string;
      }[]>`
        SELECT "id", "recipientPhone", "body" FROM "SmsDispatch"
        WHERE "state" = 'pending'
        ORDER BY "createdAt" ASC, "id" ASC
        LIMIT ${take} FOR UPDATE SKIP LOCKED
      `;
      if (!rows.length) return [];
      await tx.smsDispatch.updateMany({
        where: { id: { in: rows.map(r => r.id) }, state: "pending" },
        data: { state: "in_flight", attemptedAt: new Date() },
      });
      return rows;
    });
    let accepted = 0, rejected = 0, unknown = 0;
    for (const row of claimed) {
      try {
        const outcome = await gateway.send(row.recipientPhone, row.body);
        if (outcome.state === "accepted") {
          await this.db.smsDispatch.update({
            where: { id: row.id, state: "in_flight" },
            data: { state: "accepted", providerMessageId: outcome.providerMessageId,
              acceptedAt: new Date() },
          });
          accepted++;
        } else {
          await this.db.smsDispatch.update({
            where: { id: row.id, state: "in_flight" },
            data: { state: "rejected", failureCode: outcome.reason },
          });
          rejected++;
        }
      } catch {
        await this.db.smsDispatch.update({
          where: { id: row.id, state: "in_flight" },
          data: { state: "unknown", failureCode: "indeterminate_send" },
        });
        unknown++;
      }
    }
    return { disabled: false, attempted: claimed.length, accepted, rejected, unknown };
  }

  /**
   * Only an authoritative provider Delivered status marks SMS delivered.
   * Provider errors leave accepted status unchanged; no extra send is made.
   */
  async reconcileBatch(
    gateway: HubtelSmsGateway | null = this.cfg.hubtelSms
      ? new HubtelSmsGateway(this.cfg.hubtelSms) : null,
    take = 10,
  ) {
    if (!this.isEnabled() || !gateway)
      return { disabled: true, checked: 0, delivered: 0, failed: 0, pending: 0, unknown: 0 };
    if (!Number.isInteger(take) || take < 1 || take > 20)
      throw new Error("Invalid SMS delivery lookup batch size");
    const claimed = await this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<{
        id: string; providerMessageId: string;
      }[]>`
        SELECT "id", "providerMessageId" FROM "SmsDispatch"
        WHERE "state" = 'accepted' AND "providerMessageId" IS NOT NULL
          AND ("lastStatusAt" IS NULL OR "lastStatusAt" < NOW() - INTERVAL '5 minutes')
        ORDER BY "createdAt" ASC, "id" ASC
        LIMIT ${take} FOR UPDATE SKIP LOCKED
      `;
      if (rows.length) {
        await tx.smsDispatch.updateMany({
          where: { id: { in: rows.map(r => r.id) }, state: "accepted" },
          data: { lastStatusAt: new Date() },
        });
      }
      return rows;
    });
    let delivered = 0, failed = 0, pending = 0, unknown = 0;
    for (const row of claimed) {
      try {
        const outcome = await gateway.lookupDelivery(row.providerMessageId);
        if (outcome.state === "delivered") {
          await this.db.smsDispatch.update({
            where: { id: row.id, state: "accepted" },
            data: { state: "delivered", deliveryConfirmedAt: new Date(), failureCode: null },
          });
          delivered++;
        } else if (outcome.state === "failed") {
          await this.db.smsDispatch.update({
            where: { id: row.id, state: "accepted" },
            data: { state: "failed", failureCode: "provider_delivery_failed" },
          });
          failed++;
        } else if (outcome.state === "pending") {
          pending++;
        } else {
          unknown++;
        }
      } catch {
        unknown++;
      }
    }
    return { disabled: false, checked: claimed.length, delivered, failed, pending, unknown };
  }
}
