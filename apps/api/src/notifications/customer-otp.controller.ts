import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Database } from "../database/database";
import { IdentityService } from "../identity/identity.service";
import { ApiProblem, ApiRequest } from "../http/errors";
import { CustomerOtpRepository } from "./customer-otp-repository";
import { sendHubtelSms } from "./hubtel-sms-provider";

@ApiExcludeController()
@Controller("account/phone-otp")
export class CustomerOtpController {
  constructor(private readonly db: Database, private readonly identity: IdentityService) {}
  private repository() {
    const secret = process.env.CUSTOMER_OTP_HMAC_KEY;
    const encryption = process.env.CUSTOMER_MESSAGE_ENCRYPTION_KEY;
    if (process.env.CUSTOMER_OTP_ENABLED !== "true" || !secret || !encryption ||
      !/^[a-f0-9]{64}$/i.test(secret) || !/^[a-f0-9]{64}$/i.test(encryption)) {
      throw new ApiProblem(503, "FEATURE_DISABLED", "Phone verification is not available.");
    }
    return new CustomerOtpRepository(this.db, secret, encryption);
  }
  private async customerPhone(req: ApiRequest) {
    const { actor } = await this.identity.authenticate(req);
    if (actor.role !== "customer") throw new ApiProblem(403, "FORBIDDEN", "Customer access required.");
    const user = await this.db.user.findUnique({ where: { id: actor.id }, select: { phone: true } });
    if (!user?.phone || !/^\+?[0-9]{9,15}$/.test(user.phone))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Update your account phone number first.");
    return user.phone;
  }
  @Post("request")
  async request(@Req() req: ApiRequest) {
    const phone = await this.customerPhone(req);
    const repo = this.repository();
    const endpoint = process.env.HUBTEL_SMS_ENDPOINT;
    const clientId = process.env.HUBTEL_SMS_CLIENT_ID;
    const clientSecret = process.env.HUBTEL_SMS_CLIENT_SECRET;
    const senderId = process.env.HUBTEL_SMS_SENDER_ID;
    if (!endpoint || !clientId || !clientSecret || !senderId)
      throw new ApiProblem(503, "FEATURE_DISABLED", "Phone verification delivery is not configured.");
    let challenge;
    try { challenge = await repo.issue(phone, "phone_verification"); }
    catch { throw new ApiProblem(429, "RATE_LIMITED", "Please wait before requesting another code."); }
    try {
      await sendHubtelSms({ endpoint, clientId, clientSecret, senderId }, phone,
        `Variety Groceries verification code: ${challenge.code}. Expires in 5 minutes. Do not share this code.`);
    } catch {
      await this.db.customerOtpChallenge.updateMany({ where: { id: challenge.id, status: "pending" }, data: { status: "locked" } });
      throw new ApiProblem(503, "UNAVAILABLE", "Verification SMS could not be sent. Please try again later.");
    }
    return { ok: true, data: { challengeId: challenge.id, expiresAt: challenge.expiresAt } };
  }
  @Post("verify")
  async verify(@Req() req: ApiRequest, @Body() body: unknown) {
    const phone = await this.customerPhone(req);
    const repo = this.repository();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid verification request.");
    const { challengeId, code } = body as Record<string, unknown>;
    if (typeof challengeId !== "string" || typeof code !== "string" || !/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid verification request.");
    const challenge = await this.db.customerOtpChallenge.findUnique({ where: { id: challengeId }, select: { recipientFingerprint: true, purpose: true } });
    const { customerDestinationFingerprint } = await import("./customer-message-crypto");
    if (!challenge || challenge.purpose !== "phone_verification" || challenge.recipientFingerprint !== customerDestinationFingerprint(phone))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid or expired verification code.");
    if (!await repo.verify(challengeId, code))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid or expired verification code.");
    return { ok: true, data: { verified: true } };
  }
}
