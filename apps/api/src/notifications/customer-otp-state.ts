/** OTP state transitions are conditional DB updates, not read-then-write. */
export interface OtpChallengeSnapshot {
  status: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
}
export function canAttemptOtp(challenge: OtpChallengeSnapshot, now: Date): boolean {
  const timestamp = now.getTime();
  return challenge.status === "pending" && challenge.consumedAt === null &&
    Number.isFinite(timestamp) && challenge.expiresAt.getTime() > timestamp &&
    Number.isSafeInteger(challenge.attempts) && challenge.attempts >= 0 && challenge.attempts < 5;
}
export function otpConsumeWhere(id: string, digest: string, now: Date) {
  if (!/^[0-9a-f]{64}$/i.test(digest) || !id.trim() || !Number.isFinite(now.getTime()))
    throw new Error("Invalid OTP consumption request.");
  return { id, codeDigest: digest, status: "pending", consumedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } } as const;
}
export function otpFailureWhere(id: string, now: Date) {
  if (!id.trim() || !Number.isFinite(now.getTime())) throw new Error("Invalid OTP failure request.");
  return { id, status: "pending", consumedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } } as const;
}
