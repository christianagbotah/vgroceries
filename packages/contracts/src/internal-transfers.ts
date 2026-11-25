import { z } from "zod";

const quantity=z.string().regex(/^\d{1,12}(\.\d{1,3})?$/);
const minor=z.string().regex(/^\d{1,19}$/).refine(s=>/^\d{1,19}$/.test(s)&&BigInt(s)<=BigInt("9223372036854775807"));
const id=z.string().min(1);
const timestamp=z.iso.datetime();
export const internalTransferStatuses=["requested","authorized","reserved","cancelled","rejected","in_transit"] as const;
export const internalTransferListSchema=z.object({
 capped:z.boolean(),
 items:z.array(z.object({
  id,destinationId:id,sourceId:id.nullable(),status:z.enum(internalTransferStatuses),version:z.number().int().positive(),
  requestedBy:id,note:z.string(),decidedBy:id.nullable(),decisionNote:z.string().nullable(),
  createdAt:timestamp,decidedAt:timestamp.nullable(),
  lines:z.array(z.object({id,variantId:id,quantity})).min(1),
  reservedBy:id.nullable(),reservedAt:timestamp.nullable(),reservationExpiresAt:timestamp.nullable(),
  cancelledBy:id.nullable(),cancelledAt:timestamp.nullable(),cancellationNote:z.string().nullable(),
  reservationStatus:z.enum(["consumed","released","none","expired","active","inconsistent"]),
  stockReserved:z.boolean(),stockMoved:z.boolean(),financialPostingCreated:z.literal(false),
  dispatch:z.object({
   id,dispatchedAt:timestamp,dispatchedBy:id,handoverReference:z.string().min(1),
   currency:z.literal("GHS"),totalValueMinor:minor,
   lots:z.array(z.object({id,lotId:id,variantId:id,quantity,lotNumber:z.string(),expiryDate:z.iso.date().nullable(),unitCostMinor:z.number().int().min(0).max(2147483647),valueMinor:minor})).min(1),
  }).nullable(),
 }).refine(row=>(row.status==="in_transit")===Boolean(row.dispatch)&&row.stockMoved===Boolean(row.dispatch)
    && (!row.stockReserved||(row.status==="reserved"&&row.reservationStatus==="active"))
    && (!row.dispatch||(/^\d{1,19}$/.test(row.dispatch.totalValueMinor)&&row.dispatch.lots.every(l=>/^\d{1,19}$/.test(l.valueMinor))&&row.dispatch.lots.reduce((sum,lot)=>sum+BigInt(lot.valueMinor),BigInt(0))===BigInt(row.dispatch.totalValueMinor))),
    {message:"Transfer evidence does not reconcile"})).max(100),
});
export type InternalTransferList=z.infer<typeof internalTransferListSchema>;
export type InternalTransferRow=InternalTransferList["items"][number];

/** Exact display of integer minor units without lossy floating-point conversion. */
export function formatTransferMoney(minorUnits:string):string{
 const value=minor.parse(minorUnits).padStart(3,"0");
 return "₵"+value.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,",")+"."+value.slice(-2);
}

export const transferOptionsSchema=z.object({
 role:z.enum(["admin","inventory_manager"]),
 locations:z.array(z.object({id,name:z.string()})).max(100),
 locationsCapped:z.boolean(),
 variants:z.array(z.object({id,name:z.string(),productName:z.string(),sku:z.string(),unit:z.string()})).max(100),
 variantsCapped:z.boolean(),
});
export type TransferOptions=z.infer<typeof transferOptionsSchema>;
const boundedId=z.string().trim().min(1).max(128);
const safeNote=z.string().trim().max(500).refine(s=>!/[\u0000-\u001f\u007f]/.test(s));
export const createTransferSchema=z.strictObject({destinationId:boundedId,note:safeNote,lines:z.array(z.strictObject({variantId:boundedId,quantity:quantity.refine(s=>Number(s)>0)})).min(1).max(100).refine(rows=>new Set(rows.map(r=>r.variantId)).size===rows.length)});
export const transferActionSchemas={
 authorize:z.strictObject({action:z.literal("authorize"),version:z.literal(1),sourceId:boundedId,note:safeNote}),
 reject:z.strictObject({action:z.literal("reject"),version:z.literal(1),note:safeNote.refine(s=>!!s)}),
 reserve:z.strictObject({version:z.literal(2)}),
 cancel:z.strictObject({version:z.literal(3),note:safeNote.refine(s=>!!s)}),
 dispatch:z.strictObject({version:z.literal(3),handoverReference:boundedId.refine(s=>!/[\u0000-\u001f\u007f]/.test(s))}),
};
export type TransferAction=keyof typeof transferActionSchemas;
export function availableTransferActions(row:InternalTransferRow,options:TransferOptions):TransferAction[]{
 const admin=options.role==="admin",atSource=!!row.sourceId&&options.locations.some(l=>l.id===row.sourceId);
 if(row.status==="requested"&&row.version===1&&admin)return ["authorize","reject"];
 if(row.status==="authorized"&&row.version===2&&(admin||atSource))return ["reserve"];
 if(row.status==="reserved"&&row.version===3)return [...((admin||atSource)&&row.stockReserved&&row.reservationStatus==="active"?["dispatch" as const]:[]),...(admin?["cancel" as const]:[])];
 return [];
}
