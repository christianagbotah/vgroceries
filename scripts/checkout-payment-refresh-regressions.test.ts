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
