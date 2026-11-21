import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canIssueCustomerOtp, customerOtpDecision, digestCustomerOtp, generateCustomerOtp, verifyCustomerOtpDigest } from "../src/notifications/customer-otp-policy";
const key = "ab".repeat(32), id = "challenge_123456";
test("OTP is six digits, challenge-bound and never stored as plaintext", () => {
  const code = generateCustomerOtp();
  assert.match(code, /^\d{6}$/);
  const digest = digestCustomerOtp(key, id, code);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, code);
  assert.equal(verifyCustomerOtpDigest(key, id, code, digest), true);
  assert.equal(verifyCustomerOtpDigest(key, "challenge_654321", code, digest), false);
  assert.equal(verifyCustomerOtpDigest(key, id, "invalid", digest), false);
});
test("OTP expires after five minutes and locks after five attempts", () => {
  const createdAt = new Date("2026-11-21T12:00:00Z");
  assert.equal(customerOtpDecision({ createdAt, now: new Date("2026-11-21T12:04:59Z"), attempts: 4 }), "valid");
  assert.equal(customerOtpDecision({ createdAt, now: new Date("2026-11-21T12:05:00Z"), attempts: 0 }), "expired");
  assert.equal(customerOtpDecision({ createdAt, now: createdAt, attempts: 5 }), "locked");
  assert.equal(customerOtpDecision({ createdAt, now: createdAt, attempts: 0, consumedAt: createdAt }), "consumed");
});
test("OTP resend enforces cooldown and hourly issuance cap", () => {
  const now = new Date("2026-11-21T12:01:00Z");
  assert.equal(canIssueCustomerOtp({ now, lastIssuedAt: new Date("2026-11-21T12:00:30Z"), issuesLastHour: 1 }), false);
  assert.equal(canIssueCustomerOtp({ now, lastIssuedAt: new Date("2026-11-21T12:00:00Z"), issuesLastHour: 1 }), true);
  assert.equal(canIssueCustomerOtp({ now, issuesLastHour: 5 }), false);
});

test("OTP HMAC supports real UUID challenge IDs from repository", () => {
  const id="123e4567-e89b-42d3-a456-426614174000";
  const digest=digestCustomerOtp(key,id,"123456");
  assert.equal(verifyCustomerOtpDigest(key,id,"123456",digest),true);
});
