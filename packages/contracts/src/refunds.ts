import { z } from "zod";
import { electronicPaymentMethodSchema } from "./payments";

const isoTimestampSchema = z.string().datetime({ offset: true });
const providerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);

export const refundStatusSchema = z.enum([
  "awaiting_approval",
  "approved",
  "processing",
  "succeeded",
  "failed",
  "requires_review",
]);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

export const refundSourceTypeSchema = z.enum([
  "customer_cancellation",
  "payment_review_cancellation",
  "overcharge_correction",
  "return",
]);
export type RefundSourceType = z.infer<typeof refundSourceTypeSchema>;

export const refundActionSchema = z.enum(["approve", "execute", "retry", "reconcile"]);
export type RefundAction = z.infer<typeof refundActionSchema>;

export const refundActionRequestSchema = z.object({ action: refundActionSchema }).strict();
export type RefundActionRequest = z.infer<typeof refundActionRequestSchema>;

export const adminOrderFinancialActionRequestSchema = z
  .object({
    action: z.enum(["cancel_refund", "refund_excess_capture"]),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type AdminOrderFinancialActionRequest = z.infer<typeof adminOrderFinancialActionRequestSchema>;

export const customerRefundViewSchema = z
  .object({
    id: z.string().min(1),
    amountMinor: z.number().int().positive(),
    amountLabel: z.string().min(1),
    status: refundStatusSchema,
    sourceLabel: z.string().min(1),
    createdAt: isoTimestampSchema,
    approvedAt: isoTimestampSchema.optional(),
    resolvedAt: isoTimestampSchema.optional(),
    failureReason: z.string().min(1).optional(),
  })
  .strict();
export type CustomerRefundView = z.infer<typeof customerRefundViewSchema>;

export const refundActionResponseSchema = z
  .object({
    refundId: z.string().min(1),
    refundStatus: refundStatusSchema,
    executionStatus: z.enum(["created", "pending", "succeeded", "failed", "uncertain"]).optional(),
    reconciliationState: z.enum(["unreconciled", "reconciled", "exception"]).optional(),
    orderPaymentStatus: z.string().min(1),
  })
  .strict();
export type RefundActionResponse = z.infer<typeof refundActionResponseSchema>;

export const adminOrderFinancialActionResponseSchema = z
  .object({
    orderId: z.string().min(1),
    fulfilmentStatus: z.string().min(1),
    paymentStatus: z.string().min(1),
    refundIds: z.array(z.string().min(1)),
  })
  .strict();
export type AdminOrderFinancialActionResponse = z.infer<typeof adminOrderFinancialActionResponseSchema>;

export const refundListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
    status: refundStatusSchema.optional(),
    provider: providerIdSchema.optional(),
    method: electronicPaymentMethodSchema.optional(),
    sourceType: refundSourceTypeSchema.optional(),
    orderReference: z.string().trim().min(1).max(128).optional(),
    from: isoTimestampSchema.optional(),
    to: isoTimestampSchema.optional(),
  })
  .strict();
export type RefundListQuery = z.infer<typeof refundListQuerySchema>;

export const refundLedgerRowSchema = z
  .object({
    refundId: z.string().min(1),
    orderId: z.string().min(1),
    orderReference: z.string().min(1),
    paymentAttemptId: z.string().min(1),
    provider: providerIdSchema,
    method: electronicPaymentMethodSchema,
    currency: z.literal("GHS"),
    captureAmountMinor: z.number().int().positive(),
    refundAmountMinor: z.number().int().positive(),
    alreadyRefundedMinor: z.number().int().nonnegative(),
    remainingRefundableMinor: z.number().int().nonnegative(),
    status: refundStatusSchema,
    sourceType: refundSourceTypeSchema,
    reason: z.string().min(1).max(500),
    requestedBy: z.string().min(1),
    approvedBy: z.string().min(1).optional(),
    executionStatus: z.enum(["created", "pending", "succeeded", "failed", "uncertain"]).optional(),
    reconciliationState: z.enum(["unreconciled", "reconciled", "exception"]).optional(),
    attemptCount: z.number().int().nonnegative(),
    providerRefundReference: z.string().min(1).optional(),
    failureReason: z.string().min(1).optional(),
    createdAt: isoTimestampSchema,
    approvedAt: isoTimestampSchema.optional(),
    resolvedAt: isoTimestampSchema.optional(),
  })
  .strict();
export type RefundLedgerRow = z.infer<typeof refundLedgerRowSchema>;

export const refundListResponseSchema = z
  .object({
    page: z.number().int().min(1),
    perPage: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    items: z.array(refundLedgerRowSchema),
  })
  .strict();
export type RefundListResponse = z.infer<typeof refundListResponseSchema>;
