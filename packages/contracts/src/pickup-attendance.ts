import { z } from "zod";

/** Private admin-only attendance evidence; not proof of physical collection. */
export const pickupAttendanceInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("late_arrival"),
    reason: z.enum(["customer_arrived_after_start", "centre_delay", "other"]),
    note: z.string().trim().min(3).max(350).optional(),
  }).strict(),
  z.object({
    kind: z.literal("missed_window"),
    reason: z.enum(["customer_not_present", "customer_unreachable", "other"]),
    note: z.string().trim().min(3).max(350).optional(),
  }).strict(),
]);
export type PickupAttendanceInput = z.infer<typeof pickupAttendanceInputSchema>;

export const pickupAttendanceRecordSchema = z.object({
  id: z.string(), orderId: z.string(), nodeId: z.string(),
  appointmentBookedAt: z.string().datetime(),
  startsAt: z.string().datetime(), endsAt: z.string().datetime(),
  kind: z.enum(["late_arrival", "missed_window"]),
  reason: z.string(), note: z.string().nullable(),
  observedAt: z.string().datetime(), recordedById: z.string(),
}).strict();
export type PickupAttendanceRecord = z.infer<typeof pickupAttendanceRecordSchema>;

export const pickupAttendanceContextSchema = z.object({
  enabled: z.boolean(),
  canRecordLateArrival: z.boolean(),
  canRecordMissedWindow: z.boolean(),
  appointment: z.object({
    status: z.enum(["booked", "cancelled", "completed"]),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    bookedAt: z.string().datetime(),
  }).strict().nullable(),
}).strict();
export type PickupAttendanceContext = z.infer<typeof pickupAttendanceContextSchema>;
