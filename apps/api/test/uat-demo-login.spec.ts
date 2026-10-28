import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";

let app: INestApplication;
let db: Database;
let base = "";
const origin = "http://localhost:3000";

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!,
  WEB_ORIGINS: origin,
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
  UAT_DEMO_LOGIN_ENABLED: "true",
  UAT_DEMO_DATABASE_NAME: "variety_foundation_test",
  UAT_DEMO_ADMIN_EMAIL: "demo-admin@variety.example.test",
  UAT_DEMO_INVENTORY_EMAIL: "demo-inventory@variety.example.test",
});

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
});

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User", "LoginThrottle", "AuditEvent", "Location" CASCADE');
  await db.location.create({ data: { id: "loc_accra", name: "Accra" } });
  await db.user.create({
    data: {
      name: "Demo Administrator",
      email: "demo-admin@variety.example.test",
      phone: "",
      passwordHash: "demo-login-does-not-use-password",
      role: "admin",
      locations: { create: { locationId: "loc_accra" } },
    },
  });
  await db.user.create({
    data: {
      name: "Demo Inventory Manager",
      email: "demo-inventory@variety.example.test",
      phone: "",
      passwordHash: "demo-login-does-not-use-password",
      role: "inventory_manager",
      locations: { create: { locationId: "loc_accra" } },
    },
  });
});

after(async () => { await app?.close(); });

test("UAT demo accounts are listed without passwords or email credentials", async () => {
  const response = await fetch(base + "/api/v1/auth/demo-accounts", { headers: { origin } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data, [
    { id: "admin", label: "Administrator", role: "admin" },
    { id: "inventory_manager", label: "Inventory Manager", role: "inventory_manager" },
  ]);
  assert.equal(JSON.stringify(body).includes("password"), false);
  assert.equal(JSON.stringify(body).includes("@variety.example.test"), false);
});

test("selecting a UAT demo account creates a real protected web session without a browser password", async () => {
  const response = await fetch(base + "/api/v1/auth/demo-session", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ accountId: "inventory_manager" }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.actor.role, "inventory_manager");
  assert.equal(body.data.actor.name, "Demo Inventory Manager");
  assert.match(response.headers.get("set-cookie") ?? "", /vg_session=.*HttpOnly/i);
  const user = await db.user.findUniqueOrThrow({ where: { email: "demo-inventory@variety.example.test" } });
  assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
  assert.equal(await db.auditEvent.count({ where: { actorId: user.id, action: "identity.uat_demo_session_created" } }), 1);
});

test("UAT demo session rejects unknown accounts and untrusted origins", async () => {
  const unknown = await fetch(base + "/api/v1/auth/demo-session", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ accountId: "cashier" }),
  });
  assert.equal(unknown.status, 400);

  const hostile = await fetch(base + "/api/v1/auth/demo-session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ accountId: "admin" }),
  });
  assert.equal(hostile.status, 403);
});
