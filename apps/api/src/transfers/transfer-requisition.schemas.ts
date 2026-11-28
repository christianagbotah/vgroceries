import {z} from "zod";
const id=z.string().trim().min(1).max(128);
const note=z.string().trim().max(500).refine(s=>!/[\u0000-\u001f\u007f]/.test(s));
export const transferRequestSchema=z.strictObject({
 destinationId:id,
 note,
 lines:z.array(z.strictObject({variantId:id,quantity:z.string().regex(/^\d{1,12}(\.\d{1,3})?$/).refine(s=>Number(s)>0)})).min(1).max(100)
 .refine(lines=>new Set(lines.map(l=>l.variantId)).size===lines.length),
});
export const transferDecisionSchema=z.discriminatedUnion("action",[
 z.strictObject({action:z.literal("authorize"),version:z.literal(1),sourceId:id,note}),
 z.strictObject({action:z.literal("reject"),version:z.literal(1),note:note.refine(s=>s.length>0)}),
]);
export type TransferRequestInput=z.infer<typeof transferRequestSchema>;
export type TransferDecisionInput=z.infer<typeof transferDecisionSchema>;

export const transferReserveSchema=z.strictObject({version:z.literal(2)});
export const transferCancelSchema=z.strictObject({version:z.literal(3),note:note.refine(s=>s.length>0)});

export const transferDispatchSchema=z.strictObject({version:z.literal(3),handoverReference:z.string().trim().min(1).max(128).refine(s=>!/[\u0000-\u001f\u007f]/.test(s))});

export const transferReceiptSchema=z.strictObject({
 receiptReference:id.refine(s=>!/[\u0000-\u001f\u007f]/.test(s)),
 lines:z.array(z.strictObject({dispatchLotId:id,quantity:z.string().regex(/^\d{1,12}(\.\d{1,3})?$/).refine(s=>Number(s)>0)})).min(1).max(100)
 .refine(lines=>new Set(lines.map(l=>l.dispatchLotId)).size===lines.length),
});
export type TransferReceiptInput=z.infer<typeof transferReceiptSchema>;
