import { randomUUID } from "node:crypto";
import type { Database } from "../database/database";
import { customerDestinationFingerprint, encryptCustomerDestination } from "./customer-message-crypto";
import { OTP_TTL_MS, OTP_MAX_ISSUES_PER_HOUR, OTP_RESEND_INTERVAL_MS, digestCustomerOtp, generateCustomerOtp } from "./customer-otp-policy";
import { otpConsumeWhere, otpFailureWhere } from "./customer-otp-state";

/** Database-backed OTP operations. Dispatch must be handled by a verified SMS adapter.
 * Never expose the generated code in a public controller response. */
export class CustomerOtpRepository {
  constructor(private readonly db: Database, private readonly secret: string, private readonly encryptionKey: string) {}
  async issue(phone: string, purpose: "phone_verification" | "sensitive_action", now = new Date()) {
    if (!/^\+?[0-9]{9,15}$/.test(phone)) throw new Error("Invalid phone number.");
    const recipientFingerprint = customerDestinationFingerprint(phone);
    const windowStart = new Date(now.getTime() - 3600_000);
    // Serialize issuance for the same destination/purpose across API replicas.
    // The transaction-scoped advisory lock closes the read-then-create race.
    const id = randomUUID();
    const code = generateCustomerOtp();
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${recipientFingerprint + ":" + purpose}, 0))`;
      const recent = await tx.customerOtpChallenge.findMany({
        where: { recipientFingerprint, purpose, createdAt: { gte: windowStart } },
        orderBy: { createdAt: "desc" }, take: OTP_MAX_ISSUES_PER_HOUR,
        select: { createdAt: true },
      });
      if (recent.length >= OTP_MAX_ISSUES_PER_HOUR ||
        (recent[0] && now.getTime() - recent[0].createdAt.getTime() < OTP_RESEND_INTERVAL_MS)) {
        throw new Error("OTP request limit reached.");
      }
      await tx.customerOtpChallenge.create({ data: {
        id, purpose, recipientFingerprint,
        recipientEncrypted: encryptCustomerDestination(phone, this.encryptionKey),
        codeDigest: digestCustomerOtp(this.secret, id, code),
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      } });
    });
    return { id, code, expiresAt: new Date(now.getTime() + OTP_TTL_MS) };
  }
  async verify(id: string, code: string, now = new Date()): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{6}$/.test(code)) return false;
    const digest = digestCustomerOtp(this.secret, id, code);
    // Conditional update makes a successful OTP single-use even under concurrency.
    const success = await this.db.customerOtpChallenge.updateMany({
      where: otpConsumeWhere(id, digest, now),
      data: { status: "consumed", consumedAt: now },
    });
    if (success.count === 1) return true;
    // Incorrect attempts are incremented atomically; an expired or consumed
    // challenge is never modified. This operation never returns the correct code.
    await this.db.customerOtpChallenge.updateMany({
      where: otpFailureWhere(id, now),
      data: { attempts: { increment: 1 } },
    });
    return false;
  }
}
