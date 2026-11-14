import { test } from "node:test";
import assert from "node:assert/strict";
import { HubtelSmsClient, normalizeGhanaSmsRecipient } from "../src/notifications/hubtel-sms-client";

test("SMS submission is not a delivery receipt", async () => {
  let request: RequestInit | undefined;
  let calledUrl: string | undefined;
  const client = new HubtelSmsClient({
    clientId: "test-id", clientSecret: "test-value", senderId: "VARIETY",
  }, async (url, init) => {
    calledUrl = String(url);
    request = init;
    return new Response(JSON.stringify({ status: 0, messageId: "test-message-id" }), { status: 201 });
  });
  assert.deepEqual(await client.send("233000000000", "Test message"), {
    messageId: "test-message-id", state: "submitted",
  });
  assert.equal(request?.method, "POST");
  assert.equal(calledUrl, "https://sms.hubtel.com/v1/messages/batch/simple/send");
  assert.deepEqual(JSON.parse(String(request?.body)),
    { From: "VARIETY", Recipients: ["+233000000000"], Content: "Test message" });
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

test("Hubtel batch response with no message ID is accepted but not marked delivered", async () => {
  const client = new HubtelSmsClient({
    clientId: "test-id", clientSecret: "test-value", senderId: "VARIETY",
  }, async () => new Response(JSON.stringify({ status: "0", message: "accepted" }), { status: 200 }));
  assert.deepEqual(await client.send("+233000000000", "Message"), { state: "submitted" });
});

test("Hubtel batch nested message ID is preserved", async () => {
  const client = new HubtelSmsClient({
    clientId: "test-id", clientSecret: "test-value", senderId: "VARIETY",
  }, async () => new Response(JSON.stringify({ status: 0, Messages: [{ MessageId: "nested-1" }] }), { status: 200 }));
  assert.deepEqual(await client.send("233000000000", "Message"),
    { state: "submitted", messageId: "nested-1" });
});

test("Sms_model.php Ghana number variants normalize to +233 before batch submission", () => {
  for (const raw of ["0241234567", "241234567", "233241234567", "+233241234567", "2330241234567", "+2330241234567", "024-123-4567"]) {
    assert.equal(normalizeGhanaSmsRecipient(raw), "+233241234567");
  }
  for (const raw of ["", "123", "+123456789012", "02412345678", "not-a-phone"])
    assert.equal(normalizeGhanaSmsRecipient(raw), null);
});

test("Hubtel model response status=0 accepts submission and does not claim delivery", async () => {
  const client = new HubtelSmsClient({
    clientId: "test-id", clientSecret: "test-value", senderId: "VARIETY",
  }, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.Recipients, ["+233241234567"]);
    return new Response(JSON.stringify({ status: 0 }), { status: 200 });
  });
  assert.deepEqual(await client.send("0241234567", "Order placed"), { state: "submitted" });
});
