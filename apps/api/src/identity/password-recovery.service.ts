import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { spawn } from "node:child_process";
import { z } from "zod";
import { Database } from "../database/database";
import { type ApiRequest, ApiProblem } from "../http/errors";
import { hashPassword, randomToken, tokenHash } from "./crypto";
import { trustedOrigin } from "./identity.service";
import { API_CONFIG, type ApiConfig } from "../config";
import { Inject } from "@nestjs/common";

export const requestPasswordResetSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
});
export const completePasswordResetSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(256),
});

const generic = {
  message: "If an eligible account has that email address, a password reset link will be sent.",
};
const resetTTL = 20 * 60 * 1000;
const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

async function sendResetEmail(email: string, url: string): Promise<void> {
  const from = process.env.PASSWORD_RESET_FROM?.trim();
  const command = process.env.PASSWORD_RESET_SENDMAIL_PATH?.trim() || "/usr/sbin/sendmail";
  if (!from || !emailPattern.test(from) || !emailPattern.test(email) || !command.startsWith("/"))
    throw new Error("Password recovery delivery is not configured.");
  const body = [
    `From: Variety Groceries <${from}>`,
    `To: <${email}>`,
    "Subject: Reset your Variety Groceries password",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "X-Auto-Response-Suppress: All",
    "",
    "We received a request to reset the password for your Variety Groceries account.",
    "Open the secure link below to set a new password:",
    url,
    "",
    "This link expires in 20 minutes and can only be used once.",
    "If you did not request this, ignore this email. Your password has not changed.",
    "Do not forward this link or share it with anyone.",
    "",
    "Variety Groceries",
    "",
  ].join("\r\n");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, ["-t", "-i", "-f", from], { stdio: ["pipe", "ignore", "ignore"] });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Password recovery delivery timed out."));
    }, 15000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error("Password recovery transport rejected the message."));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(body);
  });
}

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private async throttle(identity: string, ip: string) {
    const keys = [
      { key: tokenHash("recovery-email:" + identity), limit: 3 },
      { key: tokenHash("recovery-ip:" + ip), limit: 40 },
    ].sort((a, b) => a.key.localeCompare(b.key));
    const exceeded = await this.db.$transaction(async tx => {
      let excessive = false;
      for (const item of keys) {
        const rows = await tx.$queryRaw<Array<{ attempts: number }>>`
          INSERT INTO "LoginThrottle" (key,"windowStart",attempts)
          VALUES (${item.key},now(),1)
          ON CONFLICT(key) DO UPDATE
          SET attempts=CASE WHEN "LoginThrottle"."windowStart"<=now()-interval '15 minutes'
              THEN 1 ELSE "LoginThrottle".attempts+1 END,
          "windowStart"=CASE WHEN "LoginThrottle"."windowStart"<=now()-interval '15 minutes'
              THEN now() ELSE "LoginThrottle"."windowStart" END
          RETURNING attempts`;
        excessive ||= rows[0].attempts > item.limit;
      }
      return excessive;
    });
    if (exceeded) throw new ApiProblem(429, "RATE_LIMITED", "Too many attempts. Try again later.");
  }

  async requestReset(email: string, req: ApiRequest) {
    trustedOrigin(req, this.config, true);
    const canonicalEmail = email.trim().toLowerCase();
    await this.throttle(canonicalEmail, req.ip ?? req.socket?.remoteAddress ?? "unknown");
    // These values are checked globally before any account lookup: all users
    // see the same response if the mail gateway is not configured.
    const from = process.env.PASSWORD_RESET_FROM?.trim();
    const origin = process.env.PASSWORD_RESET_PUBLIC_ORIGIN?.trim();
    if (!from || !emailPattern.test(from) || !origin || !this.config.webOrigins.includes(origin) ||
      (!origin.startsWith("https://") && !origin.startsWith("http://localhost:"))) {
      throw new ApiProblem(503, "RECOVERY_UNAVAILABLE",
        "Password recovery email is temporarily unavailable. Contact customer support.");
    }
    const user = await this.db.user.findUnique({ where: { email: canonicalEmail } });
    if (!user?.active || !user.email || user.email.endsWith(".invalid") || user.email.endsWith(".test"))
      return generic;
    const secret = randomToken();
    const tokenDigest = tokenHash(secret);
    const reset = await this.db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenDigest,
        expiresAt: new Date(Date.now() + resetTTL),
      },
    });
    // The fragment never reaches the web server or appears in HTTP access logs.
    const url = origin + "/reset-password#token=" + secret;
    try {
      await sendResetEmail(canonicalEmail, url);
      // Preserve a previously emailed, still-valid reset link if the new
      // mail delivery fails. Invalidate older links only after acceptance.
      await this.db.passwordResetToken.updateMany({
        where: { userId: user.id, id: { not: reset.id }, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    } catch {
      await this.db.passwordResetToken.updateMany({
        where: { id: reset.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      // Do not leak which address exists, the raw token, or the recipient.
      console.error(JSON.stringify({ event: "password_recovery.delivery_failed", requestId: req.requestId }));
    }
    return generic;
  }

  async completeReset(token: string, password: string, req: ApiRequest) {
    trustedOrigin(req, this.config, true);
    // Apply a separate lower-cost rate gate to brute-force attempts.
    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    await this.throttle("consume:" + ip, ip);
    const hashedPassword = await hashPassword(password);
    const digest = tokenHash(token);
    return this.db.$transaction(async tx => {
      const found = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
        SELECT id,"userId" FROM "PasswordResetToken" WHERE "tokenHash"=${digest}
        AND "consumedAt" IS NULL AND "expiresAt">now() FOR UPDATE`;
      const reset = found[0];
      if (!reset) throw new ApiProblem(400, "INVALID_RESET_TOKEN", "This password reset link has expired or was already used.");
      const user = await tx.user.findUnique({ where: { id: reset.userId } });
      if (!user?.active) throw new ApiProblem(400, "INVALID_RESET_TOKEN", "This password reset link is no longer valid.");
      const now = new Date();
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: hashedPassword } });
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      // All sessions (web and native) are revoked, including a stolen device.
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.auditEvent.create({
        data: {
          actorId: user.id, action: "identity.password_recovered", entityId: user.id,
          requestId: req.requestId, details: { channel: "email", sessionsRevoked: true },
        },
      });
      return { message: "Your password was changed. Sign in again with the new password." };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
