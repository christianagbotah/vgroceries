import { strict as assert } from "node:assert";
import { test } from "node:test";
import { customerDestinationFingerprint, decryptCustomerDestination, encryptCustomerDestination } from "../src/notifications/customer-message-crypto";
const key = "11".repeat(32);
test("customer destinations are encrypted with randomized authenticated ciphertext", () => {
  const first = encryptCustomerDestination("customer@example.com", key);
  const second = encryptCustomerDestination("customer@example.com", key);
  assert.notEqual(first, second);
  assert.ok(!first.includes("customer@example.com"));
  assert.equal(decryptCustomerDestination(first, key), "customer@example.com");
  assert.throws(() => decryptCustomerDestination(first, "22".repeat(32)));
});
test("destination fingerprints normalize case and whitespace", () => {
  assert.equal(customerDestinationFingerprint(" USER@EXAMPLE.COM "), customerDestinationFingerprint("user@example.com"));
  assert.throws(() => encryptCustomerDestination("user@example.com", "invalid"));
});
