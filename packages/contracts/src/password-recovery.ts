import { z } from "zod";

/**
 * Single-use, email-delivered credential recovery. Never returns raw tokens
 * in HTTP responses; the email link carries its token in a fragment.
 */
export const requestPasswordResetSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
});
export const completePasswordResetSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(256),
});
export const passwordRecoveryNoticeSchema = z.object({
  message: z.string().min(1),
}).strict();
export type PasswordResetRequest = z.infer<typeof requestPasswordResetSchema>;
export type PasswordResetComplete = z.infer<typeof completePasswordResetSchema>;
export type PasswordRecoveryNotice = z.infer<typeof passwordRecoveryNoticeSchema>;
