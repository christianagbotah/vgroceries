import {z} from "zod";

/** Physical CASH, counted by an authenticated administrator. Never electronic
 * provider verification, credit approval, tax invoice or queued offline sale.
 */
const id=z.string().uuid();
const money=z.number().int().min(0).max(100000000);
export const posCashSaleCompleteSchema=z.object({
  holdId:id,
  cashReceivedMinor:money,
  cashCountConfirmed:z.literal(true),
  goodsHandedOver:z.literal(true),
  handoverNote:z.string().trim().min(10).max(400),
  customerMode:z.enum(["walk_in","existing","named"]).optional(),
  customerUserId:z.string().min(1).max(100).optional(),
  customerName:z.string().trim().min(2).max(120).optional(),
}).strict().superRefine((value,context)=>{
  const mode=value.customerMode??"walk_in";
  if(mode==="existing" && !value.customerUserId)
    context.addIssue({code:"custom",path:["customerUserId"],message:"Choose a registered customer."});
  if(mode==="named" && !value.customerName)
    context.addIssue({code:"custom",path:["customerName"],message:"Enter the walk-in customer's name."});
  if(mode!=="existing" && value.customerUserId)
    context.addIssue({code:"custom",path:["customerUserId"],message:"A guest sale cannot claim a registered customer account."});
  if(mode!=="named" && value.customerName)
    context.addIssue({code:"custom",path:["customerName"],message:"Only named walk-in sales may supply a name."});
});
export type PosCashSaleComplete=z.infer<typeof posCashSaleCompleteSchema>;
export const posCashSaleViewSchema=z.object({
  id,reference:z.string().min(1),holdId:id,tillSessionId:id,
  locationId:z.string().min(1),soldByUserId:z.string().min(1),
  stockDepletionId:id,
  customerMode:z.enum(["walk_in","existing","named"]),
  customerUserId:z.string().nullable(),
  customerName:z.string().min(1),
  subtotalMinor:money,cashReceivedMinor:money,changeGivenMinor:money,
  paymentMethod:z.literal("cash"),
  cashCountConfirmed:z.literal(true),
  goodsHandedOver:z.literal(true),
  handoverNote:z.string(),
  createdAt:z.string().datetime({offset:true}),
  taxInvoiceIssued:z.literal(false),
  electronicPaymentVerified:z.literal(false),
  lines:z.array(z.object({
    variantId:z.string().min(1),quantity:z.string(),
    unitPriceMinor:money,lineTotalMinor:money,
  }).strict()).min(1).max(100),
}).strict();
export type PosCashSaleView=z.infer<typeof posCashSaleViewSchema>;
export const posCashSaleListSchema=z.object({
  enabled:z.boolean(),sales:z.array(posCashSaleViewSchema),
}).strict();
