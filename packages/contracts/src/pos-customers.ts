import { z } from "zod";

/**
 * POS search is a limited identification aid, NOT a customer directory.
 * Cashiers see only customers linked to their currently assigned branches.
 * Never include full telephone, email, authentication or order details.
 */
export const posCustomerSearchQuerySchema = z.string().trim().min(2).max(80);
export const posCustomerSearchItemSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  phoneLast4: z.string().regex(/^\d{0,4}$/),
});
export const posCustomerSearchResultSchema = z.array(posCustomerSearchItemSchema).max(15);
export const posCustomerSearchEnvelopeSchema = z.strictObject({
  ok: z.literal(true),
  data: posCustomerSearchResultSchema,
});
export type PosCustomerSearchItem = z.infer<typeof posCustomerSearchItemSchema>;
