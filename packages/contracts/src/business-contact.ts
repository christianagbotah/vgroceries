import { z } from "zod";

/** Only fields intended for customer support publication. No legal identity,
 * revision, private configuration, or credentials belong in this response. */
export const publicBusinessContactSchema = z.strictObject({
  supportPhone: z.union([z.literal(""), z.string().regex(/^\+[1-9][0-9]{7,14}$/)]),
  supportEmail: z.union([z.literal(""), z.string().email().max(254)]),
  address: z.string().max(500),
  operatingHours: z.string().max(200),
  receiptFooter: z.string().max(300),
});
export type PublicBusinessContact = z.infer<typeof publicBusinessContactSchema>;
