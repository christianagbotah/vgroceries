import type { NotificationItem, NotificationListResponse } from "../../contracts";
import { notificationCursorSchema } from "../../contracts";
import type { VgStore } from "../store";
import { OpError } from "./orders";

const copyByStatus: Record<string, [NotificationItem["kind"], string, string]> = {
  confirmed: ["fulfilment", "Order confirmed", "Your order is confirmed for preparation."],
  packed: ["fulfilment", "Order packed", "Your items have been packed."],
  out_for_delivery: ["delivery", "Out for delivery", "Your order is out for delivery."],
  delivered: ["delivery", "Delivery recorded", "Your order has been delivered."],
  collected: ["fulfilment", "Order collected", "Your order has been collected."],
  cancelled: ["order", "Order cancelled", "Your order was cancelled. View order details for its payment status."],
};

/** Deterministic demo messages; never expose staff event notes or actors. */
function itemsForCustomer(store: VgStore): NotificationItem[] {
  const customerId = store.customers[0].id;
  return store.orders.filter(order => order.customerId === customerId).flatMap(order =>
    order.events.flatMap((event, index): NotificationItem[] => {
      const copy = /^Order placed/.test(event.action) ? ["order", "Order received", "We have received your order."] : copyByStatus[event.toStatus ?? ""];
      if (!copy) return [];
      const id = `demo-notification-${order.id}-${index}`;
      return [{ id, kind: copy[0] as NotificationItem["kind"], title: copy[1],
        body: `Order ${order.reference}. ${copy[2]}`, orderId: order.id,
        createdAt: event.at, readAt: store.notificationReadAt[id] ?? null }];
    })
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function listNotifications(store: VgStore, rawLimit: string, cursor?: string): NotificationListResponse {
  if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(rawLimit)) throw new OpError("VALIDATION_FAILED", "Invalid notification limit.");
  const all = itemsForCustomer(store);
  let rows = all;
  if (cursor !== undefined) {
    let position;
    try {
      if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid cursor.");
      position = notificationCursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    } catch { throw new OpError("VALIDATION_FAILED", "Invalid notification cursor."); }
    rows = rows.filter(item => item.createdAt < position.createdAt || (item.createdAt === position.createdAt && item.id < position.id));
  }
  const limit = Number(rawLimit);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const hasMore = rows.length > limit;
  return { items, unreadCount: all.filter(item => !item.readAt).length, hasMore,
    nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString("base64url") : null };
}

export function readNotification(store: VgStore, id: string) {
  if (!itemsForCustomer(store).some(item => item.id === id)) throw new OpError("NOT_FOUND", "Notification not found.");
  store.notificationReadAt[id] ??= new Date().toISOString();
  return { id, readAt: store.notificationReadAt[id] };
}

export function readAllNotifications(store: VgStore) {
  const readAt = new Date().toISOString();
  const unread = itemsForCustomer(store).filter(item => !item.readAt);
  for (const item of unread) store.notificationReadAt[item.id] = readAt;
  return { updatedCount: unread.length, readAt };
}
