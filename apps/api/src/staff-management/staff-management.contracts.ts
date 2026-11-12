import { z } from "zod";

const uniqueLocationIds = z.array(z.string().min(1).max(128)).min(1).max(10)
  .refine(ids => new Set(ids).size === ids.length, "Location grants must be unique.");

export const createCashierSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  phone: z.string().trim().max(20).optional().default(""),
  // Initial credential entered once by the administrator; never logged,
  // included in audit events, or returned by the API.
  password: z.string().min(12).max(256),
  locationIds: uniqueLocationIds,
});

// Unlike legacy administrator-issued passwords, invitations let each
// cashier choose their own credential, after a short-lived, one-use code.
export const inviteCashierSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  phone: z.string().trim().max(20).optional().default(""),
  locationIds: uniqueLocationIds,
});

export const acceptCashierInvitationSchema = z.strictObject({
  code: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(256),
});

export const manageCashierSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("set_active"), active: z.boolean() }),
  z.strictObject({ action: z.literal("assign_locations"), locationIds: uniqueLocationIds }),
  z.strictObject({ action: z.literal("reset_password"), password: z.string().min(12).max(256) }),
]);

export const staffRowSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  role: z.enum(["admin", "inventory_manager", "cashier", "rider"]),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  locationIds: z.array(z.string()),
});
export const staffLocationSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
});
export const staffListSchema = z.strictObject({
  staff: z.array(staffRowSchema),
  locations: z.array(staffLocationSchema),
  capped: z.boolean(),
});
export type InviteCashierRequest = z.infer<typeof inviteCashierSchema>;
export type AcceptCashierInvitationRequest = z.infer<typeof acceptCashierInvitationSchema>;
export type CreateCashierRequest = z.infer<typeof createCashierSchema>;
export type ManageCashierRequest = z.infer<typeof manageCashierSchema>;
export type StaffRow = z.infer<typeof staffRowSchema>;
