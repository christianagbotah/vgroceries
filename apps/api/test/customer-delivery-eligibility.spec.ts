import { test } from "node:test";
import { strict as assert } from "node:assert";
import { canStageCustomerDelivery } from "../src/notifications/customer-delivery-eligibility";
const eventCreatedAt = new Date("2026-11-21T10:00:00Z");
const consentRecordedAt = new Date("2026-11-21T09:00:00Z");
test("customer messaging fails closed without explicit consent", () => {
  assert.equal(canStageCustomerDelivery({ eventCreatedAt, consentRecordedAt: null, channelEnabled: true }), false);
  assert.equal(canStageCustomerDelivery({ eventCreatedAt, consentRecordedAt, channelEnabled: false }), false);
});
test("consent cannot retroactively authorize old events", () => {
  assert.equal(canStageCustomerDelivery({ eventCreatedAt, consentRecordedAt: new Date("2026-11-21T11:00:00Z"), channelEnabled: true }), false);
  assert.equal(canStageCustomerDelivery({ eventCreatedAt, consentRecordedAt, channelEnabled: true }), true);
});
test("revocation and invalid timestamps suppress delivery", () => {
  assert.equal(canStageCustomerDelivery({ eventCreatedAt, consentRecordedAt, consentRevokedAt: new Date("2026-11-21T09:30:00Z"), channelEnabled: true }), false);
  assert.equal(canStageCustomerDelivery({ eventCreatedAt: new Date(NaN), consentRecordedAt, channelEnabled: true }), false);
});
