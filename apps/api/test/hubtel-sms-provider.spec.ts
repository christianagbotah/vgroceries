import { strict as assert } from "node:assert";
import { test } from "node:test";
import { sendHubtelSms, validateHubtelSmsConfig } from "../src/notifications/hubtel-sms-provider";
const config = { endpoint: "https://sms.hubtel.com/v1/messages", clientId: "test", clientSecret: "secret", senderId: "VARIETY" };
test("rejects untrusted endpoints and missing credentials", () => {
  assert.throws(() => validateHubtelSmsConfig({ ...config, endpoint: "https://evil.example/send" }));
  assert.throws(() => validateHubtelSmsConfig({ ...config, clientSecret: "" }));
});
test("sends authenticated JSON and accepts only explicit provider success", async () => {
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    assert.match(String(init?.headers && (init.headers as Record<string, string>).Authorization), /^Basic /);
    assert.equal(JSON.parse(String(init?.body)).To, "+233241234567");
    return new Response(JSON.stringify({ Status: "success", MessageId: "msg-1" }), { status: 200 });
  };
  const result = await sendHubtelSms(config, "+233241234567", "Test order update", fetcher as typeof fetch);
  assert.equal(result.providerReference, "msg-1");
});
test("HTTP 200 without provider acknowledgement is not successful", async () => {
  await assert.rejects(sendHubtelSms(config, "+233241234567", "Test", (async () => new Response("{}", { status: 200 })) as typeof fetch));
});

test("refuses redirects before sending provider credentials to another endpoint", async () => {
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.redirect, "error");
    throw new TypeError("redirect disallowed");
  };
  await assert.rejects(sendHubtelSms(config, "+233241234567", "Test", fetcher as typeof fetch));
});
test("treats provider HTTP 403 as an authorization failure", async () => {
  await assert.rejects(sendHubtelSms(config, "+233241234567", "Test", (async () =>
    new Response(JSON.stringify({ Status: "success" }), { status: 403 })) as typeof fetch), /HTTP 403/);
});

test("rejects endpoint normalization and nonstandard ports before authenticated transport", () => {
  for (const endpoint of [
    " https://sms.hubtel.com/v1/messages",
    "https://sms.hubtel.com/v1/messages ",
    "https://sms.hubtel.com/v1/\\\\messages",
    "https://sms.hubtel.com/v1/\nmessages",
    "https://sms.hubtel.com:8443/v1/messages",
  ]) {
    assert.throws(() => validateHubtelSmsConfig({ ...config, endpoint }), endpoint);
  }
  assert.doesNotThrow(() => validateHubtelSmsConfig(config));
});

test("rejects ambiguous Basic authentication identity and control-character credentials", async () => {
  for (const invalid of [
    { clientId: "merchant:other" },
    { clientId: "merchant\r\n" },
    { clientSecret: "secret\u0000suffix" },
    { senderId: "VG\nSHOP" },
  ]) {
    assert.throws(() => validateHubtelSmsConfig({ ...config, ...invalid }), /unsafe characters/);
  }
  let called = false;
  await assert.rejects(
    sendHubtelSms({ ...config, clientId: "merchant:other" }, "+233241234567", "Test", (async () => {
      called = true;
      throw new Error("unexpected network request");
    }) as typeof fetch),
    /unsafe characters/,
  );
  assert.equal(called, false);
  assert.doesNotThrow(() => validateHubtelSmsConfig({ ...config, clientSecret: "valid:secret" }));
});
