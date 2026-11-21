import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** Provider-independent OTP primitives. Never persist or log the raw code. */
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_INTERVAL_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_ISSUES_PER_HOUR = 5;

export function generateCustomerOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
export function digestCustomerOtp(keyHex: string, challengeId: string, code: string): string {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("Invalid OTP secret.");
  if (!/^[a-zA-Z0-9_-]{12,128}$/.test(challengeId)) throw new Error("Invalid challenge identifier.");
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid OTP code.");
  return createHmac("sha256", Buffer.from(keyHex, "hex"))
    .update(`customer-otp-v1:${challengeId}:${code}`).digest("hex");
}
export function verifyCustomerOtpDigest(keyHex: string, challengeId: string, code: string, expectedDigest: string): boolean {
  if (!/^\d{6}$/.test(code) || !/^[0-9a-f]{64}$/i.test(expectedDigest)) return false;
  const actual = digestCustomerOtp(keyHex, challengeId, code);
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedDigest, "hex"));
}
export function customerOtpDecision(input: {
  createdAt: Date; now: Date; attempts: number; consumedAt?: Date | null;
}): "valid" | "expired" | "locked" | "consumed" {
  if (input.consumedAt) return "consumed";
  if (!Number.isSafeInteger(input.attempts) || input.attempts >= OTP_MAX_ATTEMPTS || input.attempts < 0) return "locked";
  const age = input.now.getTime() - input.createdAt.getTime();
  if (!Number.isFinite(age) || age < 0 || age >= OTP_TTL_MS) return "expired";
  return "valid";
}
export function canIssueCustomerOtp(input: {
  now: Date; lastIssuedAt?: Date | null; issuesLastHour: number;
}): boolean {
  const now = input.now.getTime();
  if (!Number.isFinite(now) || !Number.isSafeInteger(input.issuesLastHour) || input.issuesLastHour < 0 || input.issuesLastHour >= OTP_MAX_ISSUES_PER_HOUR) return false;
  if (!input.lastIssuedAt) return true;
  const elapsed = now - input.lastIssuedAt.getTime();
  return Number.isFinite(elapsed) && elapsed >= OTP_RESEND_INTERVAL_MS;
}
