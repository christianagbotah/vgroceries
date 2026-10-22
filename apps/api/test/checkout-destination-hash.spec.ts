import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompleteOrderRequest } from "@variety/contracts";
import { checkoutRequestHash } from "../src/orders/checkout.values";

function request(deliveryDestination?: CompleteOrderRequest["deliveryDestination"]): CompleteOrderRequest {
  return {
    lines: [{ variantId: "var-rice", quantity: "1" }],
    customerName: "Ama", customerPhone: "+233241111111", fulfilment: "delivery",
    zoneId: "zone-required", slotId: "slot-future", addressId: "address-a", paymentMethod: "cash_on_delivery",
    idempotencyKey: "checkout-destination-hash",
    ...(deliveryDestination ? { deliveryDestination } : {}),
  };
}

test("checkout idempotency canonicalizes omitted destination as doorstep and binds pickup choice", () => {
  const omitted = checkoutRequestHash(request());
  const doorstep = checkoutRequestHash(request({ kind: "doorstep" }));
  const pickupA = checkoutRequestHash(request({ kind: "pickup_point", finalPickupNodeId: "pickup-a" }));
  const pickupB = checkoutRequestHash(request({ kind: "pickup_point", finalPickupNodeId: "pickup-b" }));
  assert.equal(omitted, doorstep);
  assert.notEqual(doorstep, pickupA);
  assert.notEqual(pickupA, pickupB);
});
