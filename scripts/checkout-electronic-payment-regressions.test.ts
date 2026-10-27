/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkoutCompleteRequestSchema } from "../packages/contracts/src/validation";
import { PAYMENT_METHOD_LABELS } from "../packages/contracts/src/domain";

const read = (path: string) => readFileSync(path, "utf8");
const electronicOrder = {
  lines: [{ variantId: "variant-1", quantity: "1" }],
  customerName: "Ama Mensah",
  customerPhone: "+233241234567",
  fulfilment: "collection" as const,
  paymentMethod: "electronic" as const,
  idempotencyKey: "checkout-electronic-001",
};

describe("storefront electronic payment intent", () => {
  test("checkout contract and labels expose electronic as the shopper-level intent", () => {
    expect(checkoutCompleteRequestSchema.safeParse(electronicOrder).success).toBe(true);
    expect(PAYMENT_METHOD_LABELS.electronic).toBe("Electronic payment");
  });

  test("checkout does not ask shoppers to choose provider rails", () => {
    const page = read("src/app/(storefront)/checkout/page.tsx");
    expect(page).toContain('useState<PaymentMethod>("electronic")');
    expect(page).toContain('value="electronic"');
    expect(page).not.toContain("Object.keys(PAYMENT_METHOD_LABELS)");
    expect(page).not.toContain("demo account");
    expect(page).not.toContain("demo location");
  });

  test("status page treats the new order intent as provider-neutral electronic payment", () => {
    const page = read("src/app/(storefront)/checkout/status/[id]/page.tsx");
    expect(page).toContain('order.paymentMethod === "electronic"');
    expect(page).toContain("The secure payment provider will show the payment options available for this order.");
  });
});
