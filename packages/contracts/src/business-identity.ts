import { z } from "zod";

/** Customer-facing identity only. Private business and licensing details
 * must never be included in this projection. */
export const publicBusinessIdentitySchema = z.strictObject({
  businessName: z.string().trim().min(1).max(160).refine(v => !/[\u0000-\u001f\u007f]/.test(v)),
});
export type PublicBusinessIdentity = z.infer<typeof publicBusinessIdentitySchema>;
