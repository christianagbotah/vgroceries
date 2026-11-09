/// <reference types="bun-types" />
import { test,expect,describe } from "bun:test";
import { readFileSync } from "node:fs";
import {
  physicalReturnReceiveSchema,physicalReturnInspectSchema,physicalReturnViewSchema,
  physicalReturnListSchema,
} from "../packages/contracts/src/physical-returns";
import { restEndpoints } from "../packages/contracts/src/endpoints";
import { validateRequest } from "../packages/contracts/src/validation";
import { readTags, invalidatesTags } from "../src/services/operation-registry";
import { MockServiceAdapter } from "../src/services/adapters/mock";

const receipt={
  orderId:"order-123",
  reason:"Customer damaged packaging",
  evidenceNote:"Verified by staff with goods in secure holding area",
  lines:[{orderLineId:"line-a",quantity:"1.25",condition:"opened" as const}],
};
describe("Physical Returns R1 browser authority",()=>{
  test("only accepts positive 3-decimal quantities, unique source lines and actual evidence",()=>{
    expect(physicalReturnReceiveSchema.safeParse(receipt).success).toBe(true);
    for(const invalid of [
      {...receipt,lines:[]},
      {...receipt,reason:"bad"},
      {...receipt,evidenceNote:"short"},
      {...receipt,locationId:"client-faked-location"},
      {...receipt,lines:[{...receipt.lines[0],quantity:"-1"}]},
      {...receipt,lines:[{...receipt.lines[0],quantity:"0"}]},
      {...receipt,lines:[{...receipt.lines[0],quantity:"1.5555"}]},
      {...receipt,lines:[receipt.lines[0],receipt.lines[0]]},
    ])expect(physicalReturnReceiveSchema.safeParse(invalid).success).toBe(false);
    expect(validateRequest("admin.physical-return.receive",{...receipt,idempotencyKey:"receipt-key-1"}).ok).toBe(true);
  });
  test("no sellable-restock option or browser-authored financial refund input",()=>{
    const inspection={
      summary:"Returned packaging reviewed by stock supervisor",
      lines:[{itemId:"item-one",disposition:"quarantine" as const,note:"Held in segregated unsaleable return storage"}],
    };
    expect(physicalReturnInspectSchema.safeParse(inspection).success).toBe(true);
    for(const invalid of [
      {...inspection,lines:[{...inspection.lines[0],disposition:"restock_saleable"}]},
      {...inspection,lines:[]},
      {...inspection,refundMinor:300},
      {...inspection,lines:[{...inspection.lines[0],note:"short"}]},
    ])expect(physicalReturnInspectSchema.safeParse(invalid).success).toBe(false);
  });
  test("strict projection excludes cash, provider, buyer identity and source secrets",()=>{
    const r={
      id:"return-id",reference:"VGR-ABCDEF123",orderId:"order-123",orderReference:"VG-ORD-2",
      locationId:"loc-accra",status:"received" as const,
      reason:"Return of unsealed pack",evidenceNote:"Staff physically received returned goods",
      receivedAt:"2026-11-09T07:00:00.000Z",inspectedAt:null,inspectionSummary:null,
      lines:[{id:"item-one",orderLineId:"line-a",variantId:"variant-a",
        productName:"Rice",variantName:"Bag",unit:"kg",quantity:"1",
        condition:"opened" as const,disposition:"awaiting_inspection" as const,
        inspectionNote:null,inspectedAt:null}],
    };
    expect(physicalReturnViewSchema.safeParse(r).success).toBe(true);
    expect(physicalReturnListSchema.safeParse({items:[r],enabled:false,page:1,perPage:20,total:1}).success).toBe(true);
    expect(physicalReturnViewSchema.safeParse({...r,customerPhone:"+233241234567"}).success).toBe(false);
    expect(physicalReturnViewSchema.safeParse({...r,refundStatus:"succeeded"}).success).toBe(false);
  });
  test("real endpoints use production-only admin scoped data access and cache invalidation",()=>{
    expect(restEndpoints["admin.physical-returns"].path).toBe("/admin/physical-returns");
    expect(restEndpoints["admin.physical-return.receive"].method).toBe("POST");
    expect(restEndpoints["admin.physical-return.detail"].path).toBe("/admin/physical-returns/{returnId}");
    expect(restEndpoints["admin.physical-return.inspect"].method).toBe("POST");
    expect(invalidatesTags("admin.physical-return.receive")).toContain("returns");
    expect(invalidatesTags("admin.physical-return.inspect")).toContain("stock");
    expect(readTags("admin.physical-returns")).toContain("returns");
  });
  test("mock transport refuses physically fabricated evidence",async()=>{
    const mock=new MockServiceAdapter();
    await expect(mock.request({op:"admin.physical-returns"})).rejects.toMatchObject({code:"UNAVAILABLE"});
    await expect(mock.request({op:"admin.physical-return.receive",body:receipt,
      idempotencyKey:"receipt-foo-123"})).rejects.toMatchObject({code:"UNAVAILABLE"});
    await expect(mock.request({op:"admin.physical-return.inspect",
      query:{returnId:"fake"},body:{summary:"Cannot inspect fictitious goods",lines:[{itemId:"fake",disposition:"quarantine",note:"Unverified fictitious return evidence"}]},
      idempotencyKey:"inspect-foo-123"})).rejects.toMatchObject({code:"UNAVAILABLE"});
  });
  test("staff screen requires physical possession; no refund/restock buttons",()=>{
    const page=readFileSync("src/app/admin/physical-returns/page.tsx","utf8");
    const returns=readFileSync("src/app/admin/returns/page.tsx","utf8");
    expect(page).toContain("physicallyPresent");
    expect(page).toContain("physicalReturnReceive");
    expect(page).toContain("physicalReturnInspect");
    expect(page).toContain("Quarantined and destroyed goods are not saleable stock");
    expect(page).not.toContain('disposition:"restock_saleable"');
    expect(returns).toContain('href="/admin/physical-returns"');
  });
});
