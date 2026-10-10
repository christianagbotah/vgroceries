import { Inject, Injectable } from "@nestjs/common";
import { Prisma, Role, User } from "@prisma/client";
import type { Request } from "express";
import type { SessionActor } from "@variety/contracts";
import { API_CONFIG, ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem, ApiRequest } from "../http/errors";
import {
  csrfTokenFor,
  randomToken,
  sameSecretHash,
  tokenHash,
  verifyPassword,
} from "./crypto";

export type AuthRequest = ApiRequest & {
  actor: SessionActor;
  sessionId: string;
  channel: "web" | "native";
  csrfToken?: string;
};
const deny = () =>
  new ApiProblem(401, "UNAUTHENTICATED", "Authentication required.");
const credentialFailure = () =>
  new ApiProblem(401, "UNAUTHENTICATED", "Invalid credentials.");
// A missing identity still pays the same scrypt cost as a known identity.
const dummyHash = "scrypt$32768$8$1$" + "00".repeat(16) + "$" + "00".repeat(64);

export function trustedOrigin(
  req: Request,
  config: ApiConfig,
  required = false,
) {
  const origin = req.get("origin");
  if ((required && !origin) || (origin && !config.webOrigins.includes(origin)))
    throw new ApiProblem(403, "FORBIDDEN", "Untrusted request origin.");
}
function actor(
  user: User & { locations: { locationId: string }[] },
): SessionActor {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    locationIds: user.locations.map((x) => x.locationId),
  };
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  private async throttle(email: string, ip: string) {
    const limits = [
      { key: tokenHash("email:" + email), limit: 5 },
      { key: tokenHash("ip:" + ip), limit: 100 },
    ].sort((a, b) => a.key.localeCompare(b.key));
    const exceeded = await this.db.$transaction(async (tx) => {
      let exceeded = false;
      for (const item of limits) {
        const rows = await tx.$queryRaw<
          { attempts: number }[]
        >`INSERT INTO "LoginThrottle" (key,"windowStart",attempts) VALUES (${item.key},now(),1)
          ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN "LoginThrottle"."windowStart"<=now()-interval '15 minutes' THEN 1 ELSE "LoginThrottle".attempts+1 END,
          "windowStart"=CASE WHEN "LoginThrottle"."windowStart"<=now()-interval '15 minutes' THEN now() ELSE "LoginThrottle"."windowStart" END RETURNING attempts`;
        exceeded ||= rows[0].attempts > item.limit;
      }
      return exceeded;
    });
    if (exceeded)
      throw new ApiProblem(
        429,
        "RATE_LIMITED",
        "Too many attempts. Try again later.",
      );
  }
  async login(
    email: string,
    password: string,
    channel: "web" | "native",
    req: ApiRequest,
  ) {
    trustedOrigin(req, this.config, channel === "web");
    await this.throttle(email, req.ip ?? req.socket.remoteAddress ?? "unknown");
    const user = await this.db.user.findUnique({
      where: { email },
      include: { locations: true },
    });
    const verified = await verifyPassword(
      password,
      user?.passwordHash ?? dummyHash,
    );
    if (!verified || !user?.active) throw credentialFailure();
    const expiresAt = new Date(
      Date.now() + (channel === "web" ? 8 * 60 * 60 : 30 * 24 * 60 * 60) * 1000,
    );
    const secret = randomToken(),
      csrfToken = csrfTokenFor(secret),
      accessToken = randomToken();
    const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.db.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          userId: user.id,
          channel,
          expiresAt,
          ...(channel === "web"
            ? { tokenHash: tokenHash(secret), csrfHash: tokenHash(csrfToken) }
            : {
                accessHash: tokenHash(accessToken),
                accessExpiresAt,
                currentRefreshHash: tokenHash(secret),
                refreshHistory: { create: { hash: tokenHash(secret) } },
              }),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "identity.session_created",
          entityId: session.id,
          requestId: req.requestId,
          details: { channel },
        },
      });
    });
    return channel === "web"
      ? {
          secret,
          data: {
            actor: actor(user),
            csrfToken,
            expiresAt: expiresAt.toISOString(),
          },
        }
      : {
          secret: undefined,
          data: {
            actor: actor(user),
            accessToken,
            accessExpiresAt: accessExpiresAt.toISOString(),
            refreshToken: secret,
            expiresAt: expiresAt.toISOString(),
          },
        };
  }
  async authenticate(
    req: ApiRequest,
  ): Promise<Omit<AuthRequest, keyof ApiRequest>> {
    const authorization = req.get("authorization");
    const cookie = req
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("vg_session="))
      ?.slice(11);
    if (authorization && cookie) throw deny();
    const bearer = authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (authorization && !bearer) throw deny();
    if (!bearer && (!cookie || !/^[a-f0-9]{64}$/.test(cookie))) throw deny();
    const session = await this.db.session.findFirst({
      where: bearer
        ? { accessHash: tokenHash(bearer), channel: "native" }
        : { tokenHash: tokenHash(cookie!), channel: "web" },
      include: { user: { include: { locations: true } } },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !session.user.active ||
      (bearer && (!session.accessExpiresAt || session.accessExpiresAt <= now))
    )
      throw deny();
    if (!bearer && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      trustedOrigin(req, this.config, true);
      const csrf = req.get("x-csrf-token");
      if (!csrf || !session.csrfHash || !sameSecretHash(csrf, session.csrfHash))
        throw new ApiProblem(403, "FORBIDDEN", "Valid CSRF token required.");
    } else trustedOrigin(req, this.config);
    return {
      actor: actor(session.user),
      sessionId: session.id,
      channel: bearer ? "native" : "web",
      ...(!bearer ? { csrfToken: csrfTokenFor(cookie!) } : {}),
    };
  }
  async logout(req: AuthRequest) {
    await this.db.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: req.sessionId },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.actor.id,
          action: "identity.session_revoked",
          entityId: req.sessionId,
          requestId: req.requestId,
          details: {},
        },
      });
    });
    return { done: true };
  }
  async refresh(secret: string, req: ApiRequest) {
    trustedOrigin(req, this.config);
    const digest = tokenHash(secret);
    const history = await this.db.refreshToken.findUnique({
      where: { hash: digest },
    });
    if (!history) throw deny();
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Session" WHERE id=${history.sessionId} FOR UPDATE`;
      const session = await tx.session.findUniqueOrThrow({
        where: { id: history.sessionId },
        include: { user: { include: { locations: true } } },
      });
      if (
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        !session.user.active
      )
        return null;
      if (session.currentRefreshHash !== digest) {
        await tx.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        await tx.auditEvent.create({
          data: {
            actorId: session.userId,
            action: "identity.refresh_reuse",
            entityId: session.id,
            requestId: req.requestId,
            details: {},
          },
        });
        return null; // Throw outside the transaction so revocation commits.
      }
      const accessToken = randomToken(),
        refreshToken = randomToken(),
        accessExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await tx.refreshToken.update({
        where: { hash: digest },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.create({
        data: { hash: tokenHash(refreshToken), sessionId: session.id },
      });
      await tx.session.update({
        where: { id: session.id },
        data: {
          accessHash: tokenHash(accessToken),
          accessExpiresAt,
          currentRefreshHash: tokenHash(refreshToken),
        },
      });
      return {
        actor: actor(session.user),
        accessToken,
        accessExpiresAt: accessExpiresAt.toISOString(),
        refreshToken,
        expiresAt: session.expiresAt.toISOString(),
      };
    });
    if (!result) throw deny();
    return result;
  }
}
