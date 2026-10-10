import { z } from "zod";

export const electronicPaymentMethodSchema = z.enum([
  "mobile_money",
  "card_hosted",
  "bank_transfer",
]);

export type ElectronicPaymentMethod = z.infer<typeof electronicPaymentMethodSchema>;

export const paymentInitiationRequestSchema = z
  .object({
    payerPhone: z.string().regex(/^\+233\d{9}$/, "Payer phone must use Ghana +233 format").optional(),
  })
  .strict();

export interface PaymentInitiationRequest {
  payerPhone?: string;
}

export type PaymentProviderAction =
  | { kind: "redirect"; url: string }
  | { kind: "prompt"; message: string; reference?: string }
  | { kind: "instructions"; message: string; reference?: string }
  | { kind: "none" };

export interface PaymentInitiationResult {
  attemptId: string;
  method: ElectronicPaymentMethod;
  attemptStatus: string;
  paymentStatus: string;
  action: PaymentProviderAction;
}

export const paymentProviderActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("redirect"), url: z.string().url() }).strict(),
  z.object({ kind: z.literal("prompt"), message: z.string().min(1), reference: z.string().min(1).optional() }).strict(),
  z.object({ kind: z.literal("instructions"), message: z.string().min(1), reference: z.string().min(1).optional() }).strict(),
  z.object({ kind: z.literal("none") }).strict(),
]);

export const paymentInitiationResultSchema = z
  .object({
    attemptId: z.string().min(1),
    method: electronicPaymentMethodSchema,
    attemptStatus: z.string().min(1),
    paymentStatus: z.string().min(1),
    action: paymentProviderActionSchema,
  })
  .strict();

export interface PaymentListQuery {
  page: number;
  perPage: number;
  status?: string;
  settlementState?: string;
  provider?: string;
  method?: ElectronicPaymentMethod;
  orderReference?: string;
  from?: string;
  to?: string;
}

const isoTimestampSchema = z.string().datetime({ offset: true });

export const paymentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
    status: z.enum(["initiated", "pending", "succeeded", "failed", "expired"]).optional(),
    settlementState: z.enum(["unsettled", "settled", "reconciled", "exception"]).optional(),
    provider: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).optional(),
    method: electronicPaymentMethodSchema.optional(),
    orderReference: z.string().trim().min(1).max(128).optional(),
    from: isoTimestampSchema.optional(),
    to: isoTimestampSchema.optional(),
  })
  .strict();

export const paymentLedgerRowSchema = z
  .object({
    attemptId: z.string().min(1),
    orderId: z.string().min(1),
    orderReference: z.string().min(1),
    provider: z.string().min(1).max(64),
    method: electronicPaymentMethodSchema,
    currency: z.literal("GHS"),
    amountMinor: z.number().int().positive(),
    status: z.enum(["initiated", "pending", "succeeded", "failed", "expired"]),
    initiationState: z.enum(["created", "accepted", "uncertain", "rejected"]),
    settlementState: z.enum(["unsettled", "settled", "reconciled", "exception"]),
    callbackCount: z.number().int().nonnegative(),
    providerReference: z.string().min(1).optional(),
    failureReason: z.string().min(1).optional(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    resolvedAt: isoTimestampSchema.optional(),
  })
  .strict();

export const paymentListResponseSchema = z
  .object({
    page: z.number().int().min(1),
    perPage: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    items: z.array(paymentLedgerRowSchema),
  })
  .strict();

export const paymentProviderEventResponseSchema = z
  .object({ accepted: z.literal(true), duplicate: z.boolean() })
  .strict();

export interface PaymentReconcileResponse {
  attemptId: string;
  result: "matched" | "exception";
}

export const paymentReconcileResponseSchema = z
  .object({
    attemptId: z.string().min(1),
    result: z.enum(["matched", "exception"]),
  })
  .strict();
