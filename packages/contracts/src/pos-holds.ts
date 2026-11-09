import {z} from "zod";

/** Counter cart reservations share the online inventory allocation authority.
 * These are NOT orders, paid purchases, printed receipts or goods handed over.
 */
const id=z.string().uuid();
const minor=z.number().int().min(0).max(100000000);
const quantity=z.string().regex(/^\d+(\.\d{1,3})?$/);
export const posHoldCreateSchema=z.object({
  tillSessionId:id,
  lines:z.array(z.object({
    variantId:z.string().trim().min(1).max(128),quantity,
  }).strict()).min(1).max(100),
}).strict().superRefine((value,ctx)=>{
  const ids=new Set<string>();
  for(const [i,line] of value.lines.entries()){
    if(ids.has(line.variantId))ctx.addIssue({
      code:"custom",path:["lines",i,"variantId"],message:"Duplicate product variant",
    });
    ids.add(line.variantId);
  }
});
export type PosHoldCreate=z.infer<typeof posHoldCreateSchema>;

export const posHoldReleaseSchema=z.object({
  note:z.string().trim().min(10).max(400),
}).strict();
export type PosHoldRelease=z.infer<typeof posHoldReleaseSchema>;

export const posHoldViewSchema=z.object({
  id,tillSessionId:id,locationId:z.string().min(1),
  createdByUserId:z.string().min(1),
  status:z.enum(["held","released","expired"]),
  subtotalMinor:minor,createdAt:z.string().datetime({offset:true}),
  expiresAt:z.string().datetime({offset:true}),
  releasedAt:z.string().datetime({offset:true}).nullable(),
  releaseNote:z.string().nullable(),
  stockReserved:z.boolean(),
  orderCreated:z.literal(false),
  paymentVerified:z.literal(false),
  goodsHandedOver:z.literal(false),
  lines:z.array(z.object({
    id,variantId:z.string().min(1),
    quantity:z.string(),unitPriceMinor:minor,lineTotalMinor:minor,
  }).strict()).min(1).max(100),
}).strict();
export type PosHoldView=z.infer<typeof posHoldViewSchema>;

export const posHoldListSchema=z.object({
  enabled:z.boolean(),
  holds:z.array(posHoldViewSchema),
}).strict();
