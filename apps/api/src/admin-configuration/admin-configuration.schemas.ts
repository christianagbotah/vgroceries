import { z } from "zod";
const text = (max: number) => z.string().trim().max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const phone = z.union([z.literal(""), z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/)]);
const email = z.union([z.literal(""), z.string().trim().email().max(254)]);
export const version = z.number().int().min(1).max(2147483646);
export const businessProfileSchema = z.strictObject({
  version, businessName: text(160).refine(v => v.length > 0), supportPhone: phone,
  supportEmail: email, address: text(500), registrationNumber: text(100),
  operatingHours: text(200), receiptFooter: text(300),
});
export const deliveryPartnerSchema = z.strictObject({
  name: text(160).refine(v => v.length > 0), contactPhone: phone, contactEmail: email,
  coverage: text(500), notes: text(500), active: z.boolean(),
});
export const deliveryPartnerUpdateSchema = deliveryPartnerSchema.extend({version});
export const integrationIdSchema = z.enum(["hubtel-checkout","hubtel-sms","paystack-payment"]);
const secret = z.string().min(1).max(4096).refine(v => v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v));
const schemas = {
  "hubtel-checkout": z.strictObject({clientId:secret,clientSecret:secret,merchantAccountNumber:z.string().regex(/^\d{3,32}$/)}),
  "hubtel-sms": z.strictObject({clientId:secret,clientSecret:secret,senderId:z.string().regex(/^[A-Za-z0-9 ._-]{1,11}$/)}),
  "paystack-payment": z.strictObject({secretKey:secret}),
};
export function parseCredentialDraft(id: z.infer<typeof integrationIdSchema>, value: unknown) {
  const envelope = z.strictObject({version:z.number().int().min(0).max(2147483646),credentials: z.unknown()}).safeParse(value);
  if (!envelope.success) return null;
  const parsed = schemas[id].safeParse(envelope.data.credentials);
  return parsed.success ? {version:envelope.data.version, credentials:parsed.data} : null;
}
