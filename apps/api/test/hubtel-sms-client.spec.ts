import { test } from "node:test";
import assert from "node:assert/strict";
import { HubtelSmsClient } from "../src/notifications/hubtel-sms-client";

test("SMS submission is not a delivery receipt", async () => {
  let request: RequestInit | undefined;
  const client = new HubtelSmsClient({
    clientId: "test-id", clientSecret: "test-value", senderId: "VARIETY",
  }, async (_url, init) => {
    request = init;
    return new Response(JSON.stringify({ status: 0, messageId: "test-message-id" }), { status: 201 });
  });
  assert.deepEqual(await client.send("233000000000", "Test message"), {
    messageId: "test-message-id", state: "submitted",
  });
  assert.equal(request?.method, "POST");
  assert.deepEqual(JSON.parse(String(request?.body)),
    { From: "VARIETY", To: "233000000000", Content: "Test message" });
});

test("Delivery status requires a separate lookup", async () => {
  const client = new HubtelSmsClient({
    clientId: "test-id", clientSecret: "test-value", senderId: "VARIETY",
  }, async () => new Response(JSON.stringify({
    messageId: "test-message-id", status: "Delivered",
  }), { status: 200 }));
  const result = await client.status("test-message-id");
  assert.equal(result.state, "delivered");
});
