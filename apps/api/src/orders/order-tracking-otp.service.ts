import { Inject, Injectable } from "@nestjs/common";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { tokenHash } from "../identity/crypto";
import { ApiProblem } from "../http/errors";
import { OrderProjectionService } from "./order-projection.service";
import { TrackingThrottleService } from "./tracking-throttle.service";
import { VerificationCodeService } from "./verification-code.service";

const OTP_TTL_MS = 5 * 60_000;
const COOLDOWN_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const MAX_ATTEMPTS = 5;

/** Only Ghana mobile numbers in the server-side original order are eligible. */
export function normalizedGhanaSmsPhone(raw: string): string | null {
  const digits = raw.replace(/[\s()+-]/g, "");
  if (/^0[25]\d{8}$/.test(digits)) return "233" + digits.slice(1);
  if (/^233[25]\d{8}$/.test(digits)) return digits;
  return null;
}

/** 
 * Order number + a fresh SMS to the stored order phone are both required.
 * OTPs never leave the API except as provider message content and are never
 * persisted in plaintext. No payment, fulfilment or order status is modified.
 */
@Injectable()
export class OrderTrackingOtpService {
  constructor(
    private readonly db: Database,
    private readonly projection: OrderProjectionService,
    private readonly throttle: TrackingThrottleService,
    private readonly verification: VerificationCodeService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private smsConfiguration() {
    const clientId = process.env.HUBTEL_SMS_CLIENT_ID?.trim();
    const clientSecret = process.env.HUBTEL_SMS_CLIENT_SECRET?.trim();
    const senderId = process.env.HUBTEL_SMS_SENDER_ID?.trim();
    if (!clientId || !clientSecret || !senderId || !/^[A-Za-z0-9]{1,11}$/.test(senderId)) {
      throw new ApiProblem(503, "SMS_UNAVAILABLE", "SMS verification is temporarily unavailable. Please use your private order code or contact support.");
    }
    return { clientId, clientSecret, senderId };
  }

  private async sendSms(phone: string, code: string) {
    const { clientId, clientSecret, senderId } = this.smsConfiguration();
    try {
      const response = await fetch("https://sms.hubtel.com/v1/messages/send", {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          From: senderId,
          To: phone,
          Content: "Your Variety Groceries order verification code is " + code + ". It expires in 5 minutes. Do not share it.",
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("SMS provider did not accept the request.");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("status" in body) || Number(body.status) !== 0) {
        throw new Error("SMS provider acceptance was not confirmed.");
      }
    } catch {
      // No provider error body, token, OTP or phone is included in logs.
      throw new ApiProblem(503, "SMS_UNAVAILABLE", "We could not send a verification SMS. Please try again later or use your private order code.");
    }
  }

  async request(reference: string, clientIp: string) {
    // Counts successful as well as failed attempts in the shared DB.
    await this.throttle.registerFailure("otp-request:" + clientIp, reference);
    const order = await this.db.order.findUnique({
      where: { reference: reference.trim().toUpperCase() },
      select: { id: true, customerPhone: true },
    });
    if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found. Check your order number.");
    const phone = normalizedGhanaSmsPhone(order.customerPhone);
    if (!phone) throw new ApiProblem(503, "SMS_UNAVAILABLE", "SMS verification is unavailable for this order. Contact customer support.");
    this.smsConfiguration();
    if (!this.config.commerce) throw new ApiProblem(503, "SMS_UNAVAILABLE", "Order verification is unavailable.");

    const now = new Date();
    const ipHash = tokenHash("order-sms-request:" + clientIp);
    const [last, countOrder, countIp] = await Promise.all([
      this.db.orderTrackingOtpChallenge.findFirst({
        where: { orderId: order.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true },
      }),
      this.db.orderTrackingOtpChallenge.count({
        where: { orderId: order.id, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
      }),
      this.db.orderTrackingOtpChallenge.count({
        where: { requestIpHash: ipHash, createdAt: { gte: new Date(now.getTime() - HOUR_MS) } },
      }),
    ]);
    if ((last && now.getTime() - last.createdAt.getTime() < COOLDOWN_MS) || countOrder >= 6 || countIp >= 20) {
      throw new ApiProblem(429, "RATE_LIMITED", "Too many verification requests. Please try again later.");
    }

    const challengeId = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const keyVersion = this.config.commerce.verificationActiveKeyVersion;
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.db.orderTrackingOtpChallenge.create({
      data: {
        id: challengeId, orderId: order.id,
        otpDigest: this.verification.otpDigest(order.id, challengeId, code, keyVersion),
        keyVersion, requestIpHash: ipHash, expiresAt,
      },
    });
    try {
      await this.sendSms(phone, code);
    } catch (error) {
      // No usable challenge remains when the provider rejects the SMS.
      await this.db.orderTrackingOtpChallenge.delete({ where: { id: challengeId } }).catch(() => undefined);
      throw error;
    }
    return { challengeId, expiresAt: expiresAt.toISOString() };
  }

  async verify(reference: string, challengeId: string, code: string, clientIp: string) {
    await this.throttle.registerFailure("otp-verify:" + clientIp, reference);
    const order = await this.db.order.findUnique({
      where: { reference: reference.trim().toUpperCase() }, select: { id: true },
    });
    const invalid = () => new ApiProblem(403, "FORBIDDEN", "The code is incorrect or expired. Request a new SMS if needed.");
    if (!order) throw invalid();

    // Atomic five-try limit; an expired or previously consumed proof cannot be retried.
    const claim = await this.db.orderTrackingOtpChallenge.updateMany({
      where: {
        id: challengeId, orderId: order.id, consumedAt: null,
        expiresAt: { gt: new Date() }, attempts: { lt: MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count !== 1) throw invalid();
    const challenge = await this.db.orderTrackingOtpChallenge.findUnique({
      where: { id: challengeId },
    });
    if (!challenge) throw invalid();
    const expected = Buffer.from(challenge.otpDigest, "hex");
    const actual = Buffer.from(this.verification.otpDigest(order.id, challengeId, code, challenge.keyVersion), "hex");
    if (expected.length !== 32 || actual.length !== 32 || !timingSafeEqual(expected, actual)) throw invalid();

    const consumed = await this.db.orderTrackingOtpChallenge.updateMany({
      where: { id: challengeId, orderId: order.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw invalid();
    await this.db.orderTrackingOtpChallenge.updateMany({
      where: { orderId: order.id, consumedAt: null }, data: { consumedAt: new Date() },
    });
    return this.projection.publicOrder(order.id);
  }
}
