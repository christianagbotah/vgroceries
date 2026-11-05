import { z } from "zod";

export const notificationItemSchema = z.strictObject({
  id: z.string().min(1).max(128),
  kind: z.enum(["order", "fulfilment", "delivery"]),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(500),
  orderId: z.string().min(1).max(128),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});

export const notificationListResponseSchema = z.strictObject({
  items: z.array(notificationItemSchema).max(50),
  unreadCount: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  nextCursor: z.string().min(1).max(512).nullable(),
}).refine(value => value.hasMore === (value.nextCursor !== null), "Cursor must match pagination state.");

export const notificationReadResponseSchema = z.strictObject({
  id: z.string().min(1).max(128), readAt: z.iso.datetime().nullable(),
});
export const notificationReadAllResponseSchema = z.strictObject({
  updatedCount: z.number().int().nonnegative(), readAt: z.iso.datetime(),
});
export const notificationCursorSchema = z.strictObject({
  createdAt: z.iso.datetime(), id: z.string().min(1).max(128),
});

export type NotificationItem = z.infer<typeof notificationItemSchema>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
export type NotificationReadResponse = z.infer<typeof notificationReadResponseSchema>;
export type NotificationReadAllResponse = z.infer<typeof notificationReadAllResponseSchema>;
