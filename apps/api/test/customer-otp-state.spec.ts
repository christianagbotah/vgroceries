import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canAttemptOtp, otpConsumeWhere, otpFailureWhere } from "../src/notifications/customer-otp-state";
const now = new Date("2026-11-21T12:00:00Z");
test("OTP cannot be attempted when expired, consumed or locked", () => {
  const base = { status: "pending", attempts: 0, expiresAt: new Date("2026-11-21T12:05:00Z"), consumedAt: null };
  assert.equal(canAttemptOtp(base, now), true);
  assert.equal(canAttemptOtp({ ...base, attempts: 5 }, now), false);
  assert.equal(canAttemptOtp({ ...base, status: "consumed" }, now), false);
  assert.equal(canAttemptOtp({ ...base, consumedAt: now }, now), false);
  assert.equal(canAttemptOtp({ ...base, expiresAt: now }, now), false);
});
test("atomic success and failure updates require pending unexpired challenges", () => {
  const success = otpConsumeWhere("challenge", "a".repeat(64), now);
  assert.equal(success.status, "pending");
  assert.equal(success.expiresAt.gt, now);
  assert.equal(success.attempts.lt, 5);
  assert.equal(otpFailureWhere("challenge", now).consumedAt, null);
  assert.throws(() => otpConsumeWhere("challenge", "bad", now));
});
