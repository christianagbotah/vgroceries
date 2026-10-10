import { z } from "zod";

export const loginRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
  client: z.enum(["web", "native"]).default("web"),
});
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
export type WebSessionResponse = z.infer<typeof webSessionResponseSchema>;
export type NativeSessionResponse = z.infer<typeof nativeSessionResponseSchema>;
