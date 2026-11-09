import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const quantity = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/)
  .refine(value => Number(value)>0 && Number.isFinite(Number(value)), "Quantity must be positive");
const note = z.string().trim().min(10).max(1000);
export const physicalReturnConditionSchema=z.enum(["sealed","opened","damaged","unknown"]);
export const physicalReturnDispositionSchema=z.enum(["awaiting_inspection","quarantine","destroy"]);
export const physicalReturnReceiveSchema=z.object({
  orderId:id,
  reason:z.string().trim().min(5).max(400),
  evidenceNote:note,
  lines:z.array(z.object({
    orderLineId:id,quantity,condition:physicalReturnConditionSchema,
  }).strict()).min(1).max(30).refine(lines=>new Set(lines.map(l=>l.orderLineId)).size===lines.length,
    "Each source order line may appear only once in a receipt"),
}).strict();
export type PhysicalReturnReceive=z.infer<typeof physicalReturnReceiveSchema>;
export const physicalReturnInspectSchema=z.object({
  summary:note,
  lines:z.array(z.object({
    itemId:id,
    disposition:z.enum(["quarantine","destroy"]),
    note,
  }).strict()).min(1).max(30).refine(lines=>new Set(lines.map(l=>l.itemId)).size===lines.length,
    "Each received item may be inspected only once"),
}).strict();
export type PhysicalReturnInspect=z.infer<typeof physicalReturnInspectSchema>;
export const physicalReturnQuarantineRequestSchema=z.object({
  custodyNote:z.string().trim().min(15).max(1000),
}).strict();
export type PhysicalReturnQuarantineRequest=z.infer<typeof physicalReturnQuarantineRequestSchema>;
export const physicalReturnCustodyViewSchema=z.object({
  itemId:id,sourceLotId:id,sourceLotNumber:z.string(),
  quarantineLotId:id,quarantineLotNumber:z.string(),
  quantity,recordedAt:z.string().datetime({offset:true}),
  custodyNote:z.string(),status:z.literal("quarantined"),
}).strict();
export type PhysicalReturnCustodyView=z.infer<typeof physicalReturnCustodyViewSchema>;
export const physicalReturnResaleProposeSchema=z.object({
  safetyClassification:z.literal("non_food_factory_sealed"),
  factorySealIntact:z.literal(true),
  tamperAndContaminationAbsent:z.literal(true),
  sourceTraceabilityVerified:z.literal(true),
  expiryAndStorageVerified:z.literal(true),
  evidenceNote:z.string().trim().min(30).max(1500),
}).strict();
export type PhysicalReturnResalePropose=z.infer<typeof physicalReturnResaleProposeSchema>;
export const physicalReturnResaleDecisionSchema=z.object({
  decision:z.enum(["approve","reject"]),
  decisionNote:z.string().trim().min(20).max(1000),
}).strict();
export type PhysicalReturnResaleDecision=z.infer<typeof physicalReturnResaleDecisionSchema>;
export const physicalReturnResaleReviewViewSchema=z.object({
  itemId:id,
  status:z.enum(["pending","approved","rejected"]),
  proposedBy:id,
  proposedAt:z.string().datetime({offset:true}),
  evidenceNote:z.string(),
  decidedBy:id.nullable(),
  decidedAt:z.string().datetime({offset:true}).nullable(),
  decisionNote:z.string().nullable(),
  saleableLotId:id.nullable(),
  transferReceiptId:id.nullable(),
}).strict();
export type PhysicalReturnResaleReviewView=z.infer<typeof physicalReturnResaleReviewViewSchema>;
export const physicalReturnLineViewSchema=z.object({
  id:id,orderLineId:id,variantId:id,productName:z.string(),
  variantName:z.string(),unit:z.string(),quantity,
  condition:physicalReturnConditionSchema,
  disposition:physicalReturnDispositionSchema,
  inspectionNote:z.string().nullable(),
  custody:physicalReturnCustodyViewSchema.nullable().optional(),
  resaleReview:physicalReturnResaleReviewViewSchema.nullable().optional(),
  resaleEligible:z.boolean().optional(),
  inspectedAt:z.string().datetime({offset:true}).nullable(),
}).strict();
export const physicalReturnViewSchema=z.object({
  id:id,reference:z.string(),orderId:id,orderReference:z.string(),
  locationId:id,status:z.enum(["received","inspected"]),
  reason:z.string(),evidenceNote:z.string(),
  receivedAt:z.string().datetime({offset:true}),
  inspectedAt:z.string().datetime({offset:true}).nullable(),
  inspectionSummary:z.string().nullable(),
  lines:z.array(physicalReturnLineViewSchema),
}).strict();
export type PhysicalReturnView=z.infer<typeof physicalReturnViewSchema>;
export const physicalReturnListSchema=z.object({
  enabled:z.boolean(),
  custodyEnabled:z.boolean().optional(),
  resaleEnabled:z.boolean().optional(),
  items:z.array(physicalReturnViewSchema),page:z.number().int().min(1),
  perPage:z.number().int().min(1).max(50),total:z.number().int().nonnegative(),
}).strict();
export type PhysicalReturnList=z.infer<typeof physicalReturnListSchema>;
export const physicalReturnQuerySchema=z.object({
  orderId:id.optional(),
  page:z.coerce.number().int().min(1).max(10000).default(1),
  perPage:z.coerce.number().int().min(1).max(50).default(20),
}).strict();
