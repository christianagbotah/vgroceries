import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Hubtel storefront payment handoff", () => {
  test("browser contract exposes the authoritative payment-attempt route", () => {
    const endpoints = read("packages/contracts/src/endpoints.ts");
    const validation = read("packages/contracts/src/validation.ts");
    const client = read("src/services/client.ts");
    const operations = read("src/services/operation-registry.ts");
    expect(endpoints).toContain('"payments.initiate": {"method": "POST", "path": "/orders/{orderId}/payment-attempts"}');
    expect(validation).toContain('"payments.initiate": paymentInitiationRequestSchema');
    expect(client).toContain("paymentInitiate");
    expect(client).toContain('api<PaymentInitiationResult>("payments.initiate"');
    expect(operations).toContain('"payments.initiate": { invalidates: [...ORD, ...PAY] }');
  });

  test("checkout status initiates provider payment and removes browser-controlled money outcomes", () => {
    const status = read("src/app/(storefront)/checkout/status/[id]/page.tsx");
    expect(status).toContain("apiOps.paymentInitiate");
    expect(status).toContain("window.location.assign");
    expect(status).toContain("sessionStorage");
    expect(status).not.toContain("apiOps.paymentOutcome");
    expect(status).not.toContain("I've approved the payment");
    expect(status).not.toContain("Payment was declined");
    expect(status).not.toContain("provider roleplay");
  });

  test("provider return page restores the order status without trusting query-string money state", () => {
    expect(existsSync("src/app/(storefront)/checkout/payment-return/page.tsx")).toBe(true);
    const page = read("src/app/(storefront)/checkout/payment-return/page.tsx");
    expect(page).toContain("vg_payment_order_id");
    expect(page).toContain("/checkout/status/");
    expect(page).not.toContain("paymentOutcome");
    expect(page).not.toContain("succeeded");
  });

  test("checkout copy no longer claims that electronic payments are a prototype roleplay", () => {
    const checkout = read("src/app/(storefront)/checkout/page.tsx");
    expect(checkout).not.toContain("No real payment is taken in this prototype");
    expect(checkout).toContain("secure payment provider");
    expect(checkout).toContain("never asks you to choose a provider rail here");
  });
});
