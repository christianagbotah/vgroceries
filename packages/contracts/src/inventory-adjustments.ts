import { z } from "zod";

/** Reviewed, branch-scoped physical lot adjustment, not a sale or refund. */
const delta = z.string().regex(/^[+-]?(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/);
export const requestAdjustmentSchema = z.strictObject({
  lotId: z.string().min(1).max(128),
  variantId: z.string().min(1).max(128),
  delta,
  reason: z.string().trim().min(8).max(200),
  note: z.string().trim().max(1000).optional(),
  locationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
});
export const decideAdjustmentSchema = z.strictObject({
  adjustmentId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
});
export const adjustmentOutcomeSchema = z.strictObject({
  adjustmentId: z.string().uuid(),
  status: z.enum(["pending_approval", "approved", "rejected"]),
  replayed: z.boolean().optional(),
});
export const adjustmentHistoryRowSchema = z.strictObject({
  id: z.string(),
  productName: z.string(),
  variantName: z.string(),
  lotNumber: z.string(),
  delta: z.string(),
  reason: z.string(),
  note: z.string().optional(),
  status: z.enum(["pending_approval", "approved", "rejected"]),
  requestedBy: z.string(),
  requestedById: z.string(),
  approvedBy: z.string().optional(),
  atLabel: z.string(),
  beforeQuantity: z.string(),
  afterQuantity: z.string().optional(),
});
export const adjustmentHistorySchema = z.array(adjustmentHistoryRowSchema);

export type RequestAdjustment = z.infer<typeof requestAdjustmentSchema>;
export type DecideAdjustment = z.infer<typeof decideAdjustmentSchema>;

export const stockAdjustmentLotOptionsSchema = z.strictObject({
  selectedLocationId: z.string(),
  locations: z.array(z.strictObject({id:z.string(),name:z.string()})).max(100),
  lots: z.array(z.strictObject({
    id:z.string(), variantId:z.string(),
    productName:z.string(), variantName:z.string(), lotNumber:z.string(),
    quantity:z.string(),unit:z.string(),eligible:z.boolean(),
    ineligibleReason:z.string().nullable(),
  })).max(150),
  capped:z.boolean(),
});
export type StockAdjustmentLotOptions=z.infer<typeof stockAdjustmentLotOptionsSchema>;
export type StockAdjustmentHistory=z.infer<typeof adjustmentHistorySchema>;
export type StockAdjustmentOutcome=z.infer<typeof adjustmentOutcomeSchema>;
