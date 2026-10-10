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
  dateFrom?: string;
  dateTo?: string;
}

const isoTimestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/, "Expected an ISO-8601 timestamp");

export const paymentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(50),
    status: z.string().trim().min(1).max(64).optional(),
    settlementState: z.string().trim().min(1).max(64).optional(),
    provider: z.string().trim().min(1).max(64).optional(),
    method: electronicPaymentMethodSchema.optional(),
    orderReference: z.string().trim().min(1).max(128).optional(),
    dateFrom: isoTimestampSchema.optional(),
    dateTo: isoTimestampSchema.optional(),
  })
  .strict();

export interface PaymentReconcileResponse {
  attemptId: string;
  status: string;
  settlementState: string;
  changed: boolean;
}

export const paymentReconcileResponseSchema = z
  .object({
    attemptId: z.string().min(1),
    status: z.string().min(1),
    settlementState: z.string().min(1),
    changed: z.boolean(),
  })
  .strict();
