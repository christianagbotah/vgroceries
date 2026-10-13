import { z } from "zod";
import type { DeliveryJob } from "./domain";
import {
  deliveryStatusSchema,
  dispatchBlockerSchema,
  dispatchEventViewSchema,
  dispatchFailureReasonSchema,
  dispatchProofMethodSchema,
  dispatchProofSchema,
  riderDeclaredAvailabilitySchema,
  riderEffectiveAvailabilitySchema,
} from "./dispatch";

/**
 * Shared API contracts — rider workspace. Legacy interfaces are retained for
 * the current mock/mobile UI; production schemas below are the backend truth.
 */

/* ------------------------------------------------------------------ */
/* Legacy mock/frontend compatibility                                  */
/* ------------------------------------------------------------------ */

export interface RiderLoginRow {
  id: string;
  name: string;
  kind: string;
  vehicle: string;
  isDemo: boolean;
}

export interface RiderJobView {
  id: string;
  orderId: string;
  orderReference?: string;
  status: string;
  zone?: string;
  riderId?: string;
  instructions?: string;
  customerName?: string;
  customerPhone?: string;
  address?: { recipientName: string; phone: string; line1: string; landmark?: string; ghanaPostGps?: string };
  items: string[];
  /** @deprecated Future COD authority; read-only mock compatibility only. */
  cashToCollectLabel?: string;
  /** @deprecated Future COD authority; read-only mock compatibility only. */
  cashToCollectMinor?: number;
  /** @deprecated Future COD authority. */
  cashCollectedAt?: string;
  /** @deprecated Future COD authority. */
  remittedAt?: string;
  proof?: { method: string; detail: string; at: string };
  failureReason?: string;
  rescheduledFor?: string;
  events: { atLabel: string; actor: string; action: string; note?: string }[];
}

export interface RiderSelfView {
  id: string;
  name: string;
  phone: string;
  isAvailable: boolean;
  lastLocationAt?: string;
  lastLocationLabel?: string;
}

export interface RiderJobsResponse {
  jobs: RiderJobView[];
  rider: RiderSelfView | null;
  /** @deprecated Future COD remittance authority. */
  remittance: {
    jobs: DeliveryJob[];
    totalMinor: number;
    totalLabel: string;
  };
}

/** @deprecated Mock operation shape. Production has one schema per command. */
export interface RiderActionRequest {
  jobId: string;
  riderId: string;
  action: "accept" | "pickup" | "out" | "deliver" | "fail" | "note";
  proofMethod?: "pin" | "signature" | "photo_note";
  proofDetail?: string;
  cashCollected?: boolean;
  reason?: string;
  note?: string;
}

export interface RiderHistoryRow {
  jobId: string;
  orderReference?: string;
  status: string;
  deliveredAtLabel: string;
  cashToCollectMinor?: number;
  cashCollected: boolean;
  remitted: boolean;
  proof?: { method: string; detail: string };
}

/* ------------------------------------------------------------------ */
/* Production Rider Authority                                         */
/* ------------------------------------------------------------------ */

const isoTimestampSchema = z.string().datetime({ offset: true });
const noteSchema = z.string().trim().min(1).max(500);

export const riderActionSchema = z.enum([
  "set_availability",
  "accept",
  "pickup",
  "out_for_delivery",
  "deliver",
  "fail",
  "note",
]);
export type RiderAllowedAction = z.infer<typeof riderActionSchema>;

export const riderJobsQuerySchema = z.object({
  scope: z.enum(["active", "history"]).default("active"),
}).strict();
export type RiderJobsQuery = z.infer<typeof riderJobsQuerySchema>;

export const riderAvailabilityRequestSchema = z.object({
  availability: riderDeclaredAvailabilitySchema,
}).strict();
export const riderAvailabilityResponseSchema = z.object({
  riderProfileId: z.string().min(1),
  availability: riderDeclaredAvailabilitySchema,
}).strict();
export const riderAcceptRequestSchema = z.object({}).strict();
export const riderPickupRequestSchema = z.object({ note: noteSchema.optional() }).strict();
export const riderOutRequestSchema = z.object({ note: noteSchema.optional() }).strict();
export const riderDeliverRequestSchema = z.object({
  proof: dispatchProofSchema,
}).strict();
export const riderFailRequestSchema = z.object({
  reason: dispatchFailureReasonSchema,
  note: noteSchema.optional(),
}).strict();
export const riderNoteRequestSchema = z.object({ note: noteSchema }).strict();

export const riderSelfResponseSchema = z.object({
  riderProfileId: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string(),
  kind: z.enum(["in_house", "contracted"]),
  vehicle: z.enum(["motorcycle", "bicycle", "car"]),
  declaredAvailability: riderDeclaredAvailabilitySchema,
  effectiveAvailability: riderEffectiveAvailabilitySchema,
  activeJobId: z.string().min(1).optional(),
  allowedActions: z.array(riderActionSchema),
  blockers: z.array(dispatchBlockerSchema),
}).strict();

export const riderAddressViewSchema = z.object({
  recipientName: z.string().min(1),
  phone: z.string().min(1),
  locality: z.string().min(1),
  street: z.string().min(1),
  landmark: z.string().min(1).optional(),
  ghanaPostGps: z.string().min(1).optional(),
}).strict();

export const riderJobItemSchema = z.object({
  productName: z.string().min(1),
  variantName: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.string().min(1),
}).strict();

export const riderJobResponseSchema = z.object({
  jobId: z.string().min(1),
  orderId: z.string().min(1),
  orderReference: z.string().min(1),
  deliveryStatus: deliveryStatusSchema,
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  address: riderAddressViewSchema.optional(),
  instructions: z.string().max(500).optional(),
  items: z.array(riderJobItemSchema),
  paymentMethod: z.string().min(1),
  paymentStatus: z.string().min(1),
  codDueMinor: z.number().int().nonnegative().optional(),
  proof: dispatchProofSchema.optional(),
  failureReason: dispatchFailureReasonSchema.optional(),
  rescheduledFor: isoTimestampSchema.optional(),
  allowedProofMethods: z.array(dispatchProofMethodSchema),
  allowedActions: z.array(riderActionSchema),
  blockers: z.array(dispatchBlockerSchema),
  events: z.array(dispatchEventViewSchema),
}).strict();

export const riderJobsResponseSchema = z.object({
  jobs: z.array(riderJobResponseSchema),
  rider: riderSelfResponseSchema,
}).strict();
export const riderHistoryResponseSchema = z.object({
  jobs: z.array(riderJobResponseSchema),
}).strict();

export const riderActionResponseSchema = z.object({
  jobId: z.string().min(1),
  orderId: z.string().min(1),
  deliveryStatus: deliveryStatusSchema,
  allowedProofMethods: z.array(dispatchProofMethodSchema),
  allowedActions: z.array(riderActionSchema),
  blockers: z.array(dispatchBlockerSchema),
}).strict();

export type RiderAvailabilityRequest = z.infer<typeof riderAvailabilityRequestSchema>;
export type RiderAvailabilityResponse = z.infer<typeof riderAvailabilityResponseSchema>;
export type RiderAcceptRequest = z.infer<typeof riderAcceptRequestSchema>;
export type RiderPickupRequest = z.infer<typeof riderPickupRequestSchema>;
export type RiderOutRequest = z.infer<typeof riderOutRequestSchema>;
export type RiderDeliverRequest = z.infer<typeof riderDeliverRequestSchema>;
export type RiderFailRequest = z.infer<typeof riderFailRequestSchema>;
export type RiderNoteRequest = z.infer<typeof riderNoteRequestSchema>;
export type ProductionRiderSelfResponse = z.infer<typeof riderSelfResponseSchema>;
export type ProductionRiderJobResponse = z.infer<typeof riderJobResponseSchema>;
export type ProductionRiderJobsResponse = z.infer<typeof riderJobsResponseSchema>;
export type ProductionRiderHistoryResponse = z.infer<typeof riderHistoryResponseSchema>;
export type RiderActionResponse = z.infer<typeof riderActionResponseSchema>;
