/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { restEndpoints } from "../packages/contracts/src/endpoints";
import { pickupCollectRequestSchema, pickupCollectResponseSchema, shipmentListItemSchema } from "../packages/contracts/src/logistics";
import { validateRequest } from "../packages/contracts/src/validation";
import { invalidatesTags, readTags } from "../src/services/operation-registry";
import { MockServiceAdapter } from "../src/services/adapters/mock";
import { canOfferPickupCollection, validPickupProof, shipmentCurrentStop } from "../src/features/logistics/pickup-collection-policy";

const shipment = shipmentListItemSchema.parse({
  id: "shipment-test", orderId: "order-test", orderReference: "VG-PICKUP-26",
  sequence: 1, workflowVersionId: "wf-1", routeRuleId: "rule-1", routeRevision: 2,
  status: "ready_for_pickup", originNodeId: "source-1", destinationKind: "pickup_point",
  finalPickupNodeId: "pickup-1", currentNodeId: "pickup-1", currentLegId: null,
  custody: "node_staff", activatedAt: "2026-11-08T12:00:00Z", completedAt: null,
  version: 4, createdAt: "2026-11-08T11:00:00Z", updatedAt: "2026-11-08T12:30:00Z",
  allowedActions: ["collect", "checkpoint"], blockers: ["awaiting_verified_customer_pickup"],
});
const proof = {
  receiverName: "Ama Mensah",
  verificationCode: "0123456789",
  identityCheck: "recipient_photo_id_checked" as const,
};

describe("Remote pickup centre staff-client parity", () => {
  test("all three operations map to the exact 116-path production API", () => {
    expect(restEndpoints["admin.logistics.shipments"]).toEqual({ method: "GET", path: "/admin/logistics/shipments" });
    expect(restEndpoints["admin.logistics.shipment"]).toEqual({ method: "GET", path: "/admin/logistics/shipments/{shipmentId}" });
    expect(restEndpoints["admin.logistics.shipment.collect"]).toEqual({ method: "POST", path: "/admin/logistics/shipments/{shipmentId}/collect" });
  });

  test("server replay is a header, not an invented proof field; collection inputs stay strict", () => {
    expect(validateRequest("admin.logistics.shipment.collect", proof).ok).toBe(true);
    expect(validateRequest("admin.logistics.shipment.collect", { ...proof, idempotencyKey: "pickup-check-001" }).ok).toBe(true);
    expect(pickupCollectRequestSchema.safeParse({ ...proof, idempotencyKey: "pickup-check-001" }).success).toBe(false);
    expect(validateRequest("admin.logistics.shipment.collect", { ...proof, verificationCode: "1" }).ok).toBe(false);
    expect(validateRequest("admin.logistics.shipment.collect", { ...proof, bankAccount: "fake" }).ok).toBe(false);
    expect(validPickupProof(proof, false)).toBe(false);
    expect(validPickupProof(proof, true)).toBe(true);
  });

  test("collection response is public-minimal: no code, receiver or identity detail", () => {
    const output = pickupCollectResponseSchema.parse({
      receiptId: "receipt-1", shipmentId: "shipment-test", orderId: "order-test",
      orderReference: "VG-PICKUP-26", nodeId: "pickup-1",
      collectedAt: "2026-11-08T12:31:00Z", status: "completed", custody: "customer",
    });
    expect(JSON.stringify(output)).not.toContain("Ama");
    expect(pickupCollectResponseSchema.safeParse({ ...output, receiverName: "Ama Mensah" }).success).toBe(false);
    expect(pickupCollectResponseSchema.safeParse({ ...output, verificationCode: "0123456789" }).success).toBe(false);
  });

  test("UI offers collection only at the exact final node with backend permission", () => {
    expect(canOfferPickupCollection(shipment)).toBe(true);
    for (const change of [
      { status: "planned" }, { status: "completed" }, { status: "final_mile_ready" },
      { destinationKind: "doorstep" }, { currentNodeId: "wrong-node" },
      { currentLegId: "active-leg" }, { finalPickupNodeId: null },
      { allowedActions: ["checkpoint"] },
    ]) {
      expect(canOfferPickupCollection({ ...shipment, ...change } as typeof shipment)).toBe(false);
    }
    expect(shipmentCurrentStop({ ...shipment, stops: [
      { id: "s1", routeRevision: 1, position: 2, nodeId: "pickup-1", nodeCode: "OLD",
        nodePublicName: "Old location", nodeKind: "pickup_point", nodeKindLabel: null,
        terminalRole: "customer_pickup" },
      { id: "s2", routeRevision: 2, position: 2, nodeId: "pickup-1", nodeCode: "NOW",
        nodePublicName: "Recorded collection point", nodeKind: "pickup_point", nodeKindLabel: null,
        terminalRole: "customer_pickup" },
    ], legs: [], events: [], destinationAddress: null })).toBe("Recorded collection point");
  });

  test("mutation invalidates tracking/order/logistics, not payment or stock authority", () => {
    expect(readTags("admin.logistics.shipments")).toContain("logistics");
    expect(readTags("admin.logistics.shipment")).toContain("orders");
    expect(invalidatesTags("admin.logistics.shipment.collect")).toEqual(expect.arrayContaining(["logistics", "orders", "delivery"]));
    expect(invalidatesTags("admin.logistics.shipment.collect")).not.toContain("payments");
    expect(invalidatesTags("admin.logistics.shipment.collect")).not.toContain("stock");
  });

  test("development mock never invents shipment movement or customer collection evidence", async () => {
    const mock = new MockServiceAdapter();
    expect(await mock.request<{items: unknown[]; page: number; perPage: number; total: number}>({ op: "admin.logistics.shipments" })).toEqual({ items: [], page: 1, perPage: 20, total: 0 });
    await expect(mock.request({ op: "admin.logistics.shipment", query: { shipmentId: "fake" } })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(mock.request({
      op: "admin.logistics.shipment.collect", query: { shipmentId: "fake" },
      body: proof, idempotencyKey: "pickup-mock-001",
    })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  test("UI never stores the code and only renders customer pickup readiness from persisted journey", () => {
    const ui = readFileSync("src/features/logistics/shipments-panel.tsx", "utf8");
    const customer = readFileSync("src/app/(storefront)/account/orders/[id]/page.tsx", "utf8");
    const roleGuard = readFileSync("src/app/admin/logistics/shipments/page.tsx", "utf8");
    expect(roleGuard).toContain("apiOps.staffSession()");
    expect(roleGuard).toContain('session.actor.role === "admin"');
    expect(ui).toContain('type="password"');
    expect(ui).toContain("setProof(initialProof())");
    expect(ui).toContain("validPickupProof(proof, acknowledged)");
    expect(ui).toContain("apiOps.logisticsShipmentCollect");
    expect(customer).toContain('order.trackingJourney?.source === "shipment"');
    expect(customer).toContain('order.trackingJourney.state === "ready_for_pickup"');
  });
});
