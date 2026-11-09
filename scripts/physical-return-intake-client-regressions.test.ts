/// <reference types="bun-types" />
import { test,expect,describe } from "bun:test";
import { readFileSync } from "node:fs";
import {
  physicalReturnReceiveSchema,physicalReturnInspectSchema,physicalReturnViewSchema,
  physicalReturnListSchema,physicalReturnQuarantineRequestSchema,
  physicalReturnCustodyViewSchema,
  physicalReturnResaleProposeSchema,physicalReturnResaleDecisionSchema,
  physicalReturnResaleReviewViewSchema,
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

describe("Physical Returns R2a non-saleable quarantine stock",()=>{
  test("strict quarantine custody note cannot request resale, new source lot, refunds or amounts",()=>{
    const valid={custodyNote:"Goods secured in the off-sale quarantine shelf, counted and separated"};
    expect(physicalReturnQuarantineRequestSchema.safeParse(valid).success).toBe(true);
    for(const invalid of [
      {custodyNote:"short"},
      {...valid,lotId:"arbitrary-lot"},
      {...valid,saleable:true},
      {...valid,refundMinor:250},
      {...valid,custodyNote:"x".repeat(1001)},
    ])expect(physicalReturnQuarantineRequestSchema.safeParse(invalid).success).toBe(false);
    expect(validateRequest("admin.physical-return.quarantine",{
      ...valid,idempotencyKey:"custody-replay-001",
    }).ok).toBe(true);
  });
  test("client cannot forge inspected item ownership or quarantined lot projection",()=>{
    const row={
      itemId:"return-item-1",sourceLotId:"source-1",sourceLotNumber:"SOURCE-001",
      quarantineLotId:"off-sale-1",quarantineLotNumber:"RET-001",
      quantity:"1.25",recordedAt:"2026-11-09T09:00:00.000Z",
      custodyNote:"Physical quarantine cage evidence confirmed and counted",
      status:"quarantined" as const,
    };
    expect(physicalReturnCustodyViewSchema.safeParse(row).success).toBe(true);
    expect(physicalReturnCustodyViewSchema.safeParse({...row,refundId:"fabricated-refund"}).success).toBe(false);
    expect(physicalReturnCustodyViewSchema.safeParse({...row,status:"sellable"}).success).toBe(false);
    expect(physicalReturnCustodyViewSchema.safeParse({...row,quantity:"-1"}).success).toBe(false);
  });
  test("quarantine is a staff-only mutation, never a development-mock inventory transaction",async()=>{
    expect(restEndpoints["admin.physical-return.quarantine"].path)
      .toBe("/admin/physical-returns/items/{itemId}/quarantine");
    expect(restEndpoints["admin.physical-return.quarantine"].method).toBe("POST");
    expect(invalidatesTags("admin.physical-return.quarantine")).toContain("stock");
    const mock=new MockServiceAdapter();
    await expect(mock.request({
      op:"admin.physical-return.quarantine",query:{itemId:"fake-item"},
      body:{custodyNote:"Mock must refuse fabricated quarantine stock custody"},
      idempotencyKey:"fake-custody",
    })).rejects.toMatchObject({code:"UNAVAILABLE"});
  });
  test("staff UI confirms separate physical custody, no saleable or payment action",()=>{
    const page=readFileSync("src/app/admin/physical-returns/page.tsx","utf8");
    expect(page).toContain("physicalReturnQuarantine");
    expect(page).toContain("custodyAcknowledged");
    expect(page).toContain("Quarantine stock custody is not activated");
    expect(page).toContain("These goods are NOT available to sell");
    expect(page).not.toContain('type="button">Approve cash refund');
  });
});

describe("Physical Returns R2b independent non-food resale release",()=>{
  test("strict safety attestations cannot be omitted or bypassed with money fields",()=>{
    const valid={
      safetyClassification:"non_food_factory_sealed" as const,
      factorySealIntact:true as const,tamperAndContaminationAbsent:true as const,
      sourceTraceabilityVerified:true as const,expiryAndStorageVerified:true as const,
      evidenceNote:"Factory sealed non-food product verified by stock staff against original lot and minimum shelf life",
    };
    expect(physicalReturnResaleProposeSchema.safeParse(valid).success).toBe(true);
    for(const invalid of [
      {...valid,factorySealIntact:false},
      {...valid,tamperAndContaminationAbsent:false},
      {...valid,sourceTraceabilityVerified:false},
      {...valid,expiryAndStorageVerified:false},
      {...valid,safetyClassification:"shelf_stable_food"},
      {...valid,saleableLotId:"browser-selected-lot"},
      {...valid,refundMinor:1000},
      {...valid,evidenceNote:"too short"},
    ])expect(physicalReturnResaleProposeSchema.safeParse(invalid).success).toBe(false);
    expect(validateRequest("admin.physical-return.resale-propose",{
      ...valid,idempotencyKey:"review-proposal-001",
    }).ok).toBe(true);
  });
  test("independent decision is only approve or reject with verified evidence, no amount",()=>{
    const valid={decision:"reject" as const,decisionNote:"Unsafe goods must remain in quarantine for inspection"};
    expect(physicalReturnResaleDecisionSchema.safeParse(valid).success).toBe(true);
    for(const invalid of [
      {...valid,decision:"release_all"},
      {...valid,decisionNote:"bad"},
      {...valid,quantity:"500"},
      {...valid,refundMinor:2000},
      {...valid,sourceLotId:"arbitrary"},
    ])expect(physicalReturnResaleDecisionSchema.safeParse(invalid).success).toBe(false);
    const review={
      itemId:"item-one",status:"pending" as const,
      proposedBy:"admin-a",proposedAt:"2026-11-09T10:00:00.000Z",
      evidenceNote:"Factory intact shelf-stable non-food item with documented original expiry",
      decidedBy:null,decidedAt:null,decisionNote:null,
      saleableLotId:null,transferReceiptId:null,
    };
    expect(physicalReturnResaleReviewViewSchema.safeParse(review).success).toBe(true);
    expect(physicalReturnResaleReviewViewSchema.safeParse({...review,paidAmountMinor:400}).success).toBe(false);
  });
  test("two real admin operations are write-only authority with stock and catalogue cache invalidation",async()=>{
    expect(restEndpoints["admin.physical-return.resale-propose"].path)
      .toBe("/admin/physical-returns/items/{itemId}/resale-review");
    expect(restEndpoints["admin.physical-return.resale-decision"].path)
      .toBe("/admin/physical-returns/items/{itemId}/resale-decision");
    expect(restEndpoints["admin.physical-return.resale-decision"].method).toBe("POST");
    expect(invalidatesTags("admin.physical-return.resale-decision")).toContain("stock");
    const mock=new MockServiceAdapter();
    for(const op of ["admin.physical-return.resale-propose","admin.physical-return.resale-decision"] as const)
      await expect(mock.request({op,query:{itemId:"fake"},
        idempotencyKey:"no-physical-proof",
        body:op.endsWith("propose")?
          {safetyClassification:"non_food_factory_sealed",factorySealIntact:true,
            tamperAndContaminationAbsent:true,sourceTraceabilityVerified:true,
            expiryAndStorageVerified:true,evidenceNote:"Cannot use fictional returns for safety approvals"}:
          {decision:"reject",decisionNote:"Cannot approve phantom returned goods"},
      })).rejects.toMatchObject({code:"UNAVAILABLE"});
  });
  test("staff UI demands independent sign-off and explicitly limits release to non-food",()=>{
    const page=readFileSync("src/app/admin/physical-returns/page.tsx","utf8");
    expect(page).toContain("physicalReturnResalePropose");
    expect(page).toContain("physicalReturnResaleDecision");
    expect(page).toContain("resaleConfirmed");
    expect(page).toContain("factory-sealed");
    expect(page).toContain("Food, opened goods and perishable groceries must remain unavailable for resale");
    expect(page).toContain("The proposer, physical receiver, inspector and custodian cannot approve");
    expect(page).not.toContain("refundMinor");
  });
});
