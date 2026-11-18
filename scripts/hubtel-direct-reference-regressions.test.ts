/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { HubtelPaymentProvider } from "../apps/api/src/payments/hubtel-payment-provider";

const config = {
  clientId: "test-only-id", clientSecret: "test-only-secret",
  requestMoneyUrl: "https://hubtel.example/request/{mobileNumber}",
  statusUrl: "https://hubtel.example/status/{reference}",
  callbackUrl: "https://example.test/api/v1/payments/providers/hubtel/events",
  returnUrl: "https://example.test/return", cancellationUrl: "https://example.test/cancel",
};
const reference = "VG-PAY-ABC123";
const paymentInput = { merchantReference: reference, providerReference: "paylink-001", signal: new AbortController().signal };
function mockHttp(status: number, data: Record<string, unknown>) {
  let count = 0;
  const request = async (_url: string | URL | Request, init?: RequestInit) => {
    count++;
    expect(init?.method).toBe("GET");
    return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
  };
  return { request, calls: () => count };
}

describe("Hubtel Direct status response must prove merchant reference", () => {
  test("missing, blank, or other customer's reference is rejected", async () => {
    for (const clientReference of [undefined, "", "VG-PAY-OTHER"]) {
      const http = mockHttp(200, { status: "Paid", amount: 123.45, ...(clientReference !== undefined ? { clientReference } : {}) });
      const provider = new HubtelPaymentProvider(config, http.request);
      await expect(provider.lookup(paymentInput)).rejects.toThrow("status reference could not be verified");
      expect(http.calls()).toBe(1);
    }
  });
  test("a 403 is not payment evidence even if the body claims Paid", async () => {
    const http = mockHttp(403, { status: "Paid", amount: 123.45, clientReference: reference });
    const provider = new HubtelPaymentProvider(config, http.request);
    await expect(provider.lookup(paymentInput)).rejects.toThrow("lookup failed");
  });
  test("valid echoed reference allows matching normalized observation", async () => {
    const http = mockHttp(200, { status: "Paid", amount: 123.45, clientReference: reference });
    const provider = new HubtelPaymentProvider(config, http.request);
    const observed = await provider.lookup(paymentInput);
    expect(observed.merchantReference).toBe(reference);
    expect(observed.state).toBe("succeeded");
    expect(observed.amountMinor).toBe(12345);
    expect(observed.currency).toBe("GHS");
  });
});
