/**
 * Shared API contracts — validation schemas (zod).
 *
 * These schemas are the single source of request validation at the client
 * adapter boundary (src/services/adapters/http.ts runs them before a request
 * is sent) and the reference for the NestJS backend's server-side validation
 * (defense in depth: the server re-validates authoritatively).
 *
 * They are also exercised by `scripts/contracts-check.ts`, which validates
 * live mock responses against the response schemas so the contracts cannot
 * silently drift from the actual service behaviour.
 *
 * Framework-free: zod runs identically in Node, Bun, browsers and React
 * Native, so the future Expo apps reuse these exact files.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Primitive conventions                                               */
/* ------------------------------------------------------------------ */

/** Positive decimal-string quantity, max 3 fractional digits (e.g. "1.5"). */
export const quantitySchema = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "Quantity must be a positive decimal string (e.g. \"1\" or \"1.5\")")
  .refine((v) => Number(v) > 0, "Quantity must be greater than zero");

/** Non-negative integer money in GHS minor units (pesewas). */
export const moneyMinorSchema = z
  .number()
  .int("Money must be an integer number of minor units")
  .nonnegative("Money must not be negative");

/** Integer entity id with a recognisable prefix, e.g. "ord_1011". */
export const idSchema = z.string().min(1);

/** ISO-8601 date string (YYYY-MM-DD) for expiry/receiving dates. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ------------------------------------------------------------------ */
/* Response envelope                                                   */
/* ------------------------------------------------------------------ */

export const apiErrorShapeSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export const apiEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: apiErrorShapeSchema }),
]);

/* ------------------------------------------------------------------ */
/* Request schemas — mutating operations                               */
/* ------------------------------------------------------------------ */

export const cartLineInputSchema = z.object({
  variantId: idSchema,
  quantity: quantitySchema,
});

export const checkoutQuoteRequestSchema = z.object({
  lines: z.array(cartLineInputSchema).min(1),
  zoneId: idSchema.optional(),
});

export const guestAddressInputSchema = z.object({
  label: z.string().optional(),
  recipientName: z.string().min(1),
  phone: z.string().min(1),
  locality: z.string().min(1),
  street: z.string().min(1),
  landmark: z.string().optional(),
  ghanaPostGps: z.string().optional(),
});

export const checkoutCompleteRequestSchema = z.object({
  lines: z.array(cartLineInputSchema).min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  customerEmail: z.string().optional(),
  customerId: idSchema.optional(),
  addressId: idSchema.optional(),
  guestAddress: guestAddressInputSchema.optional(),
  fulfilment: z.enum(["delivery", "collection"]),
  zoneId: idSchema.optional(),
  slotId: idSchema.optional(),
  paymentMethod: z.enum(["mobile_money", "card_hosted", "bank_transfer", "cash_counter", "cash_on_delivery"]),
  note: z.string().optional(),
  idempotencyKey: z.string().min(8, "Idempotency keys must be at least 8 characters"),
});

export const paymentOutcomeRequestSchema = z.object({
  orderId: idSchema,
  outcome: z.enum(["succeeded", "failed", "pending"]),
  providerRef: z.string().optional(),
});

export const accountCancelRequestSchema = z.object({
  orderId: idSchema,
  reason: z.string().min(1),
});

export const createReturnRequestSchema = z.object({
  orderId: idSchema,
  requestedBy: z.string().min(1),
  lines: z
    .array(
      z.object({
        orderLineId: idSchema,
        quantity: quantitySchema,
        reason: z.string().min(1),
      })
    )
    .min(1),
  note: z.string().optional(),
});

export const posCompleteRequestSchema = z.object({
  sessionId: idSchema,
  cashierId: idSchema.optional(),
  lines: z.array(cartLineInputSchema).min(1),
  method: z.enum(["mobile_money", "card_hosted", "bank_transfer", "cash_counter", "cash_on_delivery"]),
  discountMinor: moneyMinorSchema.optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  cashReceivedMinor: moneyMinorSchema.optional(),
  idempotencyKey: z.string().min(8).optional(),
});

export const posHoldRequestSchema = z.object({
  sessionId: idSchema,
  cashierId: idSchema.optional(),
  label: z.string().optional(),
  lines: z.array(cartLineInputSchema).min(1),
});

export const sessionOpenRequestSchema = z.object({
  cashierId: idSchema,
  openingFloatMinor: moneyMinorSchema,
});

export const sessionMovementRequestSchema = z.object({
  sessionId: idSchema,
  kind: z.enum(["cash_in", "cash_out", "drop"]),
  amountMinor: moneyMinorSchema,
  note: z.string().min(1),
  actor: z.string().optional(),
});

export const sessionCloseRequestSchema = z.object({
  sessionId: idSchema,
  countedCashMinor: moneyMinorSchema,
  note: z.string(),
  actor: z.string().optional(),
});

export const receiveRequestSchema = z.object({
  supplierId: idSchema.optional(),
  poRef: z.string().optional(),
  lines: z
    .array(
      z.object({
        variantId: idSchema,
        quantity: quantitySchema,
        lotNumber: z.string().optional(),
        expiryDate: isoDateSchema.optional(),
        unitCostMinor: moneyMinorSchema.optional(),
        location: z.string().optional(),
      })
    )
    .min(1),
  note: z.string().optional(),
  actor: z.string().optional(),
});

export const adjustmentCreateRequestSchema = z.object({
  lines: z
    .array(
      z.object({
        variantId: idSchema,
        lotId: idSchema.optional(),
        delta: z.string().regex(/^[+-]?\d+(\.\d{1,3})?$/, "Adjustment delta must be a signed decimal string"),
        reason: z.string().min(1),
        note: z.string().optional(),
      })
    )
    .min(1),
  actor: z.string().optional(),
});

export const stocktakeCountRequestSchema = z.object({
  stocktakeId: idSchema,
  counts: z.record(z.string(), z.string()),
});

export const dispatchAssignRequestSchema = z
  .object({
    orderId: idSchema,
    riderId: idSchema.optional(),
    providerId: idSchema.optional(),
    manual: z.boolean().optional(),
    actor: z.string().optional(),
  })
  .refine((r) => Boolean(r.riderId || r.providerId || r.manual), {
    message: "Exactly one dispatch target is required (riderId, providerId or manual)",
  });

export const refundActionRequestSchema = z.object({
  refundId: idSchema,
  action: z.enum(["approve", "execute", "retry"]),
  actor: z.string().optional(),
});

export const riderActionRequestSchema = z.object({
  jobId: idSchema,
  riderId: idSchema,
  action: z.enum(["accept", "pickup", "out", "deliver", "fail", "note"]),
  proofMethod: z.enum(["pin", "signature", "photo_note"]).optional(),
  proofDetail: z.string().optional(),
  cashCollected: z.boolean().optional(),
  reason: z.string().optional(),
  note: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* Response schemas — conformance-checked against the live service     */
/* ------------------------------------------------------------------ */

export const pagedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pages: z.number().int().nonnegative(),
    perPage: z.number().int().positive(),
  });

export const catalogVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  unitSize: z.string(),
  priceMinor: z.number(),
  priceLabel: z.string(),
  compareAtPriceMinor: z.number().optional(),
  compareAtLabel: z.string().optional(),
  barcode: z.string().optional(),
  availableToSell: z.string(),
  isAvailable: z.boolean(),
});

export const catalogProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  categoryId: z.string(),
  shortDescription: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  image: z.string(),
  variants: z.array(catalogVariantSchema),
  anyAvailable: z.boolean(),
  minPriceMinor: z.number(),
  minPriceLabel: z.string(),
});

export const shopPageDataSchema = pagedSchema(catalogProductSchema);

export const zoneViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  areas: z.array(z.string()),
  feeMinor: z.number(),
  minimumOrderMinor: z.number(),
  serviceHours: z.string(),
  cutoff: z.string(),
  slotsPerDay: z.number(),
  isActive: z.boolean(),
});

export const quoteResponseSchema = z.object({
  ok: z.boolean(),
  lines: z.array(
    z.object({
      variantId: z.string(),
      productId: z.string(),
      productName: z.string(),
      variantName: z.string(),
      unit: z.string(),
      quantity: z.string(),
      unitPriceMinor: z.number(),
      lineTotalMinor: z.number(),
      available: z.string(),
      availableNow: z.boolean(),
    })
  ),
  subtotalMinor: z.number(),
  deliveryFeeMinor: z.number(),
  totalMinor: z.number(),
  minOrderMinor: z.number(),
  meetsMinimum: z.boolean(),
  conflicts: z.array(z.unknown()),
});

export const publicOrderSchema = z.object({
  id: z.string(),
  reference: z.string(),
  channel: z.enum(["online", "pos"]),
  customerName: z.string(),
  customerPhone: z.string(),
  fulfilment: z.enum(["delivery", "collection"]),
  createdAt: z.string(),
  createdAtLabel: z.string(),
  subtotalMinor: z.number(),
  discountMinor: z.number(),
  deliveryFeeMinor: z.number(),
  totalMinor: z.number(),
  totalLabel: z.string(),
  paymentStatus: z.string(),
  fulfilmentStatus: z.string(),
  deliveryStatus: z.string(),
  paymentAttempts: z.array(z.unknown()),
  lines: z.array(z.unknown()),
  notes: z.array(z.unknown()),
  events: z.array(z.unknown()),
  returns: z.array(z.unknown()),
  verificationCode: z.string().optional(),
});

export const adminReturnRowSchema = z.object({
  id: z.string(),
  reference: z.string(),
  orderId: z.string(),
  orderReference: z.string().optional(),
  channel: z.string(),
  customerName: z.string().optional(),
  requestedBy: z.string(),
  status: z.string(),
  createdAtLabel: z.string(),
  lines: z.array(z.unknown()),
  refundableMinor: z.number(),
});

export const riderJobViewSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  status: z.string(),
  items: z.array(z.string()),
  events: z.array(z.unknown()),
});

export const dashboardViewSchema = z.object({
  today: z.object({ date: z.string(), onlineMinor: z.number(), posMinor: z.number(), orders: z.number() }),
  actionable: z.object({
    awaitingConfirmation: z.number(),
    toPick: z.number(),
    toPack: z.number(),
    readyToDispatch: z.number(),
    pendingPayments: z.number(),
    returnsPending: z.number(),
    lowStock: z.number(),
    expiringSoon: z.number(),
    unassignedJobs: z.number(),
    openSessions: z.number(),
  }),
  recentOrders: z.array(z.unknown()),
  reports: z.object({
    salesByDay: z.array(z.unknown()),
    topProducts: z.array(z.unknown()),
    fulfilmentCounts: z.record(z.string(), z.number()),
    deliveryCounts: z.record(z.string(), z.number()),
    returnsSummary: z.object({
      total: z.number(),
      pending: z.number(),
      resolved: z.number(),
      refundedMinor: z.number(),
    }),
    cashSummary: z.object({ openSessions: z.number(), expectedMinor: z.number(), lastClosedDiffMinor: z.number() }),
    stockValue: z.object({ costBasisMinor: z.number(), sellableUnits: z.number(), zeroVariants: z.number(), lowVariants: z.number() }),
    paymentsReconciliation: z.object({ settled: z.number(), unsettled: z.number(), exceptions: z.number() }),
  }),
});

/**
 * Request validation registry: mock operation → zod schema.
 * The HTTP adapter looks schemas up here before sending; the contracts-check
 * script validates the mapping stays complete.
 */
export const requestSchemas: Record<string, z.ZodTypeAny> = {
  "checkout.quote": checkoutQuoteRequestSchema,
  "checkout.complete": checkoutCompleteRequestSchema,
  "checkout.payment-outcome": paymentOutcomeRequestSchema,
  "account.cancel": accountCancelRequestSchema,
  "account.create-return": createReturnRequestSchema,
  "admin.pos.complete": posCompleteRequestSchema,
  "admin.pos.hold": posHoldRequestSchema,
  "admin.sessions.open": sessionOpenRequestSchema,
  "admin.sessions.movement": sessionMovementRequestSchema,
  "admin.sessions.close": sessionCloseRequestSchema,
  "admin.inventory.receive": receiveRequestSchema,
  "admin.inventory.adjustments.create": adjustmentCreateRequestSchema,
  "admin.inventory.stocktakes.count": stocktakeCountRequestSchema,
  "admin.dispatch.assign": dispatchAssignRequestSchema,
  "admin.refund.action": refundActionRequestSchema,
  "rider.action": riderActionRequestSchema,
};

/** Validate a request body against its declared schema, if any. */
export function validateRequest(
  op: string,
  body: unknown
): { ok: true; value: Record<string, unknown> } | { ok: false; issues: string[] } {
  const schema = requestSchemas[op];
  if (!schema) return { ok: true, value: (body ?? {}) as Record<string, unknown> };
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, value: result.data as Record<string, unknown> };
  return {
    ok: false,
    issues: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}
