import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { webSessionResponseSchema } from "@variety/contracts";

let app: INestApplication;
let db: Database;
let base = "";
const origin = "http://localhost:3000";
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: origin,
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

async function post(body: unknown, requestOrigin: string | null = origin) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (requestOrigin) headers.origin = requestOrigin;
  const response = await fetch(base + "/api/v1/auth/register", {
    method: "POST", headers, body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

async function login(body: unknown, requestOrigin: string | null = origin) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (requestOrigin) headers.origin = requestOrigin;
  const response = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST", headers, body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
});

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User", "LoginThrottle", "AuditEvent" CASCADE');
});
after(async () => { await app?.close(); });

const valid = () => ({
  name: "Ama Mensah",
  email: " Ama.Mensah@example.test ",
  phone: "+233 24 123 4567",
  password: "Strong-customer-password-2026",
  client: "web" as const,
});

test("customer registration creates only a customer and signs the new web account in atomically", async () => {
  const result = await post(valid());
  assert.equal(result.response.status, 201);
  assert.ok(webSessionResponseSchema.safeParse(result.body.data).success);
  assert.equal(result.body.data.actor.role, "customer");
  assert.equal(result.body.data.actor.name, "Ama Mensah");
  assert.match(result.response.headers.get("set-cookie") ?? "", /vg_session=.*HttpOnly/i);
  const user = await db.user.findUniqueOrThrow({ where: { email: "ama.mensah@example.test" } });
  assert.equal(user.role, "customer");
  assert.equal(user.phone, "+233241234567");
  assert.notEqual(user.passwordHash, valid().password);
  assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
  assert.equal(await db.auditEvent.count({ where: { actorId: user.id, action: "identity.customer_registered" } }), 1);
});

test("phone-only customer registration succeeds and stores the canonical Ghana number", async () => {
  const request = valid();
  const { email: _email, ...phoneOnly } = request;
  phoneOnly.phone = "024-123-4567";
  const result = await post(phoneOnly);
  assert.equal(result.response.status, 201);
  const user = await db.user.findUniqueOrThrow({ where: { phone: "+233241234567" } });
  assert.equal(user.email, null);
  assert.equal(user.role, "customer");
});

test("duplicate phone formats resolve to one customer identity", async () => {
  const request = valid();
  const { email: _email, ...phoneOnly } = request;
  assert.equal((await post({ ...phoneOnly, phone: "024 123 4567" })).response.status, 201);
  const duplicate = await post({ ...phoneOnly, phone: "+233241234567", name: "Another Name" });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.error.code, "ACCOUNT_EXISTS");
  assert.equal(await db.user.count(), 1);
});

test("phone-only customer can sign in with another common Ghana phone format", async () => {
  const request = valid();
  const { email: _email, ...phoneOnly } = request;
  assert.equal((await post({ ...phoneOnly, phone: "024 123 4567" })).response.status, 201);
  const result = await login({ identifier: "233241234567", password: phoneOnly.password, client: "web" });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.data.actor.role, "customer");
  assert.equal(result.body.data.actor.name, phoneOnly.name);
});

test("customer can still sign in with an optional email address", async () => {
  const request = valid();
  assert.equal((await post(request)).response.status, 201);
  const result = await login({ identifier: "AMA.MENSAH@EXAMPLE.TEST", password: request.password, client: "web" });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.data.actor.role, "customer");
});

test("customer registration is strict, origin-protected and cannot choose a privileged role", async () => {
  assert.equal((await post({ ...valid(), role: "admin" })).response.status, 400);
  assert.equal((await post({ ...valid(), password: "short" })).response.status, 400);
  assert.equal((await post(valid(), null)).response.status, 403);
  assert.equal((await post(valid(), "https://evil.example")).response.status, 403);
  assert.equal(await db.user.count(), 0);
});

test("duplicate registration fails safely without creating another session or changing the existing account", async () => {
  const first = await post(valid());
  assert.equal(first.response.status, 201);
  const user = await db.user.findUniqueOrThrow({ where: { email: "ama.mensah@example.test" } });
  const sessions = await db.session.count({ where: { userId: user.id } });
  const duplicate = await post({ ...valid(), name: "Changed Name" });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.error.code, "ACCOUNT_EXISTS");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).name, "Ama Mensah");
  assert.equal(await db.session.count({ where: { userId: user.id } }), sessions);
});


test("OpenAPI documents public customer registration with the shared strict request and session response", async () => {
  const document = await (await fetch(base + "/api/v1/openapi.json")).json();
  const operation = document.paths["/api/v1/auth/register"]?.post;
  assert.ok(operation);
  assert.deepEqual(operation.security ?? [], []);
  assert.equal(operation.requestBody.content["application/json"].schema.$ref, "#/components/schemas/RegisterRequest");
  assert.equal(operation.responses["201"].content["application/json"].schema.$ref, "#/components/schemas/SessionResponseEnvelope");
});
