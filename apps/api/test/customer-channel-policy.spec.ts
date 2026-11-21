import { strict as assert } from "node:assert";
import { test } from "node:test";
import { channelsForCustomer, customerDeliveryKey, customerMessage } from "../src/notifications/customer-channel-policy";

test("WhatsApp never activates merely because a phone number exists", () => {
  assert.deepEqual(channelsForCustomer({ phone: "+233200000000", email: "customer@example.com" },
    { smsEnabled: true, emailEnabled: true, whatsappOptedIn: false }), ["sms", "email"]);
  assert.deepEqual(channelsForCustomer({ phone: "+233200000000" },
    { smsEnabled: false, emailEnabled: false, whatsappOptedIn: true }), ["whatsapp"]);
});
test("missing contact cannot receive any external message", () => {
  assert.deepEqual(channelsForCustomer({}, { smsEnabled: true, emailEnabled: true, whatsappOptedIn: true }), []);
});
test("payment copy uses SMS-compatible GHS and never reveals purchased items", () => {
  const message = customerMessage("payment.succeeded", "VG-EBCAF74B5A17", 300);
  assert.match(message.body, /GHS 3\.00/);
  assert.match(message.body, /VG-EBCAF74B5A17/);
  assert.doesNotMatch(message.body, /₵/);
});
test("deduplication key varies by event and channel", () => {
  assert.equal(customerDeliveryKey("evt-1", "sms", "customer-1"), customerDeliveryKey("evt-1", "sms", "customer-1"));
  assert.notEqual(customerDeliveryKey("evt-1", "sms", "customer-1"), customerDeliveryKey("evt-1", "email", "customer-1"));
});
