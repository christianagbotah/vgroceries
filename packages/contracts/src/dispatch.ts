import { z } from "zod";

/**
 * Shared API contracts — dispatch, delivery providers, rider fleet (staff).
 *
 * Legacy interfaces remain below for the mock/frontend adapter surface. The
 * Zod schemas in the production section are the authoritative REST contract.
 */

/* ------------------------------------------------------------------ */
/* Legacy mock/frontend compatibility                                  */
/* ------------------------------------------------------------------ */

export interface DispatchReadyRow {
  id: string;
  reference: string;
  customerName: string;
  customerPhone: string;
  zone?: string;
  zoneId?: string;
  slotLabel?: string;
  totalLabel: string;
  paymentMethod: string;
  paymentStatus: string;
  codAmountMinor: number;
  lineCount: number;
}

export interface DispatchJobRow {
  id: string;
  orderId: string;
  orderReference?: string;
  customerName?: string;
  status: string;
  riderName?: string;
  providerName?: string;
  zone?: string;
  failureReason?: string;
  rescheduledFor?: string;
  /** @deprecated Future COD authority, never production dispatch truth. */
  cashToCollectLabel?: string;
  /** @deprecated Future COD authority, never production dispatch truth. */
  cashCollectedAt?: string;
  /** @deprecated Future COD authority, never production dispatch truth. */
  remittedAt?: string;
  proof?: { method: string; detail: string; at: string };
  instructions?: string;
  events: { atLabel: string; actor: string; action: string; note?: string }[];
}

export interface DispatchRiderRow {
  id: string;
  name: string;
  phone: string;
  kind: string;
  vehicle: string;
  isAvailable: boolean;
  activeJobId?: string;
  zones: string[];
  /** @deprecated Future COD authority. */
  pendingRemittanceMinor: number;
  /** @deprecated Future COD authority. */
  pendingRemittanceLabel: string;
}

export interface DispatchProviderRow {
  id: string;
  name: string;
  capabilities: string[];
  status: string;
  notes: string;
}

export interface DispatchQueueResponse {
  ready: DispatchReadyRow[];
  jobs: DispatchJobRow[];
  riders: DispatchRiderRow[];
  providers: DispatchProviderRow[];
}

/** @deprecated Mock operation shape. Production uses dispatchAssignRequestSchema. */
export interface DispatchAssignRequest {
  orderId: string;
  riderId?: string;
  providerId?: string;
  manual?: boolean;
  actor?: string;
}

export interface DispatchAssignResponse {
  jobId: string;
  status: string;
}

/** @deprecated Mock operation shape. Production has dedicated command schemas. */
export interface DispatchJobActionRequest {
  jobId: string;
  action: "reschedule" | "return_to_store" | "remit";
  when?: string;
  note?: string;
  riderId?: string;
  amountMinor?: number;
  actor?: string;
}

export interface DispatchJobActionResponse {
  done: boolean;
}

export interface AdminRiderRow {
  id: string;
  name: string;
  phone: string;
  kind: string;
  vehicle: string;
  zoneNames: string;
  isAvailable: boolean;
  activeJobId?: string;
  lastLocationAt?: string;
  lastLocationLabel?: string;
  isDemo: boolean;
  /** @deprecated Future COD authority. */
  pendingRemittanceLabel: string;
  completedJobs: number;
}

/** @deprecated Mock operation shape. Production uses riderAvailabilityRequestSchema. */
export interface RiderToggleRequest {
  riderId: string;
  available: boolean;
  actor?: string;
}

export interface RiderToggleResponse {
  isAvailable: boolean;
}

/** Provider registry row used by the current staff screen. */
export interface ProviderRow {
  id: string;
  name: string;
  capabilities: string[];
  status: string;
  notes: string;
  capabilitiesNote: string;
  isConfigured: boolean;
}

/* ------------------------------------------------------------------ */
/* Production Dispatch Authority                                      */
/* ------------------------------------------------------------------ */

const isoTimestampSchema = z.string().datetime({ offset: true });
const noteSchema = z.string().trim().min(1).max(500);
const shortTextSchema = z.string().trim().min(1).max(120);
const referenceSchema = z.string().trim().min(1).max(256);

export const deliveryStatusSchema = z.enum([
  "unassigned",
  "assigned",
  "accepted",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "failed",
  "rescheduled",
  "return_to_store",
]);
export type ProductionDeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const dispatchActionSchema = z.enum([
  "assign",
  "unassign",
  "reassign",
  "reschedule",
  "return_to_store",
  "receive_returned_goods",
  "provider_transition",
]);
export type DispatchAllowedAction = z.infer<typeof dispatchActionSchema>;

export const dispatchBlockerSchema = z.enum([
  "order_not_handed_over",
  "order_cancelled",
  "rider_offline",
  "rider_busy",
  "job_already_assigned",
  "custody_not_safe_for_reassignment",
  "proof_required",
  "proof_method_unavailable",
  "failure_reason_required",
  "return_not_physically_received",
  "reschedule_not_due",
  "invalid_state",
]);
export type DispatchBlocker = z.infer<typeof dispatchBlockerSchema>;

export const dispatchFailureReasonSchema = z.enum([
  "customer_unavailable",
  "customer_refused",
  "address_problem",
  "unable_to_contact",
  "access_or_safety_issue",
  "vehicle_or_operational_issue",
  "other",
]);
export type DispatchFailureReason = z.infer<typeof dispatchFailureReasonSchema>;

/** PIN is intentionally unavailable until an order-bound verifier exists. */
export const dispatchProofMethodSchema = z.enum(["signature", "photo_note"]);
export type DispatchProofMethod = z.infer<typeof dispatchProofMethodSchema>;

export const dispatchCustodyStateSchema = z.enum([
  "dispatch",
  "rider",
  "provider",
  "customer",
  "return_pending",
  "store_returned",
]);
export type DispatchCustodyState = z.infer<typeof dispatchCustodyStateSchema>;

export const riderDeclaredAvailabilitySchema = z.enum(["available", "offline"]);
export const riderEffectiveAvailabilitySchema = z.enum(["available", "offline", "busy"]);
export type RiderDeclaredAvailability = z.infer<typeof riderDeclaredAvailabilitySchema>;
export type RiderEffectiveAvailability = z.infer<typeof riderEffectiveAvailabilitySchema>;

export const dispatchManualProviderSchema = z.object({
  providerKey: shortTextSchema,
  providerName: shortTextSchema.optional(),
  reference: referenceSchema.optional(),
}).strict();

const assignmentFields = {
  riderProfileId: z.string().trim().min(1).max(128).optional(),
  manualProvider: dispatchManualProviderSchema.optional(),
  note: noteSchema.optional(),
};

const assignmentSchema = z.object(assignmentFields).strict().superRefine((value, ctx) => {
  const targetCount = Number(Boolean(value.riderProfileId)) + Number(Boolean(value.manualProvider));
  if (targetCount !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["riderProfileId"],
      message: "Exactly one riderProfileId or manualProvider target is required.",
    });
  }
});

export const dispatchAssignRequestSchema = assignmentSchema;
export const dispatchReassignRequestSchema = assignmentSchema;
export const dispatchUnassignRequestSchema = z.object({ note: noteSchema.optional() }).strict();
export const dispatchRescheduleRequestSchema = z.object({
  when: isoTimestampSchema,
  note: noteSchema.optional(),
}).strict();
export const dispatchReturnRequestSchema = z.object({ note: noteSchema.optional() }).strict();
export const dispatchReturnedRequestSchema = z.object({ note: noteSchema.optional() }).strict();

export const dispatchProofSchema = z.object({
  method: dispatchProofMethodSchema,
  reference: referenceSchema,
  note: noteSchema.optional(),
}).strict();

export const dispatchProviderTransitionRequestSchema = z.object({
  action: z.enum(["picked_up", "out_for_delivery", "delivered", "failed"]),
  proof: dispatchProofSchema.optional(),
  failureReason: dispatchFailureReasonSchema.optional(),
  note: noteSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "delivered" && !value.proof) {
    ctx.addIssue({ code: "custom", path: ["proof"], message: "Proof is required for delivery." });
  }
  if (value.action === "failed" && !value.failureReason) {
    ctx.addIssue({ code: "custom", path: ["failureReason"], message: "Failure reason is required." });
  }
  if (value.action !== "delivered" && value.proof) {
    ctx.addIssue({ code: "custom", path: ["proof"], message: "Proof is only accepted for delivery." });
  }
  if (value.action !== "failed" && value.failureReason) {
    ctx.addIssue({ code: "custom", path: ["failureReason"], message: "Failure reason is only accepted for failure." });
  }
  if (value.action === "failed" && value.failureReason === "other" && !value.note) {
    ctx.addIssue({ code: "custom", path: ["note"], message: "A note is required when failure reason is other." });
  }
});

export const dispatchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  status: deliveryStatusSchema.optional(),
}).strict();

export const dispatchEventViewSchema = z.object({
  action: z.string().min(1),
  actorKind: z.enum(["staff", "rider", "system"]),
  actorId: z.string().min(1).optional(),
  at: isoTimestampSchema,
  note: z.string().min(1).max(500).optional(),
}).strict();

export const dispatchAssignmentViewSchema = z.object({
  kind: z.enum(["rider", "manual_provider"]),
  riderProfileId: z.string().min(1).optional(),
  riderName: z.string().min(1).optional(),
  providerKey: z.string().min(1).optional(),
  providerName: z.string().min(1).optional(),
  manualProviderReference: z.string().min(1).optional(),
}).strict();

export const dispatchQueueRowSchema = z.object({
  orderId: z.string().min(1),
  reference: z.string().min(1),
  jobId: z.string().min(1).optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  zoneId: z.string().min(1).optional(),
  zoneName: z.string().min(1).optional(),
  slotStartsAt: isoTimestampSchema.optional(),
  handedOverAt: isoTimestampSchema,
  paymentMethod: z.string().min(1),
  paymentStatus: z.string().min(1),
  codDueMinor: z.number().int().nonnegative().optional(),
  deliveryStatus: deliveryStatusSchema,
  custodyState: dispatchCustodyStateSchema.optional(),
  assignment: dispatchAssignmentViewSchema.optional(),
  failureReason: dispatchFailureReasonSchema.optional(),
  rescheduledFor: isoTimestampSchema.optional(),
  returnsInspectionMessage: z.literal("Returned to store — awaiting Returns inspection.").optional(),
  allowedActions: z.array(dispatchActionSchema),
  blockers: z.array(dispatchBlockerSchema),
}).strict();

export const dispatchQueueResponseSchema = z.object({
  page: z.number().int().min(1),
  perPage: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  items: z.array(dispatchQueueRowSchema),
}).strict();

export const dispatchJobDetailResponseSchema = z.object({
  orderId: z.string().min(1),
  reference: z.string().min(1),
  jobId: z.string().min(1),
  deliveryStatus: deliveryStatusSchema,
  custodyState: dispatchCustodyStateSchema,
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  paymentMethod: z.string().min(1),
  paymentStatus: z.string().min(1),
  codDueMinor: z.number().int().nonnegative().optional(),
  assignment: dispatchAssignmentViewSchema.optional(),
  failureReason: dispatchFailureReasonSchema.optional(),
  failureNote: z.string().min(1).max(500).optional(),
  rescheduledFor: isoTimestampSchema.optional(),
  returnedToStoreAt: isoTimestampSchema.optional(),
  returnsInspectionMessage: z.literal("Returned to store — awaiting Returns inspection.").optional(),
  proof: dispatchProofSchema.optional(),
  events: z.array(dispatchEventViewSchema),
  allowedActions: z.array(dispatchActionSchema),
  blockers: z.array(dispatchBlockerSchema),
}).strict();

export const dispatchRiderFleetRowSchema = z.object({
  riderProfileId: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string(),
  kind: z.enum(["in_house", "contracted"]),
  vehicle: z.enum(["motorcycle", "bicycle", "car"]),
  declaredAvailability: riderDeclaredAvailabilitySchema,
  effectiveAvailability: riderEffectiveAvailabilitySchema,
  activeJobId: z.string().min(1).optional(),
  completedJobs: z.number().int().nonnegative(),
}).strict();

export const dispatchRiderFleetResponseSchema = z.object({
  riders: z.array(dispatchRiderFleetRowSchema),
}).strict();
export const dispatchRiderDetailResponseSchema = dispatchRiderFleetRowSchema;

export const dispatchActionResponseSchema = z.object({
  jobId: z.string().min(1),
  orderId: z.string().min(1),
  deliveryStatus: deliveryStatusSchema,
  custodyState: dispatchCustodyStateSchema,
  allowedActions: z.array(dispatchActionSchema),
  blockers: z.array(dispatchBlockerSchema),
}).strict();

export type DispatchListQuery = z.infer<typeof dispatchListQuerySchema>;
export type ProductionDispatchAssignRequest = z.infer<typeof dispatchAssignRequestSchema>;
export type ProductionDispatchReassignRequest = z.infer<typeof dispatchReassignRequestSchema>;
export type ProductionDispatchUnassignRequest = z.infer<typeof dispatchUnassignRequestSchema>;
export type ProductionDispatchRescheduleRequest = z.infer<typeof dispatchRescheduleRequestSchema>;
export type ProductionDispatchReturnRequest = z.infer<typeof dispatchReturnRequestSchema>;
export type ProductionDispatchReturnedRequest = z.infer<typeof dispatchReturnedRequestSchema>;
export type DispatchProviderTransitionRequest = z.infer<typeof dispatchProviderTransitionRequestSchema>;
export type ProductionDispatchQueueResponse = z.infer<typeof dispatchQueueResponseSchema>;
export type DispatchJobDetailResponse = z.infer<typeof dispatchJobDetailResponseSchema>;
export type DispatchRiderFleetResponse = z.infer<typeof dispatchRiderFleetResponseSchema>;
export type DispatchActionResponse = z.infer<typeof dispatchActionResponseSchema>;
