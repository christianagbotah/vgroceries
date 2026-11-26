import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, beforeEach, after, test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { hashPassword, randomToken, tokenHash } from "../src/identity/crypto";
import { productionOpenApi } from "../src/http/production-openapi";

const origin = "http://localhost:3000";
const oldPassword = "Old password for test user 2026!";
const newPassword = "New password for test user 2026!";
const userEmail = "reset-customer-uat@example.com";
let app: INestApplication;
let db: Database;
let base = "";
const oldEnv: Record<string, string | undefined> = {};

async function post(path: string, body: unknown, suppliedOrigin?: string) {
  const response = await fetch(base + "/api/v1" + path, {
    method: "POST", headers: {
      "content-type": "application/json",
      ...(suppliedOrigin ? { origin: suppliedOrigin } : {}),
    }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function login(password = oldPassword) {
  const reply = await post("/auth/sessions", {
    email: userEmail, password, client: "native",
  });
  return reply;
}
async function seededToken() {
  const token = randomToken();
  await db.$executeRaw`
    INSERT INTO "PasswordResetToken" (id, "userId", "tokenHash", "expiresAt")
    VALUES (${randomUUID()}, ${"password-recovery-fixture"}, ${tokenHash(token)},
      now() + interval '15 minutes')
  `;
  return token;
}
before(async () => {
  const databaseName = new URL(process.env.DATABASE_URL!).pathname;
  if (databaseName !== "/variety_foundation_test")
    throw Error("Password recovery tests require the disposable foundation test database");
  for (const key of ["PASSWORD_RESET_FROM", "PASSWORD_RESET_PUBLIC_ORIGIN", "PASSWORD_RESET_SENDMAIL_PATH"])
    oldEnv[key] = process.env[key];
  // /usr/bin/true accepts a message but never sends anything outside CI.
  process.env.PASSWORD_RESET_FROM = "no-reply@example.com";
  process.env.PASSWORD_RESET_PUBLIC_ORIGIN = origin;
  process.env.PASSWORD_RESET_SENDMAIL_PATH = "/usr/bin/true";
  app = await createApplication(readConfig({
    DATABASE_URL: process.env.DATABASE_URL!,
    WEB_ORIGINS: origin, API_STOCK_LOCATION_ID: "loc_accra",
    API_INSECURE_COOKIES: "true",
    PASSWORD_RECOVERY_ENABLED: "true",
  }));
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  // AuditEvent.actorId is deliberately not a foreign key, so it must be
  // cleared explicitly in this disposable DB to make repeated test runs
  // deterministic rather than counting prior synthetic audit events.
  await db.$executeRawUnsafe('TRUNCATE "AuditEvent", "User", "Location", "LoginThrottle" CASCADE');
  await db.location.create({ data: { id: "loc_accra", name: "Accra synthetic", active: true } });
  await db.user.create({
    data: {
      id: "password-recovery-fixture", name: "Synthetic Recovery Customer",
      email: userEmail, phone: "", role: "customer", active: true,
      passwordHash: await hashPassword(oldPassword),
    },
  });
});
beforeEach(async () => {
  // Independent cases must not share IP/email rate-limit counters. The
  // dedicated throttle test retains all four attempts within one case.
  await db.loginThrottle.deleteMany();
});
after(async () => {
  await app?.close();
  for (const key of Object.keys(oldEnv)) {
    if (oldEnv[key] === undefined) delete process.env[key];
    else process.env[key] = oldEnv[key];
  }
});

test("anonymous request requires trusted browser Origin and strict body", async () => {
  assert.equal((await post("/auth/password-reset/request", {email: userEmail})).status, 403);
  assert.equal((await post("/auth/password-reset/request", {email: userEmail}, "https://untrusted.example")).status, 403);
  assert.equal((await post("/auth/password-reset/request", {email: userEmail, role: "admin"}, origin)).status, 400);
  assert.equal((await post("/auth/password-reset/complete", {token:"0".repeat(64),password:newPassword}, "https://untrusted.example")).status, 403);
});

test("unknown and known addresses produce the same generic result without disclosing tokens", async () => {
  const unknown = await post("/auth/password-reset/request", {email:"unknown-recovery@example.com"}, origin);
  const known = await post("/auth/password-reset/request", {email: userEmail.toUpperCase()}, origin);
  assert.equal(unknown.status, 201);
  assert.equal(known.status, 201);
  assert.deepEqual(known.body, unknown.body);
  assert.ok(!JSON.stringify(known.body).includes("token"));
  const rows = await db.passwordResetToken.findMany({
    where: { userId: "password-recovery-fixture" },
    select: { tokenHash:true },
  });
  assert.equal(rows.length, 1);
  assert.match(rows[0].tokenHash, /^[a-f0-9]{64}$/);
  const expiry = await db.$queryRaw<Array<{ seconds: number }>>`
    SELECT EXTRACT(EPOCH FROM ("expiresAt" - now()))::float8 AS seconds
    FROM "PasswordResetToken" WHERE "tokenHash"=${rows[0].tokenHash}
  `;
  assert.ok(expiry[0].seconds > 0 && expiry[0].seconds <= 20 * 60,
    "Issued recovery expiry must be at most 20 minutes from PostgreSQL now()");
});

test("consume one valid token, rotate the password, revoke native and web sessions and prevent replay", async () => {
  const oldSession = await login();
  assert.equal(oldSession.status, 201, JSON.stringify(oldSession.body));
  const token = await seededToken();
  const completed = await post("/auth/password-reset/complete", {token,password:newPassword}, origin);
  assert.equal(completed.status, 201, JSON.stringify(completed.body));
  assert.equal((await post("/auth/password-reset/complete", {token,password:newPassword}, origin)).status, 400);
  const me = await fetch(base + "/api/v1/auth/me", {
    headers: { authorization: "Bearer " + oldSession.body.data.accessToken },
  });
  assert.equal(me.status, 401);
  assert.equal((await login()).status, 401);
  assert.equal((await login(newPassword)).status, 201);
  const active = await db.passwordResetToken.count({
    where: { userId: "password-recovery-fixture", consumedAt: null },
  });
  assert.equal(active, 0);
  const audit = await db.auditEvent.findMany({
    where: { entityId: "password-recovery-fixture", action: "identity.password_recovered" },
  });
  assert.equal(audit.length, 1);
  assert.equal(JSON.stringify(audit).includes(token), false);
  assert.equal(JSON.stringify(audit).includes(newPassword), false);
});

test("expired reset token and inactive account fail without credential change", async () => {
  const expired = randomToken();
  await db.$executeRaw`
    INSERT INTO "PasswordResetToken" (id, "userId", "tokenHash", "expiresAt")
    VALUES (${randomUUID()}, ${"password-recovery-fixture"}, ${tokenHash(expired)},
      now() - interval '1 minute')
  `;
  assert.equal((await post("/auth/password-reset/complete", {token:expired,password:oldPassword}, origin)).status, 400);
  const pending = await seededToken();
  await db.user.update({ where: {id:"password-recovery-fixture"},data:{active:false} });
  assert.equal((await post("/auth/password-reset/complete", {token:pending,password:oldPassword}, origin)).status, 400);
  await db.user.update({ where: {id:"password-recovery-fixture"},data:{active:true} });
});

test("parallel submissions consume one token only once", async () => {
  const token = await seededToken();
  const responses = await Promise.all([
    post("/auth/password-reset/complete", {token,password:"Parallel new password 2026!"}, origin),
    post("/auth/password-reset/complete", {token,password:"Parallel new password 2026!"}, origin),
  ]);
  assert.deepEqual(responses.map(r=>r.status).sort(), [201,400]);
});

test("email request throttle limits repeated anonymous addresses", async () => {
  const reply = () => post("/auth/password-reset/request", {email:"rate-limit-recovery@example.com"}, origin);
  const statuses = (await Promise.all([reply(),reply(),reply(),reply()])).map(x=>x.status).sort();
  assert.deepEqual(statuses,[201,201,201,429]);
});

test("default OFF feature never accepts issue or consume requests", async () => {
  const disabled = await createApplication(readConfig({
    DATABASE_URL: process.env.DATABASE_URL!,
    WEB_ORIGINS:origin, API_STOCK_LOCATION_ID:"loc_accra",
    API_INSECURE_COOKIES:"true",
  }));
  try {
    await disabled.listen(0,"127.0.0.1");
    const off = await disabled.getUrl();
    const r=await fetch(off+"/api/v1/auth/password-reset/request",{
      method:"POST",headers:{origin,"content-type":"application/json"},
      body:JSON.stringify({email:userEmail}),
    });
    assert.equal(r.status,503);
    const c=await fetch(off+"/api/v1/auth/password-reset/complete",{
      method:"POST",headers:{origin,"content-type":"application/json"},
      body:JSON.stringify({token:"0".repeat(64),password:newPassword}),
    });
    assert.equal(c.status,503);
  }finally{await disabled.close();}
});

test("OpenAPI publishes only two public password recovery actions", () => {
  const doc = productionOpenApi(app);
  assert.equal(Object.keys(doc.paths).length,165);
  for (const path of ["/api/v1/auth/password-reset/request","/api/v1/auth/password-reset/complete"]) {
    const route=doc.paths[path];
    assert.ok(route?.post);
    assert.equal(route?.get,undefined);
    assert.deepEqual(route?.post?.security,[]);
  }
});
