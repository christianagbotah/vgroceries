import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";
import { createApplication } from "../src/bootstrap";
import { HubtelPaymentProvider } from "../src/payments/hubtel-payment-provider";
import { PaymentProviderRegistry } from "../src/payments/payment-provider.registry";
import { PaymentPolicyService } from "../src/payments/payment-policy.service";

function fakeFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const response = responses.shift();
    assert.ok(response, `Unexpected fetch call to ${url}`);
    return new Response(JSON.stringify(response.body), { status: response.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetcher };
}

const providerConfig = () => ({
  clientId: "hubtel-client",
  clientSecret: "hubtel-secret",
  requestMoneyUrl: "https://api.hubtel.example/request-money/{mobileNumber}",
  statusUrl: "https://api.hubtel.example/status/{reference}",
  callbackUrl: "https://portal.example.test/api/v1/payments/providers/hubtel/events",
  returnUrl: "https://portal.example.test/checkout/payment-return",
  cancellationUrl: "https://portal.example.test/checkout/payment-return?cancelled=1",
});

const input = () => ({
  attemptId: "attempt-1",
  merchantReference: "VG-PAY-ABC123",
  orderReference: "VG-ORDER-1001",
  method: "mobile_money" as const,
  amountMinor: 12345,
  currency: "GHS" as const,
  payerPhone: "+233241111111",
  signal: new AbortController().signal,
});

test("Hubtel payment config is optional, complete and provider-bound", () => {
  const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db", WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc", API_INSECURE_COOKIES: "true" };
  assert.equal(readConfig(base).hubtelPayment, null);
  const generic = { ...base, PAYMENT_PROVIDER_ID: "hubtel", PAYMENT_ENABLED_METHODS: "mobile_money", PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "5000", PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "pay.hubtel.com" };
  assert.throws(() => readConfig(generic), /Hubtel payment configuration/i);
  const cfg = readConfig({ ...generic, HUBTEL_CLIENT_ID: "client", HUBTEL_CLIENT_SECRET: "secret", HUBTEL_REQUEST_MONEY_URL: "https://api.hubtel.com/request-money/{mobileNumber}", HUBTEL_STATUS_URL: "https://api.hubtel.com/status/{reference}", HUBTEL_CALLBACK_URL: "https://portal.example.test/api/v1/payments/providers/hubtel/events", HUBTEL_RETURN_URL: "https://portal.example.test/checkout/payment-return", HUBTEL_CANCELLATION_URL: "https://portal.example.test/checkout/payment-return?cancelled=1" });
  assert.equal(cfg.hubtelPayment?.clientId, "client");
});

test("Hubtel rejects invalid or overlong merchant references before contacting gateway", async () => {
  const http = fakeFetch();
  const adapter = new HubtelPaymentProvider(providerConfig(), http.fetcher);
  for (const ref of [
    "VG-PAY-" + "A".repeat(32),
    "VG-PAY-" + "F".repeat(26),
    "VG-PAY-UNSAFE<>",
    "VG-PAY-ABC123-OTHER",
    "",
  ]) {
    const result = await adapter.initiate({...input(),merchantReference:ref});
    assert.equal(result.kind, "rejected");
    if (result.kind === "rejected")
      assert.equal(result.failureCode, "HUBTEL_REFERENCE_TOO_LONG_OR_INVALID");
  }
  assert.equal(http.calls.length, 0);
});

test("Hubtel Request Money uses Basic auth and returns its hosted paylink", async () => {
  const http = fakeFetch({ status: 201, body: { message: "success", code: "0000", data: { paylinkId: "paylink-001", clientReference: "VG-PAY-ABC123", paylinkUrl: "https://pay.hubtel.com/paylink-001", expiresAt: 1234567890 } } });
  const adapter = new HubtelPaymentProvider(providerConfig(), http.fetcher);
  const result = await adapter.initiate(input());
  assert.deepEqual(result, { kind: "accepted", providerReference: "paylink-001", action: { kind: "redirect", url: "https://pay.hubtel.com/paylink-001" } });
  assert.equal(http.calls[0].url, "https://api.hubtel.example/request-money/%2B233241111111");
  assert.equal(new Headers(http.calls[0].init?.headers).get("authorization"), `Basic ${Buffer.from("hubtel-client:hubtel-secret").toString("base64")}`);
  const body = JSON.parse(String(http.calls[0].init?.body));
  assert.equal(body.amount, 123.45);
  assert.equal(body.clientReference, "VG-PAY-ABC123");
  assert.equal(body.callbackUrl, providerConfig().callbackUrl);
});

test("Hubtel callback is lookup-required evidence and authoritative lookup normalizes success", async () => {
  const http = fakeFetch({ body: { responseCode: "0000", data: { status: "Paid", amount: 123.45, clientReference: "VG-PAY-ABC123", paylinkId: "paylink-001", transactionDate: "2026-10-24T10:00:00.000Z" } } });
  const adapter = new HubtelPaymentProvider(providerConfig(), http.fetcher);
  const rawBody = Buffer.from(JSON.stringify({ responseCode: "0000", data: { status: "Paid", amount: 123.45, paylinkId: "paylink-001", clientReference: "VG-PAY-ABC123" } }));
  const verified = await adapter.verifyEvent({ rawBody, headers: {} });
  assert.equal(verified.verification, "lookup_required");
  const observed = await adapter.lookup({ merchantReference: "VG-PAY-ABC123", providerReference: "paylink-001", signal: new AbortController().signal });
  assert.equal(http.calls[0].url, "https://api.hubtel.example/status/VG-PAY-ABC123");
  assert.deepEqual(observed, { providerId: "hubtel", merchantReference: "VG-PAY-ABC123", providerReference: "paylink-001", state: "succeeded", amountMinor: 12345, currency: "GHS", providerTimestamp: new Date("2026-10-24T10:00:00.000Z") });
});

test("Hubtel collection rejects missing payer phone and provider-limit overflow before network I/O", async () => {
  const http = fakeFetch();
  const adapter = new HubtelPaymentProvider(providerConfig(), http.fetcher);
  assert.equal((await adapter.initiate({ ...input(), payerPhone: undefined })).kind, "rejected");
  assert.equal((await adapter.initiate({ ...input(), amountMinor: 3_000_001 })).kind, "rejected");
  assert.equal(http.calls.length, 0);
});


test("Hubtel Direct status refuses Paid without independently echoed matching merchant identity", async () => {
  const expected = { merchantReference: "VG-PAY-ABC123", providerReference: "paylink-001", signal: new AbortController().signal };
  for (const data of [
    { status: "Paid", amount: 123.45, paylinkId: "paylink-001" },
    { status: "Paid", amount: 123.45, paylinkId: "paylink-001", clientReference: "" },
    { status: "Paid", amount: 123.45, paylinkId: "paylink-001", clientReference: "   " },
    { status: "Paid", amount: 123.45, paylinkId: "paylink-001", clientReference: "VG-ANOTHER-ORDER" },
    { status: "Pending", amount: 123.45, paylinkId: "paylink-001" },
  ]) {
    const http = fakeFetch({body:{responseCode:"0000",data}});
    const provider = new HubtelPaymentProvider(providerConfig(),http.fetcher);
    await assert.rejects(provider.lookup(expected),/reference could not be verified/);
    assert.equal(http.calls.length,1);
    assert.equal(http.calls[0].init?.method,"GET");
  }
});

test("Hubtel Direct 403 cannot provide Paid evidence, exact echoed merchant reference is required", async () => {
  const wanted = { merchantReference:"VG-PAY-ABC123",signal:new AbortController().signal };
  const denied = fakeFetch({status:403,body:{data:{
    status:"Paid",amount:123.45,clientReference:"VG-PAY-ABC123",
  }}});
  await assert.rejects(
    new HubtelPaymentProvider(providerConfig(),denied.fetcher).lookup(wanted),
    /lookup failed/,
  );
  const valid = fakeFetch({body:{data:{
    status:"Paid",amount:123.45,clientReference:"VG-PAY-ABC123",
  }}});
  const confirmed = await new HubtelPaymentProvider(providerConfig(),valid.fetcher).lookup(wanted);
  assert.equal(confirmed.merchantReference,"VG-PAY-ABC123");
  assert.equal(confirmed.state,"succeeded");
  assert.equal(confirmed.amountMinor,12345);
});

test("Hubtel Direct lookup refuses to invent a provider-issued reference already attached to the attempt", async () => {
  const request = {
    merchantReference: "VG-PAY-ABC123",
    providerReference: "paylink-001",
    signal: new AbortController().signal,
  };
  for (const data of [
    { status: "Paid", amount: 123.45, clientReference: request.merchantReference },
    { status: "Paid", amount: 123.45, clientReference: request.merchantReference, paylinkId: "" },
    { status: "Paid", amount: 123.45, clientReference: request.merchantReference, paylinkId: "   " },
    { status: "Paid", amount: 123.45, clientReference: request.merchantReference, paylinkId: "paylink-unrelated" },
    { status: "Pending", amount: 123.45, clientReference: request.merchantReference },
  ]) {
    const http = fakeFetch({body:{data}});
    await assert.rejects(
      new HubtelPaymentProvider(providerConfig(),http.fetcher).lookup(request),
      /provider reference could not be verified/,
    );
    assert.equal(http.calls.length,1);
  }
  const valid = fakeFetch({body:{data:{
    status:"Paid",amount:123.45,clientReference:request.merchantReference,
    paylinkId:request.providerReference,
  }}});
  const observed = await new HubtelPaymentProvider(providerConfig(),valid.fetcher).lookup(request);
  assert.equal(observed.providerReference,request.providerReference);
  assert.equal(observed.merchantReference,request.merchantReference);
  assert.equal(observed.state,"succeeded");
  assert.equal(observed.amountMinor,12345);
});

test("Hubtel Direct can use a verified merchant reference when the original attempt has no provider ID", async () => {
  const http = fakeFetch({body:{data:{
    status:"Pending",amount:123.45,clientReference:"VG-PAY-ABC123",
  }}});
  const observation = await new HubtelPaymentProvider(providerConfig(),http.fetcher).lookup({
    merchantReference:"VG-PAY-ABC123",signal:new AbortController().signal,
  });
  assert.equal(observation.merchantReference,"VG-PAY-ABC123");
  assert.equal(observation.providerReference,undefined);
  assert.equal(observation.state,"pending");
});

test("Hubtel payment lookup rejects explicit foreign or conflicting currencies without fabricating GHS evidence", async () => {
  const lookup = {
    merchantReference: "VG-PAY-ABC123",
    providerReference: "paylink-001",
    signal: new AbortController().signal,
  };
  const baseData = {
    status: "Paid", amount: 123.45,
    clientReference: lookup.merchantReference, paylinkId: lookup.providerReference,
  };
  for (const currencyData of [
    {currencyCode:"USD"}, {CurrencyCode:"EUR"}, {currency:"USD"},
    {Currency:"GBP"}, {currencyCode:"   "}, {currencyCode:123},
    {currencyCode:"GHS", currency:"USD"},
    {currencyCode:null, Currency:"CAD"},
  ]) {
    const http = fakeFetch({body:{data:{...baseData,...currencyData}}});
    await assert.rejects(
      new HubtelPaymentProvider(providerConfig(),http.fetcher).lookup(lookup),
      /currency could not be verified/,
    );
    assert.equal(http.calls.length,1);
  }
});

test("Hubtel Ghana status accepts explicitly GHS or documented null currencyCode only with all other checks", async () => {
  const lookup = {
    merchantReference: "VG-PAY-ABC123",
    providerReference: "paylink-001",
    signal: new AbortController().signal,
  };
  for (const currencyData of [
    {currencyCode:null}, {currencyCode:"GHS"}, {Currency:"ghs"}, {currencyCode:"  GHS  "},
  ]) {
    const http = fakeFetch({body:{data:{
      status:"Paid",amount:123.45,
      clientReference:lookup.merchantReference,
      paylinkId:lookup.providerReference,...currencyData,
    }}});
    const result = await new HubtelPaymentProvider(providerConfig(),http.fetcher).lookup(lookup);
    assert.equal(result.currency,"GHS");
    assert.equal(result.amountMinor,12345);
    assert.equal(result.state,"succeeded");
    assert.equal(result.merchantReference,lookup.merchantReference);
    assert.equal(result.providerReference,lookup.providerReference);
  }
});

test("configured Hubtel bundle auto-registers the collection adapter in NestJS", async () => {
  const config = readConfig({
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc",
    API_INSECURE_COOKIES: "true",
    PAYMENT_PROVIDER_ID: "hubtel",
    PAYMENT_ENABLED_METHODS: "mobile_money",
    PAYMENT_CONFIRMED_HOLD_MINUTES: "1440",
    PAYMENT_PROVIDER_TIMEOUT_MS: "5000",
    PAYMENT_RECONCILE_AFTER_SECONDS: "120",
    PAYMENT_HOSTED_DOMAINS: "pay.hubtel.com",
    HUBTEL_CLIENT_ID: "client",
    HUBTEL_CLIENT_SECRET: "secret",
    HUBTEL_REQUEST_MONEY_URL: "https://api.hubtel.com/request-money/{mobileNumber}",
    HUBTEL_STATUS_URL: "https://api.hubtel.com/status/{reference}",
    HUBTEL_CALLBACK_URL: "https://portal.example.test/api/v1/payments/providers/hubtel/events",
    HUBTEL_RETURN_URL: "https://portal.example.test/checkout/payment-return",
    HUBTEL_CANCELLATION_URL: "https://portal.example.test/checkout/payment-return?cancelled=1",
  });
  const app = await createApplication(config);
  try {
    assert.equal(app.get(PaymentProviderRegistry).requireConfigured().id, "hubtel");
    assert.deepEqual(app.get(PaymentProviderRegistry).requireConfigured().capabilities().methods, ["mobile_money"]);
    // Collection must work without any configured refund API or refund entitlement.
    assert.equal(config.hubtelRefund, null);
    const paymentPolicy = app.get(PaymentPolicyService);
    assert.equal(paymentPolicy.assertElectronicMethodAvailable("mobile_money").id, "hubtel");
    assert.equal(paymentPolicy.resolveElectronicMethod().method, "mobile_money");
    assert.throws(() => paymentPolicy.assertElectronicMethodAvailable("card_hosted"), /unavailable/i);
    assert.throws(() => paymentPolicy.validateProviderAction({ kind: "redirect", url: "http://pay.hubtel.com/insecure" }), /HTTPS/i);
    assert.throws(() => paymentPolicy.validateProviderAction({ kind: "redirect", url: "https://untrusted.example/checkout" }), /allowlist/i);
    assert.deepEqual(paymentPolicy.validateProviderAction({ kind: "redirect", url: "https://pay.hubtel.com/checkout" }), { kind: "redirect", url: "https://pay.hubtel.com/checkout" });
  } finally {
    await app.close();
  }
});
