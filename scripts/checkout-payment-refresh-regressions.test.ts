import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("checkout status refresh and provider proof", () => {
  const page = readFileSync("src/app/(storefront)/checkout/status/[id]/page.tsx", "utf8");
  test("manual refresh coalesces with polling and shows progress, failure and last check", () => {
    expect(page).toContain("activeLoad.current?.id === id");
    expect(page).toContain("activeLoad.current?.token !== token");
    expect(page).toContain("disabled={refreshing}");
    expect(page).toContain("Checking…");
    expect(page).toContain("Last checked");
    expect(page).toContain("Unable to refresh:");
    expect(page).toContain("apiOps.orderStatus(id)");
    expect(page).toContain('onClick={() => void load()}');
  });
  test("order creation and payment confirmation remain distinct from fulfilment", () => {
    expect(page).toContain("Order created — complete your secure payment");
    expect(page).toContain('order.fulfilmentStatus === "awaiting_confirmation"');
    expect(page).toContain("Our team will confirm your order before preparation.");
    expect(page).not.toContain("Order ${order.reference} is confirmed and moving");
  });
});

test("active refresh only verifies existing payments and never initiates a new charge",()=>{
 const page=readFileSync("src/app/(storefront)/checkout/status/[id]/page.tsx","utf8");
 expect(page).toContain('NEXT_PUBLIC_HUBTEL_CUSTOMER_PAYMENT_REFRESH_ENABLED === "1"');
 expect(page).toContain('electronicPaymentPhase(o) === "verifying"');
 expect(page).toContain("await apiOps.refreshHostedPayment(id)");
 expect(page).toContain("setOrder(verified)");
 const client=readFileSync("src/services/client.ts","utf8");
 expect(client).toContain('api<PublicOrder>("checkout.payment-refresh", { query: { orderId }, body: {} })');
});
