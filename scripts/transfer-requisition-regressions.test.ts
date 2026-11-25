import {test,expect} from "bun:test";
import {transferRequestSchema,transferDecisionSchema} from "../apps/api/src/transfers/transfer-requisition.schemas";
test("requests cannot specify source, cost, supplier, actor or approval",()=>{
 const request={destinationId:"branch-a",note:"",lines:[{variantId:"rice",quantity:"10.5"}]};
 expect(transferRequestSchema.safeParse(request).success).toBe(true);
 for(const field of ["sourceId","supplierId","unitCostMinor","approvedBy","status"])expect(transferRequestSchema.safeParse({...request,[field]:"x"}).success).toBe(false);
 expect(transferRequestSchema.safeParse({...request,lines:[...request.lines,...request.lines]}).success).toBe(false);
 expect(transferRequestSchema.safeParse({...request,lines:[{variantId:"rice",quantity:"0"}]}).success).toBe(false);
 expect(transferDecisionSchema.safeParse({action:"authorize",version:1,sourceId:"branch-b",note:"approved"}).success).toBe(true);
 expect(transferDecisionSchema.safeParse({action:"reject",version:1,note:""}).success).toBe(false);
});

test("reservation commands cannot inject quantities, cost, expiry or source",async()=>{
 const {transferReserveSchema,transferCancelSchema}=await import("../apps/api/src/transfers/transfer-requisition.schemas");
 expect(transferReserveSchema.safeParse({version:2}).success).toBe(true);
 for(const field of ["sourceId","quantity","unitCostMinor","expiresAt","actorId"])expect(transferReserveSchema.safeParse({version:2,[field]:"x"}).success).toBe(false);
 expect(transferCancelSchema.safeParse({version:3,note:"Reallocate elsewhere"}).success).toBe(true);
 expect(transferCancelSchema.safeParse({version:3,note:""}).success).toBe(false);
});
