import { afterAll, expect, test } from "bun:test";
import * as contracts from "../packages/contracts/src";
import { HttpServiceAdapter } from "../src/services/adapters/http";
import { MockServiceAdapter } from "../src/services/adapters/mock";
import { resetStore } from "../src/services/mock/store";
import { handleApi } from "../src/services/mock/router";

const calls: Array<{ method: string; path: string; cursor: string | null }> = [];
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/mock/")) {
    const result = await handleApi({ path: url.pathname.slice(6).replaceAll("/", "."),
      method: request.method === "POST" ? "POST" : "GET", query: url.searchParams,
      body: request.method === "POST" ? await request.json() as Record<string, unknown> : {} });
    return Response.json(result.json, { status: result.status });
  }
  calls.push({ method: request.method, path: url.pathname, cursor: url.searchParams.get("cursor") });
  return Response.json({ ok: true, data: { done: true } });
} });
afterAll(() => server.stop(true));

test("notification operations use their authenticated REST routes with encoded item identity", async () => {
  const adapter = new HttpServiceAdapter(server.url.href);
  await adapter.request({ op: "account.notifications", query: { limit: 20, cursor: "opaque-cursor" } });
  await adapter.request({ op: "account.notifications.read", body: { notificationId: "item/one" } });
  await adapter.request({ op: "account.notifications.read-all", body: {} });
  expect(calls).toEqual([
    { method: "GET", path: "/account/notifications", cursor: "opaque-cursor" },
    { method: "POST", path: "/account/notifications/item%2Fone/read", cursor: null },
    { method: "POST", path: "/account/notifications/read-all", cursor: null },
  ]);
});

test("strict inbox responses accept public message data and reject private fields", () => {
  const schema = (contracts as Record<string, any>).notificationListResponseSchema;
  expect(typeof schema?.safeParse).toBe("function");
  const item = { id: "notification-a", kind: "order", title: "Order received", body: "Order VG-1 was received.",
    orderId: "order-a", createdAt: "2026-11-05T00:00:00.000Z", readAt: null };
  const data = { items: [item], unreadCount: 1, hasMore: false, nextCursor: null };
  expect(schema.safeParse(data).success).toBe(true);
  expect(schema.safeParse({ ...data, items: [{ ...item, recipientUserId: "private" }] }).success).toBe(false);
  expect(schema.safeParse({ ...data, items: [{ ...item, body: "x".repeat(501) }] }).success).toBe(false);
  expect(schema.safeParse({ ...data, unreadCount: -1 }).success).toBe(false);
  expect(schema.safeParse({ ...data, hasMore: true }).success).toBe(false);
});

test("demo inbox supports durable read state through the same operations", async () => {
  resetStore();
  const adapter = new MockServiceAdapter();
  const first = await adapter.request<any>({ op: "account.notifications", query: { limit: 1 } });
  expect(first.items.length).toBe(1);
  expect(first.unreadCount).toBeGreaterThan(0);
  await adapter.request({ op: "account.notifications.read", body: { notificationId: first.items[0].id } });
  const next = await adapter.request<any>({ op: "account.notifications", query: { limit: 1 } });
  expect(next.items[0].readAt).not.toBeNull();
  expect(next.unreadCount).toBe(first.unreadCount - 1);
  await adapter.request({ op: "account.notifications.read-all", body: {} });
  expect((await adapter.request<any>({ op: "account.notifications" })).unreadCount).toBe(0);
});

test("HTTP demo transport retains the notification identity when marking read", async () => {
  resetStore();
  const adapter = new HttpServiceAdapter(`${server.url.href}mock`, { protocol: "mock" });
  const before = await adapter.request<contracts.NotificationListResponse>({ op: "account.notifications" });
  const notificationId = before.items[0].id;
  const result = await adapter.request<contracts.NotificationReadResponse>({ op: "account.notifications.read", body: { notificationId } });
  expect(result.id).toBe(notificationId);
  expect(result.readAt).not.toBeNull();
  const after = await adapter.request<contracts.NotificationListResponse>({ op: "account.notifications" });
  expect(after.unreadCount).toBe(before.unreadCount - 1);
});
