import { z } from "zod";

const isoTimestampSchema = z.string().datetime({ offset: true });
const quantitySchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/);
const noteSchema = z.string().trim().min(1).max(500);

export const fulfilmentStatusSchema = z.enum([
  "awaiting_confirmation",
  "confirmed",
  "picking",
  "packed",
  "dispatched",
  "delivered",
  "ready_for_collection",
  "collected",
  "cancelled",
]);
export type ProductionFulfilmentStatus = z.infer<typeof fulfilmentStatusSchema>;

export const fulfilmentActionSchema = z.enum([
  "confirm",
  "start_picking",
  "record_pick",
  "pack",
  "handover",
]);
export type ProductionFulfilmentAction = z.infer<typeof fulfilmentActionSchema>;

export const fulfilmentConfirmRequestSchema = z.object({}).strict();
export const fulfilmentStartPickingRequestSchema = z.object({}).strict();
export const fulfilmentPickRequestSchema = z.object({
  pickedQuantity: quantitySchema,
  note: noteSchema.optional(),
}).strict();
export const fulfilmentPackRequestSchema = z.object({ note: noteSchema.optional() }).strict();
export const fulfilmentHandoverRequestSchema = z.object({ note: noteSchema.optional() }).strict();

export const fulfilmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  status: fulfilmentStatusSchema.optional(),
}).strict();

export const fulfilmentBlockingReasonSchema = z.enum([
  "invalid_state",
  "picks_incomplete",
  "shortage",
  "reservation_lost",
  "payment_pending",
  "payment_requires_review",
  "payment_insufficient",
  "collection_cash_unverified",
  "already_handed_over",
]);

export const fulfilmentQueueRowSchema = z.object({
  orderId: z.string().min(1),
  reference: z.string().min(1),
  createdAt: isoTimestampSchema,
  fulfilment: z.enum(["delivery", "collection"]),
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  paymentMethod: z.string().min(1),
  paymentStatus: z.string().min(1),
  fulfilmentStatus: fulfilmentStatusSchema,
  deliveryStatus: z.string().min(1),
  locationId: z.string().min(1),
  lineCount: z.number().int().nonnegative(),
  quantitySummary: quantitySchema,
  pickedReservationCount: z.number().int().nonnegative(),
  reservationCount: z.number().int().nonnegative(),
  shortageCount: z.number().int().nonnegative(),
  packedAt: isoTimestampSchema.optional(),
  handedOverAt: isoTimestampSchema.optional(),
  handoverAllowed: z.boolean(),
  blockingReasons: z.array(fulfilmentBlockingReasonSchema),
  allowedActions: z.array(fulfilmentActionSchema),
}).strict();

export const fulfilmentQueueResponseSchema = z.object({
  page: z.number().int().min(1),
  perPage: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  items: z.array(fulfilmentQueueRowSchema),
}).strict();

export const fulfilmentReservationViewSchema = z.object({
  reservationId: z.string().min(1),
  orderLineId: z.string().min(1),
  variantId: z.string().min(1),
  lotId: z.string().min(1),
  lotNumber: z.string().min(1),
  expiryDate: z.string().date().optional(),
  expectedQuantity: quantitySchema,
  pickedQuantity: quantitySchema.optional(),
  pickState: z.enum(["picked", "shortage"]).optional(),
  shortageNote: z.string().min(1).max(500).optional(),
}).strict();

export const fulfilmentLineViewSchema = z.object({
  orderLineId: z.string().min(1),
  productName: z.string().min(1),
  variantName: z.string().min(1),
  unit: z.string().min(1),
  orderedQuantity: quantitySchema,
  reservations: z.array(fulfilmentReservationViewSchema),
}).strict();

export const fulfilmentTimelineEventSchema = z.object({
  action: z.string().min(1),
  actorId: z.string().min(1).optional(),
  at: isoTimestampSchema,
  note: z.string().min(1).max(500).optional(),
}).strict();

export const fulfilmentDetailResponseSchema = z.object({
  orderId: z.string().min(1),
  reference: z.string().min(1),
  fulfilment: z.enum(["delivery", "collection"]),
  fulfilmentStatus: fulfilmentStatusSchema,
  paymentMethod: z.string().min(1),
  paymentStatus: z.string().min(1),
  deliveryStatus: z.string().min(1),
  locationId: z.string().min(1),
  confirmedBy: z.string().min(1).optional(),
  confirmedAt: isoTimestampSchema.optional(),
  pickingStartedBy: z.string().min(1).optional(),
  pickingStartedAt: isoTimestampSchema.optional(),
  packedBy: z.string().min(1).optional(),
  packedAt: isoTimestampSchema.optional(),
  handedOverBy: z.string().min(1).optional(),
  handedOverAt: isoTimestampSchema.optional(),
  handoverKind: z.enum(["dispatch", "collection"]).optional(),
  stockConsumedAt: isoTimestampSchema.optional(),
  lines: z.array(fulfilmentLineViewSchema),
  timeline: z.array(fulfilmentTimelineEventSchema),
  blockingReasons: z.array(fulfilmentBlockingReasonSchema),
  allowedActions: z.array(fulfilmentActionSchema),
}).strict();

export const fulfilmentActionResponseSchema = z.object({
  orderId: z.string().min(1),
  fulfilmentStatus: fulfilmentStatusSchema,
  stockConsumedAt: isoTimestampSchema.optional(),
  depletionId: z.string().min(1).optional(),
  allowedActions: z.array(fulfilmentActionSchema),
}).strict();

export type FulfilmentConfirmRequest = z.infer<typeof fulfilmentConfirmRequestSchema>;
export type FulfilmentStartPickingRequest = z.infer<typeof fulfilmentStartPickingRequestSchema>;
export type FulfilmentPickRequest = z.infer<typeof fulfilmentPickRequestSchema>;
export type FulfilmentPackRequest = z.infer<typeof fulfilmentPackRequestSchema>;
export type FulfilmentHandoverRequest = z.infer<typeof fulfilmentHandoverRequestSchema>;
export type FulfilmentListQuery = z.infer<typeof fulfilmentListQuerySchema>;
export type FulfilmentQueueRow = z.infer<typeof fulfilmentQueueRowSchema>;
export type FulfilmentQueueResponse = z.infer<typeof fulfilmentQueueResponseSchema>;
export type FulfilmentDetailResponse = z.infer<typeof fulfilmentDetailResponseSchema>;
export type FulfilmentActionResponse = z.infer<typeof fulfilmentActionResponseSchema>;
