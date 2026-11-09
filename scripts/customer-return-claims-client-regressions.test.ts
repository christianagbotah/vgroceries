/// <reference types="bun-types" />
import {describe,test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {
  customerReturnClaimRequestSchema,customerReturnClaimDecisionSchema,
  customerReturnClaimCancelSchema,customerReturnClaimViewSchema,
} from "../packages/contracts/src/customer-return-claims";
import {restEndpoints} from "../packages/contracts/src/endpoints";
import {validateRequest} from "../packages/contracts/src/validation";
import {invalidatesTags} from "../src/services/operation-registry";
import {MockServiceAdapter} from "../src/services/adapters/mock";

const request={
  orderId:"order-one",reason:"This product was not delivered as described",
  lines:[{orderLineId:"rice-line",quantity:"1.25",
    reason:"The actual package did not match the ordered variant"}],
};

describe("R3a authenticated customer return claims",()=>{
  test("strict quantities and customer reason, never browser refund or stock authority",()=>{
    expect(customerReturnClaimRequestSchema.safeParse(request).success).toBe(true);
    for(const bad of [
      {...request,orderId:""}, {...request,reason:"short"},
      {...request,refundMinor:100}, {...request,customerId:"other-account"},
      {...request,lines:[]},
      {...request,lines:[request.lines[0],request.lines[0]]},
      {...request,lines:[{...request.lines[0],quantity:"0"}]},
      {...request,lines:[{...request.lines[0],quantity:"0.1234"}]},
      {...request,lines:[{...request.lines[0],quantity:"-4"}]},
      {...request,lines:[{...request.lines[0],reason:"short"}]},
    ])expect(customerReturnClaimRequestSchema.safeParse(bad).success).toBe(false);
    expect(validateRequest("account.return-claim.create",{
      ...request,idempotencyKey:"verified-request-key",
    }).ok).toBe(true);
  });
  test("staff decision/cancellation have no fabricated money or proof fields",()=>{
    expect(customerReturnClaimDecisionSchema.safeParse({
      decision:"accept",reviewNote:"Eligible for separate physical receipt and inspection",
    }).success).toBe(true);
    expect(customerReturnClaimDecisionSchema.safeParse({
      decision:"accept",reviewNote:"Eligible for further review only",refundMinor:500,
    }).success).toBe(false);
    expect(customerReturnClaimCancelSchema.safeParse({}).success).toBe(true);
    expect(customerReturnClaimCancelSchema.safeParse({orderId:"arbitrary"}).success).toBe(false);
    const item={id:"claim",reference:"VGRQ-ABC",orderId:"order",orderReference:"VG-001",
      status:"requested" as const,reason:"Delivered goods were different from expected",
      evidenceNote:null,createdAt:"2026-11-09T10:00:00.000Z",
      reviewedAt:null,reviewNote:null,cancelledAt:null,
      lines:[{orderLineId:"line",productName:"Rice",variantName:"1kg pack",
        unit:"kg",quantity:"1",reason:"Missing the agreed pack information"}]};
    expect(customerReturnClaimViewSchema.safeParse(item).success).toBe(true);
    expect(customerReturnClaimViewSchema.safeParse({...item,customerPhone:"+233241234567"}).success).toBe(false);
    expect(customerReturnClaimViewSchema.safeParse({...item,refundId:"forged"}).success).toBe(false);
  });
  test("typed operations use six production paths and invalidate returns/order data",()=>{
    expect(restEndpoints["account.return-claim.create"].path).toBe("/account/return-claims");
    expect(restEndpoints["account.return-claim.eligibility"].path).toBe("/account/return-claims/orders/{orderId}/eligibility");
    expect(restEndpoints["account.return-claim.cancel"].method).toBe("POST");
    expect(restEndpoints["admin.return-claim.decision"].method).toBe("POST");
    expect(invalidatesTags("account.return-claim.create")).toContain("returns");
    expect(invalidatesTags("admin.return-claim.decision")).toContain("orders");
  });
  test("mock refuses fake return authority rather than inventing payment or stock evidence",async()=>{
    const mock=new MockServiceAdapter();
    for(const op of ["account.return-claim.create","admin.return-claim.decision"] as const){
      await expect(mock.request({op,idempotencyKey:"mock-replay",
        body:op==="account.return-claim.create"?
          request:{decision:"reject",reviewNote:"Unsafe to produce fake claims"},
        query:{claimId:"fake"},
      })).rejects.toMatchObject({code:"UNAVAILABLE"});
    }
  });
  test("customer page removed mock refund amounts and shows OFF state honestly",()=>{
    const customer=readFileSync("src/app/(storefront)/account/returns/page.tsx","utf8");
    const admin=readFileSync("src/app/admin/return-claims/page.tsx","utf8");
    expect(customer).toContain("customerReturnClaimCreate");
    expect(customer).toContain("customerReturnClaimEligibility");
    expect(customer).toContain("customerReturnClaimCancel");
    expect(customer).toContain("Verified return requests are not open yet");
    expect(customer).not.toContain("formatMoney");
    expect(customer).not.toContain("apiOps.createReturn(");
    expect(admin).toContain("adminReturnClaimDecision");
    expect(admin).toContain("no money is");
  });
});
