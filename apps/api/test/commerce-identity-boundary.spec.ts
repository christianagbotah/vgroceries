import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const src = (...parts: string[]) => join(process.cwd(), "src", ...parts);

test("commerce identity is shared outside Orders without a Payments->Orders dependency", () => {
  assert.equal(existsSync(src("commerce-identity", "commerce-identity.module.ts")), true);
  assert.equal(existsSync(src("commerce-identity", "guest-checkout.service.ts")), true);
  assert.equal(existsSync(src("commerce-identity", "checkout-principal.service.ts")), true);
  assert.equal(existsSync(src("orders", "guest-checkout.service.ts")), false);
  assert.equal(existsSync(src("orders", "checkout-principal.service.ts")), false);

  const ordersModule = readFileSync(src("orders", "orders.module.ts"), "utf8");
  assert.match(ordersModule, /CommerceIdentityModule/);
  assert.doesNotMatch(ordersModule, /providers:\s*\[[^\]]*GuestCheckoutService/s);
  assert.doesNotMatch(ordersModule, /providers:\s*\[[^\]]*CheckoutPrincipalService/s);
});
