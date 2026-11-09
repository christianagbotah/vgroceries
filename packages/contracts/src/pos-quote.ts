import {z} from "zod";
import {quoteResponseSchema} from "./validation";

/**
 * P0b1 staff quote preview. The monetary and stock values come from the
 * exact same checkout quote authority as online customers.
 *
 * NEVER represents an order, reservation, payment receipt, or permitted
 * immediate handover. The next POS milestone must revalidate at commit.
 */
export const posQuoteRequestSchema=z.object({
  sessionId:z.string().uuid(),
  lines:z.array(z.object({
    variantId:z.string().trim().min(1).max(128),
    quantity:z.string().regex(/^\d+(\.\d{1,3})?$/),
  }).strict()).min(1).max(100),
}).strict();
export type PosQuoteRequest=z.infer<typeof posQuoteRequestSchema>;

export const posQuoteViewSchema=z.object({
  sessionId:z.string().uuid(),
  locationId:z.string().min(1),
  quotedAt:z.string().datetime({offset:true}),
  quoteOnly:z.literal(true),
  stockReserved:z.literal(false),
  orderCreated:z.literal(false),
  paymentVerified:z.literal(false),
  pricing:quoteResponseSchema,
}).strict();
export type PosQuoteView=z.infer<typeof posQuoteViewSchema>;
