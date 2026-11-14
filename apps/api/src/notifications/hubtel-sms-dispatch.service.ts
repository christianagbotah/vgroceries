import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { HubtelSmsClient, normalizeGhanaSmsRecipient } from "./hubtel-sms-client";

type SmsSender = Pick<HubtelSmsClient, "send">;
const STAGE_LOCK = [20261114, 39] as const;

/**
 * Durable transactional SMS projection, isolated from the in-app inbox.
 *
 * Merely setting HUBTEL_SMS_CLIENT_ID/SECRET does not activate this service.
 * There is no HTTP endpoint or scheduled worker for sending. A manually
 * invoked CLI requires HUBTEL_SMS_DISPATCH_ENABLED=true, a UTC cutoff date,
 * and a list of specific approved test recipients. Every provider call is
 * preceded by a committed 'attempting' state; an unknown/timeout response
 * can NEVER be retried automatically.
 */
@Injectable()
export class HubtelSmsDispatchService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private maxBatch(take: number) {
    if (!Number.isInteger(take) || take < 1 || take > 50)
      throw new Error("SMS batch size must be between 1 and 50");
  }

  async stageBatch(take = 25) {
    this.maxBatch(take);
    const options = this.config.hubtelSmsDispatch;
    if (!options) return { disabled: true, scanned: 0, queued: 0, skipped: 0 };
    return this.db.$transaction(async (tx) => {
      const locks = await tx.$queryRawUnsafe<{ locked: boolean }[]>(
        "SELECT pg_try_advisory_xact_lock($1::integer,$2::integer) AS locked",
        ...STAGE_LOCK,
      );
      if (!locks[0]?.locked) return { disabled: false, busy: true, scanned: 0, queued: 0, skipped: 0 };
      const rows = await tx.notification.findMany({
        where: { createdAt: { gte: options.notBefore }, smsDispatch: { is: null } },
        select: {
          id: true, body: true, recipientUserId: true,
          recipientUser: { select: { id: true, role: true, active: true } },
          order: { select: { customerUserId: true, customerPhone: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take,
      });
      let queued = 0;
      let skipped = 0;
      for (const row of rows) {
        // Source/recipient are DB-owned. Never derive a phone from raw event
        // payloads or staff-entered notification details.
        const phone = normalizeGhanaSmsRecipient(row.order.customerPhone);
        const eligible = row.recipientUser.id === row.recipientUserId &&
          row.recipientUser.role === "customer" && row.recipientUser.active &&
          row.order.customerUserId === row.recipientUserId && !!phone;
        await tx.smsDispatch.create({
          data: {
            id: randomUUID(),
            notificationId: row.id,
            recipientPhone: eligible ? phone! : "",
            message: row.body,
            state: eligible ? "queued" : "skipped",
          },
        });
        if (eligible) queued++;
        else skipped++;
      }
      return { disabled: false, busy: false, scanned: rows.length, queued, skipped };
    }, { timeout: 15000 });
  }

  /**
   * At-most-one submission attempt per source notification. A network error
   * becomes 'uncertain' rather than retrying a possibly accepted SMS.
   * Per-customer sends are limited to explicit test recipients in config.
   */
  async sendApprovedBatch(take = 10, injectedSender?: SmsSender) {
    this.maxBatch(take);
    const options = this.config.hubtelSmsDispatch;
    if (!options || !this.config.hubtelSms)
      return { disabled: true, attempted: 0, submitted: 0, uncertain: 0 };
    const allowed = options.allowedRecipients;
    const sender = injectedSender ?? new HubtelSmsClient(this.config.hubtelSms);
    const rows = await this.db.smsDispatch.findMany({
      where: {
        state: "queued", recipientPhone: { in: allowed },
        notification: { recipientUser: { role: "customer", active: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: { id: true, message: true, recipientPhone: true },
    });
    let attempted = 0;
    let submitted = 0;
    let uncertain = 0;
    for (const row of rows) {
      // The state claim commits BEFORE the network request. Two workers can
      // inspect the same queued row, but only one may claim it.
      const claim = await this.db.smsDispatch.updateMany({
        where: { id: row.id, state: "queued" },
        data: { state: "attempting", attemptedAt: new Date() },
      });
      if (claim.count !== 1) continue;
      attempted++;
      try {
        const result = await sender.send(row.recipientPhone, row.message);
        await this.db.smsDispatch.update({
          where: { id: row.id },
          data: {
            state: "submitted",
            ...(result.messageId ? { providerMessageId: result.messageId } : {}),
            resolvedAt: new Date(),
          },
        });
        submitted++;
      } catch {
        // A provider timeout might be an accepted SMS: do not retry it.
        await this.db.smsDispatch.update({
          where: { id: row.id },
          data: { state: "uncertain", resolvedAt: new Date() },
        });
        uncertain++;
      }
    }
    return { disabled: false, attempted, submitted, uncertain };
  }
}
