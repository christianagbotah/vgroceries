import { z } from "zod";

export const pickupAppointmentPolicyInputSchema = z.object({
  active: z.boolean(),
  serviceDays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
    .refine(days => new Set(days).size===days.length,"Weekdays must be unique"),
  opensAt: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
  slotMinutes: z.union([z.literal(30),z.literal(60)]),
  capacity: z.number().int().min(1).max(50),
  minLeadMinutes: z.number().int().min(30).max(1440),
  maxDaysAhead: z.number().int().min(1).max(14),
}).strict().superRefine((p,ctx)=>{
  const minute=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
  const span=minute(p.closesAt)-minute(p.opensAt);
  if(span<30||span>720||span%p.slotMinutes!==0)
    ctx.addIssue({code:"custom",path:["closesAt"],message:"Opening hours must span exact 30- or 60-minute slots, no more than 12 hours."});
});
export type PickupAppointmentPolicyInput=z.infer<typeof pickupAppointmentPolicyInputSchema>;
export const pickupAppointmentPolicyViewSchema=pickupAppointmentPolicyInputSchema.safeExtend({
  nodeId:z.string().min(1),
  updatedAt:z.string().datetime({offset:true}),
});
export type PickupAppointmentPolicyView=z.infer<typeof pickupAppointmentPolicyViewSchema>;

export const pickupAppointmentSlotSchema=z.object({
  startsAt:z.string().datetime({offset:true}),
  endsAt:z.string().datetime({offset:true}),
  available:z.number().int().nonnegative(),
  capacity:z.number().int().positive(),
}).strict();
export type PickupAppointmentSlot=z.infer<typeof pickupAppointmentSlotSchema>;
export const pickupAppointmentViewSchema=z.object({
  startsAt:z.string().datetime({offset:true}),
  endsAt:z.string().datetime({offset:true}),
  status:z.enum(["booked","cancelled","completed"]),
  updatedAt:z.string().datetime({offset:true}),
}).strict();
export type PickupAppointmentView=z.infer<typeof pickupAppointmentViewSchema>;
export const pickupAppointmentOptionsSchema=z.object({
  enabled:z.boolean(), ready:z.boolean(),
  timezone:z.literal("Africa/Accra"),
  slots:z.array(pickupAppointmentSlotSchema).max(400),
  appointment:pickupAppointmentViewSchema.nullable(),
}).strict();
export type PickupAppointmentOptions=z.infer<typeof pickupAppointmentOptionsSchema>;
export const bookPickupAppointmentRequestSchema=z.object({
  startsAt:z.string().datetime({offset:true}),
}).strict();
export const cancelPickupAppointmentRequestSchema=z.object({}).strict();
export const pickupAppointmentMutationResponseSchema=z.object({
  appointment:pickupAppointmentViewSchema,
}).strict();
export type PickupAppointmentMutationResponse=z.infer<typeof pickupAppointmentMutationResponseSchema>;
