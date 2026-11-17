import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const pos = readFileSync("src/app/admin/pos/page.tsx", "utf8");
const checkout = readFileSync("src/app/(storefront)/checkout/page.tsx", "utf8");
const status = readFileSync("src/app/(storefront)/checkout/status/[id]/page.tsx", "utf8");

describe("Two clear customer-facing payment categories", () => {
  test("POS offers Cash and Electronic rather than rails as equal choices", () => {
    expect(pos).toContain('["cash_counter", "Cash", Banknote]');
    expect(pos).toContain('["electronic", "Electronic", CreditCard]');
    expect(pos).not.toContain('["mobile_money", "MoMo", Smartphone]');
    expect(pos).not.toContain('["card_hosted", "Card", CreditCard]');
  });
  test("staging POS cannot mark an electronic sale paid without a verified gateway", () => {
    expect(pos).toContain('if (method === "electronic") {');
    expect(pos).toContain('disabled={!lines.length || completing || !customerValid || method === "electronic"}');
    expect(pos).toContain("Gateway verification required");
  });
  test("online checkout delegates detailed payment method selection to the provider", () => {
    expect(checkout).toContain('value="electronic" id="pay-electronic"');
    expect(checkout).toContain('value="cash_counter" id="pay-cash_counter"');
    expect(checkout).toContain('value="cash_on_delivery" id="pay-cash_on_delivery"');
    expect(checkout).toContain("secure payment provider will show the payment options available");
  });
  test("online status retains server-verified payment flow and pending polling", () => {
    expect(status).toContain("apiOps.paymentInitiate");
    expect(status).toContain("window.location.assign(result.action.url)");
    expect(status).toContain('order.paymentStatus === "unpaid" && !["electronic"');
    expect(status).toContain("server-side provider evidence is independently verified");
  });
});
