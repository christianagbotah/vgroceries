import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("customer payment choice", () => {
  test("checkout asks only for electronic or fulfilment-appropriate offline payment", () => {
    const checkout = read("src/app/(storefront)/checkout/page.tsx");
    expect(checkout).toContain('type PaymentChoice = "electronic" | "offline"');
    expect(checkout).toContain('paymentChoice === "electronic" ? "card_hosted"');
    expect(checkout).toContain("Electronic payment");
    expect(checkout).toContain('fulfilment === "delivery" ? "Pay on delivery" : "Pay at pickup"');
    expect(checkout).not.toContain("Object.keys(PAYMENT_METHOD_LABELS)");
    expect(checkout).not.toContain("Mobile Money");
    expect(checkout).not.toContain("Bank transfer");
    expect(checkout).not.toContain("Card (hosted)");
  });

  test("payment status describes the hosted handoff without choosing a rail for the customer", () => {
    const status = read("src/app/(storefront)/checkout/status/[id]/page.tsx");
    expect(status).toContain("Continue to the secure payment page to choose your preferred available payment option.");
    expect(status).not.toContain("approve the Mobile Money request");
    expect(status).not.toContain("secure card checkout");
    expect(status).not.toContain("bank-payment instructions");
  });
});
