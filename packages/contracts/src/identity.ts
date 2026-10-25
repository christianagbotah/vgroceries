import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const phoneSchema = z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,19}$/);
const clientSchema = z.enum(["web", "native"]).default("web");
export const loginIdentifierSchema = z.string().trim().min(3).max(254);

const identifierLoginSchema = z.strictObject({
  identifier: loginIdentifierSchema,
  password: z.string().min(1).max(256),
  client: clientSchema,
});
export const legacyEmailLoginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(256),
  client: clientSchema,
});
export const loginRequestSchema = z.union([identifierLoginSchema, legacyEmailLoginSchema]);

export const registerRequestSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  email: emailSchema.optional(),
  phone: phoneSchema,
  password: z.string().min(12).max(256),
  client: clientSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;

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
