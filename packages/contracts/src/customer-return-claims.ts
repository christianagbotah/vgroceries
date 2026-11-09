import { z } from "zod";

/** Return claims are customer requests only. Not physical goods, refunds or payouts. */
const id=z.string().trim().min(1).max(128);
const qty=z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/)
  .refine(x=>Number(x)>0&&Number.isFinite(Number(x)),"Positive quantity required");
export const customerReturnClaimRequestSchema=z.object({
  orderId:id,
  reason:z.string().trim().min(10).max(600),
  evidenceNote:z.string().trim().min(10).max(1500).optional(),
  lines:z.array(z.object({
    orderLineId:id,quantity:qty,reason:z.string().trim().min(10).max(400),
  }).strict()).min(1).max(30).refine(lines=>
    new Set(lines.map(x=>x.orderLineId)).size===lines.length,
    "Each original line can appear only once"),
}).strict();
export type CustomerReturnClaimRequest=z.infer<typeof customerReturnClaimRequestSchema>;
export const customerReturnClaimCancelSchema=z.object({}).strict();
export const customerReturnClaimDecisionSchema=z.object({
  decision:z.enum(["accept","reject"]),
  reviewNote:z.string().trim().min(20).max(1000),
}).strict();
export type CustomerReturnClaimDecision=z.infer<typeof customerReturnClaimDecisionSchema>;
export const customerReturnClaimLineSchema=z.object({
  orderLineId:id,productName:z.string(),variantName:z.string(),unit:z.string(),
  quantity:qty,reason:z.string(),
}).strict();
export const customerReturnClaimViewSchema=z.object({
  id:id,reference:z.string(),orderId:id,orderReference:z.string(),
  status:z.enum(["requested","accepted","rejected","cancelled"]),
  reason:z.string(),evidenceNote:z.string().nullable(),
  createdAt:z.string().datetime({offset:true}),
  reviewedAt:z.string().datetime({offset:true}).nullable(),
  reviewNote:z.string().nullable(),cancelledAt:z.string().datetime({offset:true}).nullable(),
  lines:z.array(customerReturnClaimLineSchema),
}).strict();
export type CustomerReturnClaimView=z.infer<typeof customerReturnClaimViewSchema>;
export const customerReturnClaimsListSchema=z.object({
  enabled:z.boolean(),items:z.array(customerReturnClaimViewSchema),
  page:z.number().int().min(1),perPage:z.number().int().min(1).max(50),
  total:z.number().int().nonnegative(),
}).strict();
export type CustomerReturnClaimsList=z.infer<typeof customerReturnClaimsListSchema>;
export const customerReturnClaimEligibilitySchema=z.object({
  enabled:z.boolean(),orderId:id,
  lines:z.array(z.object({
    orderLineId:id,productName:z.string(),variantName:z.string(),
    unit:z.string(),availableQuantity:z.string(),
    orderedQuantity:z.string(),
  }).strict()),
}).strict();
export type CustomerReturnClaimEligibility=z.infer<typeof customerReturnClaimEligibilitySchema>;
export const customerReturnClaimsQuerySchema=z.object({
  page:z.coerce.number().int().min(1).max(1000000).default(1),
  perPage:z.coerce.number().int().min(1).max(50).default(20),
}).strict();
