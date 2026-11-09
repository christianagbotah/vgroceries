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
}).strict();
export type PosCashSaleComplete=z.infer<typeof posCashSaleCompleteSchema>;
export const posCashSaleViewSchema=z.object({
  id,reference:z.string().min(1),holdId:id,tillSessionId:id,
  locationId:z.string().min(1),soldByUserId:z.string().min(1),
  stockDepletionId:id,
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
