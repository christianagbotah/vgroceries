import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { notificationCursorSchema, type NotificationListResponse } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { customerNotificationCopy, customerNotificationTypes, type CustomerNotificationType } from "./notification-templates";

@Injectable()
export class NotificationService {
  constructor(private readonly db: Database) {}

  /** A durable, idempotent outbox consumer. Does not publish to any external provider. */
  async projectBatch(take = 100) {
    if (!Number.isInteger(take) || take < 1 || take > 200) throw new Error("Invalid batch size.");
    return this.db.$transaction(async tx => {
      const locks = await tx.$queryRawUnsafe<{ locked: boolean }[]>(
        "SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS locked", 20261104, 4,
      );
      if (!locks[0]?.locked) return { scanned: 0, created: 0, busy: true };
      const events = await tx.outboxEvent.findMany({
        where: { type: { in: [...customerNotificationTypes] }, notificationReceipt: { is: null } },
        select: { id: true, type: true, aggregateId: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take,
      });
      let created = 0;
      for (const event of events) {
        // Never resolve a recipient from user-provided payload data, phone, or email.
        const order = await tx.order.findUnique({
          where: { id: event.aggregateId },
          select: { id: true, reference: true, fulfilment: true,
            customerUser: { select: { id: true, role: true, active: true } } },
        });
        const recipient = order?.customerUser;
        const canNotify = !!(order && recipient?.role === "customer" && recipient.active);
        const copy = canNotify && order
          ? customerNotificationCopy(event.type as CustomerNotificationType, order.reference, order.fulfilment)
          : null;
        // A no-recipient receipt is essential so anonymous orders never starve the queue.
        await tx.notificationOutboxReceipt.create({
          data: { sourceEventId: event.id, outcome: copy ? "created" : "no_recipient" },
        });
        if (copy && recipient && order) {
          await tx.notification.create({
            data: {
              id: randomUUID(), recipientUserId: recipient.id, orderId: order.id,
              sourceEventId: event.id, kind: copy.kind, title: copy.title,
              body: copy.body, createdAt: event.createdAt,
            },
          });
          created++;
        }
      }
      return { scanned: events.length, created, busy: false };
    }, { timeout: 15000 });
  }

  async list(recipientUserId: string, limit: number, cursor?: string): Promise<NotificationListResponse> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid notification limit.");
    let position: { createdAt: string; id: string } | undefined;
    if (cursor !== undefined) {
      try {
        if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid cursor.");
        position = notificationCursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      } catch {
        throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid notification cursor.");
      }
    }
    const [rows, unreadCount] = await this.db.$transaction([
      this.db.notification.findMany({
        where: { recipientUserId, ...(position ? { OR: [
          { createdAt: { lt: new Date(position.createdAt) } },
          { createdAt: new Date(position.createdAt), id: { lt: position.id } },
        ] } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: { id: true, kind: true, title: true, body: true,
          orderId: true, createdAt: true, readAt: true },
      }),
      this.db.notification.count({ where: { recipientUserId, readAt: null } }),
    ], { isolationLevel: "RepeatableRead" });
    const items = rows.slice(0, limit).map(row => ({
      ...row, kind: row.kind as "order" | "fulfilment" | "delivery",
      createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null,
    }));
    const last = items.at(-1);
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString("base64url")
      : null;
    return { items, unreadCount, hasMore, nextCursor };
  }

  async markRead(recipientUserId: string, notificationId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const changed = await tx.notification.updateMany({
        where: { id: notificationId, recipientUserId, readAt: null },
        data: { readAt: new Date() },
      });
      if (changed.count) {
        await tx.auditEvent.create({
          data: { actorId: recipientUserId, action: "notification.read",
            entityId: notificationId, requestId, details: { source: "in_app" } },
        });
      }
      const row = await tx.notification.findFirst({
        where: { id: notificationId, recipientUserId },
        select: { id: true, readAt: true },
      });
      if (!row) throw new ApiProblem(404, "NOT_FOUND", "Notification not found.");
      return { id: row.id, readAt: row.readAt?.toISOString() ?? null };
    });
  }

  async markAllRead(recipientUserId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const readAt = new Date();
      const changed = await tx.notification.updateMany({
        where: { recipientUserId, readAt: null }, data: { readAt },
      });
      if (changed.count) {
        await tx.auditEvent.create({ data: {
          actorId: recipientUserId, action: "notification.read_all", entityId: recipientUserId,
          requestId, details: { updatedCount: changed.count },
        } });
      }
      return { updatedCount: changed.count, readAt: readAt.toISOString() };
    });
  }
}
