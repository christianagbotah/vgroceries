import { Inject, Injectable } from "@nestjs/common";
import type { Request, Response, CookieOptions } from "express";
import { API_CONFIG, ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { csrfTokenFor, randomToken, sameSecretHash, tokenHash } from "../identity/crypto";
import { trustedOrigin } from "../identity/identity.service";

export interface GuestCheckoutContext {
  guestSessionId: string;
  actorId: string;
  actorScope: string;
}

const forbidden = (message = "Valid guest checkout CSRF token required.") =>
  new ApiProblem(403, "FORBIDDEN", message);
const unauthenticated = () =>
  new ApiProblem(401, "UNAUTHENTICATED", "Checkout capability required.");

function cookieValue(req: Request, name: string) {
  const prefix = name + "=";
  return req
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

@Injectable()
export class GuestCheckoutService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private commerce() {
    if (!this.config.commerce)
      throw new ApiProblem(503, "UNAVAILABLE", "Commerce is not configured.");
    return this.config.commerce;
  }

  private context(id: string): GuestCheckoutContext {
    const actorId = `guest:${id}`;
    return { guestSessionId: id, actorId, actorScope: actorId };
  }

  private cookieOptions(httpOnly: boolean, expiresAt: Date): CookieOptions {
    return {
      httpOnly,
      secure: this.config.secureCookies,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    };
  }

  async current(req: Request, touch = true): Promise<GuestCheckoutContext | null> {
    trustedOrigin(req, this.config);
    const raw = cookieValue(req, "vg_guest");
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
    const now = new Date();
    const row = await this.db.guestCheckoutSession.findUnique({
      where: { tokenHash: tokenHash(raw) },
    });
    if (!row || row.revokedAt || row.expiresAt <= now) return null;
    if (touch)
      await this.db.guestCheckoutSession.update({
        where: { id: row.id },
        data: { lastSeenAt: now },
      });
    return this.context(row.id);
  }

  async ensure(req: Request, res: Response): Promise<GuestCheckoutContext> {
    const existing = await this.current(req);
    if (existing) return existing;
    const commerce = this.commerce();
    const token = randomToken();
    const csrf = csrfTokenFor(token);
    const expiresAt = new Date(Date.now() + commerce.guestTtlMinutes * 60_000);
    const row = await this.db.guestCheckoutSession.create({
      data: {
        tokenHash: tokenHash(token),
        csrfHash: tokenHash(csrf),
        expiresAt,
      },
    });
    res.cookie("vg_guest", token, this.cookieOptions(true, expiresAt));
    res.cookie("vg_guest_csrf", csrf, this.cookieOptions(false, expiresAt));
    return this.context(row.id);
  }

  async requireMutation(req: Request, res: Response): Promise<GuestCheckoutContext> {
    trustedOrigin(req, this.config, true);
    const current = await this.current(req);
    if (!current) {
      await this.ensure(req, res);
      throw forbidden("A fresh guest checkout capability was issued. Retry with its CSRF token.");
    }
    const session = await this.db.guestCheckoutSession.findUniqueOrThrow({
      where: { id: current.guestSessionId },
    });
    const header = req.get("x-csrf-token");
    const readable = cookieValue(req, "vg_guest_csrf");
    if (
      !header ||
      !readable ||
      !sameSecretHash(readable, tokenHash(header)) ||
      !sameSecretHash(header, session.csrfHash)
    )
      throw forbidden();
    return current;
  }

  async requireRead(req: Request): Promise<GuestCheckoutContext> {
    const context = await this.current(req);
    if (!context) throw unauthenticated();
    return context;
  }
}
