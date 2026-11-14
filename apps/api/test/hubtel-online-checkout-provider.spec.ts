import { test } from "node:test";
import assert from "node:assert/strict";
import { HubtelOnlineCheckoutProvider } from "../src/payments/hubtel-online-checkout-provider";
import { merchantReference } from "../src/payments/payment-initiation.service";

const config = {
  apiId: "example-api-id",
  apiKey: "example-api-key",
  collectionAccount: "12345",
  callbackUrl: "https://api.example.test/api/v1/payments/providers/hubtel_checkout/events",
  returnUrl: "https://portal.example.test/checkout/return",
  cancellationUrl: "https://portal.example.test/checkout/cancel",
};
const input = () => ({
  attemptId: "attempt-1",
  merchantReference: "VG-PAY-1234567890123456789012345",
  orderReference: "VG-ORDER-1001",
  method: "hosted_checkout" as const,
  amountMinor: 12345,
  currency: "GHS" as const,
  payerPhone: "+233241234567",
  signal: new AbortController().signal,
});
const json = (body: unknown, status=200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("Hubtel documented checkout uses Basic sales auth; only creates a redirect, never marks payment paid", async () => {
  let seen: { url: string; init: RequestInit | undefined } | undefined;
  const provider = new HubtelOnlineCheckoutProvider(config, async (url, init) => {
    seen = { url: String(url), init };
    return json({ responseCode: "0000", status: "Success", data: {
      checkoutId: "checkout-abc", checkoutUrl: "https://pay.hubtel.com/checkout-abc",
      clientReference: input().merchantReference,
    } });
  });
  const result = await provider.initiate(input());
  assert.deepEqual(result, { kind: "accepted", action: { kind: "redirect", url: "https://pay.hubtel.com/checkout-abc" } });
  assert.equal(seen?.url, "https://payproxyapi.hubtel.com/items/initiate");
  assert.equal(seen?.init?.method, "POST");
  assert.equal(new Headers(seen?.init?.headers).get("authorization"),
    "Basic " + Buffer.from("example-api-id:example-api-key").toString("base64"));
  const request = JSON.parse(String(seen?.init?.body));
  assert.equal(request.totalAmount, 123.45);
  assert.equal(request.merchantAccountNumber, "12345");
  assert.equal(request.clientReference, input().merchantReference);
  assert.equal(request.description, "Variety Groceries order VG ORDER 1001");
  assert.equal(request.payeeMobileNumber, "233241234567");
});

test("Hubtel Checkout rejects overlong references and missing money before network calls", async () => {
  let calls = 0;
  const provider = new HubtelOnlineCheckoutProvider(config, async () => {
    calls++;
    throw Error("should not call");
  });
  assert.equal((await provider.initiate({ ...input(), merchantReference: "VG-PAY-" + "A".repeat(32) })).kind, "rejected");
  assert.equal((await provider.initiate({ ...input(), amountMinor: 0 })).kind, "rejected");
  assert.equal(calls, 0);
});

test("Hubtel callbacks are only lookup hints, even with a forged Success responseCode", async () => {
  const provider = new HubtelOnlineCheckoutProvider(config);
  const body = Buffer.from(JSON.stringify({ ResponseCode: "0000", Status: "Success",
    Data: { ClientReference: input().merchantReference, CheckoutId: "fake" } }));
  const result = await provider.verifyEvent({ rawBody: body, headers: {} });
  assert.equal(result.verification, "lookup_required");
  if (result.verification === "lookup_required") assert.equal(result.merchantReference, input().merchantReference);
});

test("Hubtel status lookup uses collection account and actual Paid/Unpaid state", async () => {
  let url = "";
  const provider = new HubtelOnlineCheckoutProvider(config, async (request) => {
    url = String(request);
    return json({ responseCode: "0000", message: "Successful", data: {
      status: "Paid", amount: 123.45, currencyCode: null,
      transactionId: "hubtel-transaction-1", clientReference: input().merchantReference,
      paymentMethod: "mobilemoney",
    } });
  });
  const observed = await provider.lookup({ merchantReference: input().merchantReference, signal: input().signal });
  assert.equal(url, "https://api-txnstatus.hubtel.com/transactions/12345/status?clientReference=" + input().merchantReference);
  assert.deepEqual({ state: observed.state, amountMinor: observed.amountMinor, currency: observed.currency,
    providerReference: observed.providerReference, settledChannel: observed.settledChannel },
    { state: "succeeded", amountMinor: 12345, currency: "GHS",
      providerReference: "hubtel-transaction-1", settledChannel: "mobilemoney" });
});

test("Hubtel status with unexpected currency cannot establish paid money identity", async () => {
  const provider = new HubtelOnlineCheckoutProvider(config, async () =>
    json({ responseCode: "0000", data: { status: "Paid", amount: 50, currencyCode: "USD",
      transactionId: "txn", clientReference: input().merchantReference } }));
  const observed = await provider.lookup({ merchantReference: input().merchantReference, signal: input().signal });
  assert.equal(observed.state, "unknown");
});

test("Hubtel status without a transaction ID cannot be finalized", async () => {
  const provider = new HubtelOnlineCheckoutProvider(config, async () =>
    json({ responseCode: "0000", data: {
      status: "Paid", amount: 25, currencyCode: null,
      clientReference: input().merchantReference,
    } }));
  const observed = await provider.lookup({
    merchantReference: input().merchantReference, signal: input().signal,
  });
  assert.equal(observed.state, "unknown");
  assert.equal(observed.providerReference, undefined);
});

test("SweetMothersGH checkout response shape is accepted only when the reference and success code match", async () => {
  const provider = new HubtelOnlineCheckoutProvider(config, async () => json({
    responseCode: "0000",
    status: "Success",
    checkoutId: "checkout-top-level-001",
    checkoutUrl: "https://pay.hubtel.com/checkout-top-level-001",
    clientReference: input().merchantReference,
  }));
  assert.deepEqual(await provider.initiate(input()), {
    kind: "accepted",
    action: { kind: "redirect", url: "https://pay.hubtel.com/checkout-top-level-001" },
  });
});

test("Checkout rejects missing or mismatched transaction reference even with a valid redirect URL", async () => {
  for (const responseData of [
    { checkoutId: "one", checkoutUrl: "https://pay.hubtel.com/one" },
    { checkoutId: "two", checkoutUrl: "https://pay.hubtel.com/two", clientReference: "another-order" },
  ]) {
    const provider = new HubtelOnlineCheckoutProvider(config, async () =>
      json({ responseCode: "0000", data: responseData }));
    assert.equal((await provider.initiate(input())).kind, "rejected");
  }
});

test("Hubtel-only merchant references respect the 32-character limit; other providers retain legacy reference shape", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const checkoutRef = merchantReference("hubtel_checkout");
    assert.match(checkoutRef, /^VG-PAY-[A-F0-9]{25}$/);
    assert.equal(checkoutRef.length, 32);
    assert.ok(!seen.has(checkoutRef));
    seen.add(checkoutRef);
  }
  assert.match(merchantReference("paystack"), /^VG-PAY-[A-F0-9]{32}$/);
});

test("SweetMothersGH root-level callback reference is only an untrusted lookup hint", async () => {
  const provider = new HubtelOnlineCheckoutProvider(config);
  const body = Buffer.from(JSON.stringify({
    Status: "Success", ClientReference: input().merchantReference,
    TransactionId: "unverified",
  }));
  const result = await provider.verifyEvent({ rawBody: body, headers: {} });
  assert.equal(result.verification, "lookup_required");
  if (result.verification === "lookup_required")
    assert.equal(result.merchantReference, input().merchantReference);
});

test("Unparseable checkout callback is rejected before any paid classification", async () => {
  const provider = new HubtelOnlineCheckoutProvider(config);
  const result = await provider.verifyEvent({
    rawBody: Buffer.from("{malformed"), headers: {},
  });
  assert.deepEqual(result, { verification: "invalid" });
});
