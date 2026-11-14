import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";
import { HubtelSmsGateway, normalizeGhanaMobile } from "../src/notifications/hubtel-sms.gateway";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/test",
  API_STOCK_LOCATION_ID: "loc_accra",
  WEB_ORIGINS: "https://portal.varietygroceries.com",
};
const full = {
  ...base, HUBTEL_SMS_ENABLED: "true",
  HUBTEL_SMS_CLIENT_ID: "fake-test-client", HUBTEL_SMS_CLIENT_SECRET: "fake-test-secret",
  HUBTEL_SMS_SENDER_ID: "VarietyGroc",
};
const config = () => {
  const result = readConfig(full).hubtelSms;
  assert.ok(result);
  return result;
};

test("SMS is disabled by default even with keys (no accidental live send)", () => {
  assert.equal(readConfig(base).hubtelSms, null);
  assert.equal(readConfig({ ...full, HUBTEL_SMS_ENABLED: "false" }).hubtelSms, null);
  assert.equal(readConfig({ ...full, HUBTEL_SMS_ENABLED: undefined }).hubtelSms, null);
});

test("SMS activation requires full credentials, valid approved sender and HTTPS origin", () => {
  for (const candidate of [
    { ...base, HUBTEL_SMS_ENABLED: "true" },
    { ...base, HUBTEL_SMS_CLIENT_ID: "partial" },
    { ...full, HUBTEL_SMS_SENDER_ID: "Variety Groceries" },
    { ...full, HUBTEL_SMS_SENDER_ID: "Invalid#" },
    { ...full, HUBTEL_SMS_SENDER_ID: "012345678912" },
    { ...full, HUBTEL_SMS_ENABLED: "1" },
    { ...full, HUBTEL_SMS_BASE_URL: "http://sms.hubtel.com" },
    { ...full, HUBTEL_SMS_BASE_URL: "https://evil.example" },
    { ...full, HUBTEL_SMS_TIMEOUT_MS: "999999" },
  ]) assert.throws(() => readConfig(candidate));
  assert.equal(config().baseUrl, "https://sms.hubtel.com");
});

test("Ghana mobile numbers normalize; suspicious/non-Ghana inputs fail", () => {
  for (const input of ["0249111411", "+233249111411", "233249111411"])
    assert.equal(normalizeGhanaMobile(input), "233249111411");
  for (const input of ["+234249111411", "0000000000", "02345", "0249111411;xx", "020 123 4567", "abcdef"])
    assert.equal(normalizeGhanaMobile(input), null);
});

test("business POST uses Basic auth and returns accepted rather than delivered", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Response.json({ status: 0, messageId: "msg-safe-123" }, { status: 201 });
  };
  const gateway = new HubtelSmsGateway(config(), fake as typeof fetch);
  assert.deepEqual(await gateway.send("+233249111411", "Order VG-123 has been packed."), {
    state: "accepted", providerMessageId: "msg-safe-123",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://sms.hubtel.com/v1/messages/send");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(new Headers(calls[0].init?.headers).get("authorization"),
    "Basic " + Buffer.from("fake-test-client:fake-test-secret").toString("base64"));
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    From: "VarietyGroc", To: "233249111411", Content: "Order VG-123 has been packed.",
  });
  assert.equal(calls[0].init?.redirect, "error");
});

test("personal SMS account uses lower-case request fields", async () => {
  let sent: Record<string, unknown> | undefined;
  const fake = async (_: unknown, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ status: 0, messageId: "personal-test" });
  };
  const gateway = new HubtelSmsGateway({ ...config(), baseUrl: "https://smsc.hubtel.com" }, fake as typeof fetch);
  assert.equal((await gateway.send("0551223444", "Your order is ready.")).state, "accepted");
  assert.deepEqual(sent, { from: "VarietyGroc", to: "233551223444", content: "Your order is ready." });
});

test("bad phones or malformed content never reach provider", async () => {
  let calls = 0;
  const gateway = new HubtelSmsGateway(config(), (async () => {
    calls++; return Response.json({ status: 0, messageId: "abc" });
  }) as typeof fetch);
  for (const [to, body] of [
    ["000000", "Order ready."], ["0249111411", ""],
    ["0249111411", "x".repeat(321)], ["0249111411", "Hello\u0000there"],
  ]) await assert.rejects(() => gateway.send(to, body));
  assert.equal(calls, 0);
});

test("HTTP failures never count as delivered or accepted", async () => {
  for (const [status, reason] of [[401, "provider_rejected"], [429, "rate_limited"], [503, "unavailable"]] as const) {
    const gateway = new HubtelSmsGateway(config(),
      (async () => Response.json({ status: 1, messageId: "ignored" }, { status })) as typeof fetch);
    assert.deepEqual(await gateway.send("0249111411", "Order packed."), { state: "rejected", reason });
  }
});

test("HTTP 200 with provider failure status still fails", async () => {
  const gateway = new HubtelSmsGateway(config(),
    (async () => Response.json({ status: 23, messageId: "msg" })) as typeof fetch);
  assert.deepEqual(await gateway.send("0249111411", "Order packed."), {
    state: "rejected", reason: "provider_rejected",
  });
});

test("invalid/unknown responses and network failures are never auto-retried", async () => {
  let calls = 0;
  const cases = [
    async () => new Response("not json", { status: 200 }),
    async () => Response.json({ status: 0 }),
    async () => { throw new Error("timeout: ambiguous acceptance"); },
  ];
  for (const fake of cases) {
    const gateway = new HubtelSmsGateway(config(), (async () => { calls++; return fake(); }) as typeof fetch);
    await assert.rejects(() => gateway.send("0249111411", "Order packed."));
  }
  assert.equal(calls, 3);
});

test("directly constructed wrong origin/sender cannot be used", () => {
  for (const change of [{ baseUrl: "https://random.invalid" }, { senderId: "A B" }])
    assert.throws(() => new HubtelSmsGateway({ ...config(), ...change }));
});


test("lookup checks delivery from Hubtel using the sending account credentials", async () => {
  let calls = 0;
  for (const [status, state] of [
    ["Delivered", "delivered"],
    ["Pending", "pending"],
    ["Sent", "pending"],
    ["Blacklisted", "failed"],
    ["Undeliverable", "failed"],
    ["Failed", "failed"],
    ["Unrouteable", "failed"],
    ["Error", "failed"],
    ["Rejected", "failed"],
    ["UnfamiliarOperatorStatus", "unknown"],
  ] as const) {
    const fake = async (url: string | URL | Request, init?: RequestInit) => {
      calls++;
      assert.equal(String(url), "https://sms.hubtel.com/v1/messages/ref-123");
      assert.equal(init?.method, "GET");
      assert.equal(new Headers(init?.headers).get("authorization"),
        "Basic " + Buffer.from("fake-test-client:fake-test-secret").toString("base64"));
      assert.equal(init?.redirect, "error");
      return Response.json({ messageId: "ref-123", status });
    };
    const gateway = new HubtelSmsGateway(config(), fake as typeof fetch);
    assert.deepEqual(await gateway.lookupDelivery("ref-123"), { state });
  }
  assert.equal(calls, 10);
});

test("missing, invalid and ambiguous provider status never confirms SMS delivery", async () => {
  for (const body of [
    { messageId: "ref-123" },
    { messageId: "ref-123", status: 0 },
    { messageId: "ref-123", status: "0" },
  ]) {
    const fake = async () => Response.json(body);
    assert.deepEqual(await new HubtelSmsGateway(config(), fake as typeof fetch)
      .lookupDelivery("ref-123"), { state: "unknown" });
  }
});

test("provider lookup rejects swapped message IDs and malformed payloads", async () => {
  const responses = [
    Response.json({ messageId: "someone-elses-message", status: "Delivered" }),
    new Response("not-json", { status: 200 }),
    Response.json(["bad-response"], { status: 200 }),
  ];
  for (const response of responses) {
    const gateway = new HubtelSmsGateway(config(),
      (async () => response) as typeof fetch);
    await assert.rejects(() => gateway.lookupDelivery("ref-123"));
  }
});

test("provider 404 is unknown, not a delivered or confirmed failure", async () => {
  const gateway = new HubtelSmsGateway(config(),
    (async () => Response.json({ error: "not found" }, { status: 404 })) as typeof fetch);
  assert.deepEqual(await gateway.lookupDelivery("ref-123"), { state: "unknown" });
});

test("lookup transport errors and server outages never count as delivery", async () => {
  for (const fake of [
    async () => Response.json({ status: "Delivered", messageId: "ref-123" }, { status: 500 }),
    async () => Response.json({ status: "Delivered", messageId: "ref-123" }, { status: 429 }),
    async () => { throw new Error("timeout"); },
  ]) {
    const gateway = new HubtelSmsGateway(config(), fake as typeof fetch);
    await assert.rejects(() => gateway.lookupDelivery("ref-123"));
  }
});

test("invalid provider IDs cannot reach the gateway or alter lookup path", async () => {
  let calls = 0;
  const gateway = new HubtelSmsGateway(config(),
    (async () => { calls++; return Response.json({ messageId: "ok", status: "Delivered" }); }) as typeof fetch);
  for (const id of [
    "", "../admin", "ref-123?all=1", "ref/123", "ref 123",
    "https://evil.example", "%2F", "x".repeat(129),
  ]) await assert.rejects(() => gateway.lookupDelivery(id));
  assert.equal(calls, 0);
});
