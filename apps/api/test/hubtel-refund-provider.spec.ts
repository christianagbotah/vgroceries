import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { HubtelRefundProvider } from "../src/payments/hubtel-refund-provider";
import type { RefundProviderAdapter } from "../src/payments/refund-provider";
import { REFUND_PROVIDER_ADAPTERS, RefundProviderRegistry } from "../src/payments/refund-provider.registry";

const config = {
  baseUrl: "https://refund-api.hubtel.example",
  basicUsername: "merchant-api-id",
  basicPassword: "merchant-api-key",
  collectionAccount: "11684",
  callbackOrigin: "https://portal.varietygroceries.com",
  callbackSecret: "refund_callback_secret_1234567890_abcd",
};

const input = (overrides: Record<string, unknown> = {}) => ({
  refundId: "refund-1",
  executionId: "execution-1",
  merchantRefundReference: "VG-REF-ONE",
  originalPaymentMerchantReference: "VG-PAY-ONE",
  originalPaymentProviderReference: "79213a0568c44c13a8a04ba056d681",
  originalPaymentAmountMinor: 2500,
  originalPaymentResolvedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  orderReference: "VG-ORDER-ONE",
  method: "mobile_money" as const,
  amountMinor: 2500,
  currency: "GHS" as const,
  signal: AbortSignal.timeout(5000),
  ...overrides,
});

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("Hubtel refund config is optional but must be supplied as one secure bundle", () => {
  const base = { DATABASE_URL: "postgresql://u:p@localhost/db", WEB_ORIGINS: "https://portal.varietygroceries.com", API_STOCK_LOCATION_ID: "loc_accra" };
  assert.equal(readConfig(base).hubtelRefund, null);
  assert.throws(() => readConfig({ ...base, HUBTEL_REFUND_COLLECTION_ACCOUNT: "11684" }), /Hubtel refund configuration.*complete bundle/i);
  const parsed = readConfig({
    ...base,
    HUBTEL_REFUND_BASE_URL: config.baseUrl,
    HUBTEL_REFUND_BASIC_USERNAME: config.basicUsername,
    HUBTEL_REFUND_BASIC_PASSWORD: config.basicPassword,
    HUBTEL_REFUND_COLLECTION_ACCOUNT: config.collectionAccount,
    HUBTEL_REFUND_CALLBACK_ORIGIN: config.callbackOrigin,
    HUBTEL_REFUND_CALLBACK_SECRET: config.callbackSecret,
  }).hubtelRefund;
  assert.equal(parsed?.baseUrl, config.baseUrl);
  assert.equal(parsed?.collectionAccount, "11684");
  assert.equal(parsed?.callbackOrigin, "https://portal.varietygroceries.com");
});

test("Hubtel adapter sends the documented order refund request with Basic auth and callback URL", async () => {
  let seen: { url: string; init?: RequestInit } | undefined;
  const adapter = new HubtelRefundProvider(config, async (url, init) => {
    seen = { url: String(url), init };
    return response(202, { message: "Transaction pending. Expect callback request for final state.", responseCode: "0001", data: { orderId: input().originalPaymentProviderReference } });
  });
  const result = await adapter.initiateRefund(input());
  assert.deepEqual(result, { kind: "accepted", state: "pending", providerRefundReference: input().originalPaymentProviderReference });
  assert.equal(seen?.url, `${config.baseUrl}/refund/11684/order/${input().originalPaymentProviderReference}`);
  assert.equal(seen?.init?.method, "POST");
  const headers = new Headers(seen?.init?.headers);
  assert.equal(headers.get("authorization"), `Basic ${Buffer.from(`${config.basicUsername}:${config.basicPassword}`).toString("base64")}`);
  assert.equal(headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(seen?.init?.body)), { callbackUrl: `https://portal.varietygroceries.com/api/v1/refunds/providers/hubtel/callback/${config.callbackSecret}` });
});

test("Hubtel duplicate/in-progress response 4515 remains pending instead of being resent as a failure", async () => {
  const adapter = new HubtelRefundProvider(config, async () => response(423, { responseCode: "4515", message: "Order is currently being processed", data: null }));
  const result = await adapter.initiateRefund(input());
  assert.equal(result.kind, "accepted");
  if (result.kind === "accepted") assert.equal(result.state, "pending");
});

test("Hubtel documented definitive rejection codes map to safe rejected outcomes", async () => {
  for (const [code, http] of [["3000",404],["4000",404],["4509",404]] as const) {
    const adapter = new HubtelRefundProvider(config, async () => response(http, { responseCode: code, message: "provider detail", data: null }));
    const result = await adapter.initiateRefund(input());
    assert.equal(result.kind, "rejected");
    if (result.kind === "rejected") assert.equal(result.failureCode, code);
  }
});

test("Hubtel adapter refuses partial, non-mobile-money, stale or unidentifiable refunds before network I/O", async () => {
  let calls = 0;
  const adapter = new HubtelRefundProvider(config, async () => { calls++; return response(202, { responseCode: "0001", data: { orderId: "x" } }); });
  for (const candidate of [
    input({ amountMinor: 500 }),
    input({ method: "card_hosted" }),
    input({ originalPaymentProviderReference: undefined }),
    input({ originalPaymentResolvedAt: new Date(Date.now() - 46 * 24 * 60 * 60 * 1000) }),
  ]) {
    const result = await adapter.initiateRefund(candidate as ReturnType<typeof input>);
    assert.equal(result.kind, "rejected");
  }
  assert.equal(calls, 0);
});

test("Hubtel adapter advertises mobile-money callback semantics and never claims lookup support", async () => {
  const adapter = new HubtelRefundProvider(config, async () => { throw Error("network must not be used for lookup"); });
  assert.deepEqual(adapter.capabilities(), {
    methods: ["mobile_money"],
    lookupSupported: false,
    safeRetryAfterDefinitiveFailure: false,
    safeRetryAfterNoRecord: false,
    safeRetryAfterUnknown: false,
  });
  const lookup = await adapter.lookupRefund({ merchantRefundReference: "VG-REF-ONE", signal: AbortSignal.timeout(100) });
  assert.equal(lookup.state, "unknown");
  assert.equal(lookup.providerId, "hubtel");
});


test("configured Hubtel refund bundle is registered by bootstrap but remains blocked from live authority without reconciliation support", async () => {
  const parsed = readConfig({
    DATABASE_URL: "postgresql://u:p@localhost/db",
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc_accra",
    API_INSECURE_COOKIES: "true",
    HUBTEL_REFUND_BASE_URL: config.baseUrl,
    HUBTEL_REFUND_BASIC_USERNAME: config.basicUsername,
    HUBTEL_REFUND_BASIC_PASSWORD: config.basicPassword,
    HUBTEL_REFUND_COLLECTION_ACCOUNT: config.collectionAccount,
    HUBTEL_REFUND_CALLBACK_ORIGIN: "http://localhost:3000",
    HUBTEL_REFUND_CALLBACK_SECRET: config.callbackSecret,
  });
  const app = await createApplication(parsed);
  try {
    const adapters = app.get<RefundProviderAdapter[]>(REFUND_PROVIDER_ADAPTERS);
    assert.equal(adapters.some((adapter) => adapter.id === "hubtel"), true);
    assert.throws(
      () => app.get(RefundProviderRegistry).require("hubtel", "mobile_money"),
      /does not support this electronic payment method/i,
    );
  } finally {
    await app.close();
  }
});

test("Hubtel unknown responses and transport failures never become successful refunds", async () => {
  const unknown = new HubtelRefundProvider(config, async () => response(502, { responseCode: "0005", message: "unknown" }));
  await assert.rejects(() => unknown.initiateRefund(input()), /Unexpected Hubtel refund response/);
  const timeout = new HubtelRefundProvider(config, async () => { throw new DOMException("timed out", "TimeoutError"); });
  await assert.rejects(() => timeout.initiateRefund(input()), /timed out/i);
});
