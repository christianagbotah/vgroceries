/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkoutQuoteRequestSchema, checkoutCompleteRequestSchema,
  checkoutPickupPointViewSchema, customerPickupSnapshotViewSchema } from "../packages/contracts/src/validation";
import { logisticsNodeInputSchema } from "../packages/contracts/src/logistics";
import { MockServiceAdapter } from "../src/services/adapters/mock";

const base={
  lines:[{variantId:"variant-1",quantity:"1"}],
  customerName:"Ama",customerPhone:"+233241111111",
  fulfilment:"delivery" as const, zoneId:"zone-required",slotId:"slot-future",
  destinationKind:"pickup_point" as const,finalPickupNodeId:"pickup-1",
  paymentMethod:"mobile_money" as const,idempotencyKey:"pickup-accept-001",
};

describe("Pickup fee and customer-safe snapshot browser contracts",()=>{
  test("pickup quote requires centre and zone, but existing doorstep quote remains valid",()=>{
    expect(checkoutQuoteRequestSchema.safeParse({lines:base.lines,zoneId:"zone-required"}).success).toBe(true);
    expect(checkoutQuoteRequestSchema.safeParse({lines:base.lines,zoneId:"zone-required",destinationKind:"pickup_point"}).success).toBe(false);
    expect(checkoutQuoteRequestSchema.safeParse({lines:base.lines,zoneId:"zone-required",finalPickupNodeId:"pickup-1"}).success).toBe(false);
    expect(checkoutQuoteRequestSchema.safeParse({lines:base.lines,zoneId:"zone-required",destinationKind:"pickup_point",finalPickupNodeId:"pickup-1"}).success).toBe(true);
  });

  test("pickup checkout requires explicit price acceptance; ordinary delivery rejects an injected price",()=>{
    expect(checkoutCompleteRequestSchema.safeParse(base).success).toBe(false);
    expect(checkoutCompleteRequestSchema.safeParse({...base,expectedDeliveryFeeMinor:350}).success).toBe(true);
    expect(checkoutCompleteRequestSchema.safeParse({...base,expectedDeliveryFeeMinor:0}).success).toBe(true);
    expect(checkoutCompleteRequestSchema.safeParse({...base,expectedDeliveryFeeMinor:-1}).success).toBe(false);
    expect(checkoutCompleteRequestSchema.safeParse({...base,destinationKind:"doorstep",finalPickupNodeId:undefined,expectedDeliveryFeeMinor:350}).success).toBe(false);
  });

  test("centre fee is nullable override and strictly bounded",()=>{
    const node={code:"KP-1",name:"Kumasi Centre",publicName:"Kumasi Centre",kind:"pickup_point"};
    expect(logisticsNodeInputSchema.safeParse({...node,pickupFeeMinor:null}).success).toBe(true);
    expect(logisticsNodeInputSchema.safeParse({...node,pickupFeeMinor:0}).success).toBe(true);
    expect(logisticsNodeInputSchema.safeParse({...node,pickupFeeMinor:1000001}).success).toBe(false);
    expect(logisticsNodeInputSchema.safeParse({...node,pickupFeeMinor:-1}).success).toBe(false);
    expect(logisticsNodeInputSchema.safeParse({...node,pickupFeeMinor:"350"}).success).toBe(false);
  });

  test("public pickup options expose known price source without payment or internal routing",()=>{
    const point={
      id:"pickup-1",name:"Kumasi Central",kindLabel:"Pickup point",
      locality:"Kumasi",region:"Ashanti",addressLine:"14 River Road",
      ghanaPostGps:null,directions:"Counter 3",contact:"+233240000001",
      feeMinor:350,feeBasis:"centre_pickup",
    };
    expect(checkoutPickupPointViewSchema.safeParse(point).success).toBe(true);
    expect(checkoutPickupPointViewSchema.safeParse({...point,feeBasis:"zone_delivery",feeMinor:1200}).success).toBe(true);
    expect(checkoutPickupPointViewSchema.safeParse({...point,routeRuleId:"private-route"}).success).toBe(false);
    expect(checkoutPickupPointViewSchema.safeParse({...point,feeMinor:-1}).success).toBe(false);
  });

  test("stored order pickup snapshot is customer-safe, frozen and cannot leak admin identifiers",()=>{
    const customer={
      name:"Kumasi Central",locality:"Kumasi",region:"Ashanti",
      feeMinor:350,feeBasis:"centre_pickup",
      transportWindow:{startsAt:"2026-11-09T12:00:00Z",endsAt:"2026-11-09T14:00:00Z"},
    };
    expect(customerPickupSnapshotViewSchema.safeParse(customer).success).toBe(true);
    expect(customerPickupSnapshotViewSchema.safeParse({...customer,nodeId:"internal-1"}).success).toBe(false);
    expect(customerPickupSnapshotViewSchema.safeParse({...customer,riderId:"secret"}).success).toBe(false);
  });

  test("development mock keeps remote pickup closed and does not advertise any fabricated fees",async()=>{
    const mock=new MockServiceAdapter();
    const discovery=await mock.request<{enabled:boolean;points:unknown[]}>({
      op:"checkout.pickup-points",query:{zoneId:"zone-required"}});
    expect(discovery).toEqual({enabled:false,points:[]});
    const node=await mock.request<Record<string,unknown>>({
      op:"admin.logistics.node.create",body:{
        code:"PREVIEW_FEE",name:"Sample Pickup",publicName:"Sample Pickup",
        kind:"pickup_point",pickupFeeMinor:0,active:true,customerVisible:true,
      },idempotencyKey:"preview-fee-001"});
    expect(node.pickupFeeMinor).toBe(0);
    const updated=await mock.request<Record<string,unknown>>({
      op:"admin.logistics.node.update",query:{nodeId:String(node.id)},
      body:{pickupFeeMinor:null},idempotencyKey:"preview-fee-002"});
    expect(updated.pickupFeeMinor).toBeNull();
  });

  test("UI and customer order source use recorded price, snapshot, transport disclaimer",()=>{
    const checkout=readFileSync("src/app/(storefront)/checkout/page.tsx","utf8");
    const customer=readFileSync("src/components/orders/pickup-centre-details.tsx","utf8");
    const backend=readFileSync("apps/api/src/orders/checkout-command.service.ts","utf8");
    expect(checkout).toContain("expectedDeliveryFeeMinor");
    expect(checkout).toContain('e.code === "PICKUP_FEE_CHANGED"');
    expect(checkout).toContain("Review the updated total and submit again.");
    expect(checkout).toContain("selectedPickupPoint?.feeMinor");
    expect(customer).toContain("order.pickupPoint");
    expect(customer).toContain("not a customer collection appointment");
    expect(backend).toContain("PICKUP_FEE_CHANGED");
    expect(backend).toContain("orderPickupSnapshot.create");
  });
});
