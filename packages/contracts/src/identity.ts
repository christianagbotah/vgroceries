import { z } from "zod";

/** Canonical Ghana mobile identity format used for customer authentication. */
export function normalizeGhanaPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s-]/g, "");
  if (/^\+233(?:2\d|5\d)\d{7}$/.test(compact)) return compact;
  if (/^233(?:2\d|5\d)\d{7}$/.test(compact)) return `+${compact}`;
  if (/^0(?:2\d|5\d)\d{7}$/.test(compact)) return `+233${compact.slice(1)}`;
  return null;
}

export const ghanaPhoneSchema = z
  .string()
  .trim()
  .min(10)
  .max(20)
  .refine((value) => normalizeGhanaPhone(value) !== null, "Enter a valid Ghana mobile number");

export const uatDemoAccountIdSchema = z.enum(["admin", "inventory_manager"]);
export type UatDemoAccountId = z.infer<typeof uatDemoAccountIdSchema>;
export const uatDemoSessionRequestSchema = z.strictObject({
  accountId: uatDemoAccountIdSchema,
});
export type UatDemoSessionRequest = z.infer<typeof uatDemoSessionRequestSchema>;
export interface UatDemoAccountView {
  id: UatDemoAccountId;
  label: string;
  role: "admin" | "inventory_manager";
}

export const loginRequestSchema = z
  .strictObject({
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    phone: ghanaPhoneSchema.optional(),
    password: z.string().min(1).max(256),
    client: z.enum(["web", "native"]).default("web"),
  })
  .refine((value) => Number(Boolean(value.email)) + Number(Boolean(value.phone)) === 1, {
    message: "Provide exactly one login identity: email or phone",
  });
export const registerRequestSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: ghanaPhoneSchema,
  password: z.string().min(12).max(256),
  client: z.enum(["web", "native"]).default("web"),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export const refreshRequestSchema = z.strictObject({
  refreshToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const sessionActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["admin", "inventory_manager", "customer", "rider"]),
  locationIds: z.array(z.string()),
});
const secretSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const webSessionResponseSchema = z.object({
  actor: sessionActorSchema,
  csrfToken: secretSchema,
  expiresAt: z.iso.datetime(),
});
export const nativeSessionResponseSchema = z.object({
  actor: sessionActorSchema,
  accessToken: secretSchema,
  accessExpiresAt: z.iso.datetime(),
  refreshToken: secretSchema,
  expiresAt: z.iso.datetime(),
});
export const sessionLookupResponseSchema = z.object({
  actor: sessionActorSchema,
  csrfToken: secretSchema.optional(),
});
export type SessionActor = z.infer<typeof sessionActorSchema>;
export type SessionLookupResponse = z.infer<typeof sessionLookupResponseSchema>;
export type WebSessionResponse = z.infer<typeof webSessionResponseSchema>;
export type NativeSessionResponse = z.infer<typeof nativeSessionResponseSchema>;
