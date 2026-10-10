import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import type { Request, Response } from "express";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { csrfTokenFor, tokenHash } from "../src/identity/crypto";
import { GuestCheckoutService } from "../src/orders/guest-checkout.service";
import { CheckoutPrincipalService } from "../src/orders/checkout-principal.service";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { readConfig } from "../src/config";

let app: INestApplication;
let second: INestApplication;
let db: Database;
let guest: GuestCheckoutService;
let secondGuest: GuestCheckoutService;
let principal: CheckoutPrincipalService;
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!,
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  COMMERCE_LOCATION_ID: "loc_accra",
  CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440",
  GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1",
  ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

type CookieRecord = { value: string; options: Record<string, unknown> };
class CookieResponse {
  readonly cookies = new Map<string, CookieRecord>();
  cookie(name: string, value: string, options: Record<string, unknown>) {
    this.cookies.set(name, { value, options });
    return this;
  }
}
function response() { return new CookieResponse() as unknown as Response & CookieResponse; }
function request(
  method: string,
  headers: Record<string, string> = {},
): Request {
  const values = Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(), v]));
  return {
    method,
    headers: values,
    get(name: string) { return values[name.toLowerCase()]; },
    socket: { remoteAddress: "127.0.0.1" },
    ip: "127.0.0.1",
    requestId: "req-guest-test",
  } as unknown as Request;
}
function cookieHeader(records: CookieResponse, names = ["vg_guest", "vg_guest_csrf"]) {
  return names.map((name) => `${name}=${records.cookies.get(name)!.value}`).join("; ");
}
async function expectProblem(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ApiProblem);
    assert.equal(error.getStatus(), status);
    assert.equal((error.getResponse() as { code: string }).code, code);
    return true;
  });
}
async function webCredential(userId: string) {
  const secret = tokenHash(`fixture-session:${userId}`);
  const csrf = csrfTokenFor(secret);
  await db.session.create({ data: {
    userId,
    channel: "web",
    tokenHash: tokenHash(secret),
    csrfHash: tokenHash(csrf),
    expiresAt: new Date(Date.now() + 3600000),
  } });
  return { secret, csrf };
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Guest tests require an isolated *variety_foundation_test database");
  app = await createApplication(config());
  second = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  guest = app.get(GuestCheckoutService);
  secondGuest = second.get(GuestCheckoutService);
  principal = app.get(CheckoutPrincipalService);
});
after(async () => { await second?.close(); await app?.close(); });

test("guest ensure issues secure split cookies and stores only hashes", async () => {
  const res = response();
  const context = await guest.ensure(request("GET"), res);
  const sessionCookie = res.cookies.get("vg_guest")!;
  const csrfCookie = res.cookies.get("vg_guest_csrf")!;
  assert.ok(sessionCookie.value && csrfCookie.value);
  assert.equal(sessionCookie.options.httpOnly, true);
  assert.equal(csrfCookie.options.httpOnly, false);
  assert.equal(sessionCookie.options.secure, true);
  assert.equal(sessionCookie.options.sameSite, "lax");
  assert.equal(csrfCookie.options.sameSite, "lax");
  const row = await db.guestCheckoutSession.findUniqueOrThrow({ where: { id: context.guestSessionId } });
  assert.equal(row.tokenHash, tokenHash(sessionCookie.value));
  assert.equal(row.csrfHash, tokenHash(csrfCookie.value));
  const stored = JSON.stringify(await db.guestCheckoutSession.findMany()) + JSON.stringify(await db.auditEvent.findMany());
  assert.ok(!stored.includes(sessionCookie.value));
  assert.ok(!stored.includes(csrfCookie.value));
});

test("guest capability reuses across API instances and touches only a live session", async () => {
  const created = response();
  const first = await guest.ensure(request("GET"), created);
  const before = await db.guestCheckoutSession.findUniqueOrThrow({ where: { id: first.guestSessionId } });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const reused = response();
  const secondContext = await secondGuest.ensure(request("GET", { cookie: cookieHeader(created) }), reused);
  assert.equal(secondContext.guestSessionId, first.guestSessionId);
  const afterRow = await db.guestCheckoutSession.findUniqueOrThrow({ where: { id: first.guestSessionId } });
  assert.ok(afterRow.lastSeenAt >= before.lastSeenAt);
  assert.equal(await db.guestCheckoutSession.count({ where: { id: first.guestSessionId } }), 1);
});

test("guest mutation requires trusted origin and matching CSRF", async () => {
  const created = response();
  await guest.ensure(request("GET"), created);
  const cookie = cookieHeader(created);
  const csrf = created.cookies.get("vg_guest_csrf")!.value;
  await expectProblem(guest.requireMutation(request("POST", { cookie, origin: "https://evil.example", "x-csrf-token": csrf }), response()), 403, "FORBIDDEN");
  await expectProblem(guest.requireMutation(request("POST", { cookie, origin: "http://localhost:3000", "x-csrf-token": "bad" }), response()), 403, "FORBIDDEN");
  const ok = await guest.requireMutation(request("POST", { cookie, origin: "http://localhost:3000", "x-csrf-token": csrf }), response());
  assert.ok(ok.guestSessionId);
});

test("first guest mutation bootstraps cookies but rejects this mutation", async () => {
  const before = await db.guestCheckoutSession.count();
  const res = response();
  await expectProblem(guest.requireMutation(request("POST", { origin: "http://localhost:3000" }), res), 403, "FORBIDDEN");
  assert.ok(res.cookies.has("vg_guest"));
  assert.ok(res.cookies.has("vg_guest_csrf"));
  assert.equal(await db.guestCheckoutSession.count(), before + 1);
});

test("expired or revoked guest capability never revives ownership", async () => {
  const created = response();
  const old = await guest.ensure(request("GET"), created);
  await db.guestCheckoutSession.update({ where: { id: old.guestSessionId }, data: { expiresAt: new Date(0) } });
  const replacement = response();
  await expectProblem(guest.requireMutation(request("POST", {
    cookie: cookieHeader(created), origin: "http://localhost:3000", "x-csrf-token": created.cookies.get("vg_guest_csrf")!.value,
  }), replacement), 403, "FORBIDDEN");
  assert.ok(replacement.cookies.has("vg_guest"));
  const fresh = await guest.ensure(request("GET", { cookie: cookieHeader(replacement) }), response());
  assert.notEqual(fresh.guestSessionId, old.guestSessionId);
  await db.guestCheckoutSession.update({ where: { id: fresh.guestSessionId }, data: { revokedAt: new Date() } });
  await expectProblem(principal.forRead(request("GET", { cookie: cookieHeader(replacement) })), 401, "UNAUTHENTICATED");
});

test("principal resolution prefers valid customer credentials and never downgrades bad or staff credentials to guest", async () => {
  const customer = await webCredential("customer-a");
  const customerPrincipal = await principal.forMutation(request("POST", {
    cookie: `vg_session=${customer.secret}`,
    origin: "http://localhost:3000",
    "x-csrf-token": customer.csrf,
  }), response());
  assert.deepEqual(customerPrincipal, { kind: "customer", userId: "customer-a", actorId: "customer-a", actorScope: "customer:customer-a" });

  const admin = await webCredential("admin-commerce");
  await expectProblem(principal.forMutation(request("POST", {
    cookie: `vg_session=${admin.secret}`,
    origin: "http://localhost:3000",
    "x-csrf-token": admin.csrf,
  }), response()), 403, "FORBIDDEN");
  await expectProblem(principal.forMutation(request("POST", { authorization: "Bearer malformed", origin: "http://localhost:3000" }), response()), 401, "UNAUTHENTICATED");
});

test("read principal requires an existing owning customer or guest capability without creating one", async () => {
  const before = await db.guestCheckoutSession.count();
  await expectProblem(principal.forRead(request("GET")), 401, "UNAUTHENTICATED");
  assert.equal(await db.guestCheckoutSession.count(), before);
  const created = response();
  const context = await guest.ensure(request("GET"), created);
  const p = await principal.forRead(request("GET", { cookie: cookieHeader(created) }));
  assert.deepEqual(p, { kind: "guest", guestSessionId: context.guestSessionId, actorId: `guest:${context.guestSessionId}`, actorScope: `guest:${context.guestSessionId}` });
});
