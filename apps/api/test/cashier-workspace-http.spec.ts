import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { after, before, test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { CashierTillsService } from "../src/cashier-tills/cashier-tills.service";
import { productionOpenApi } from "../src/http/production-openapi";

let app: INestApplication;
let db: Database;
let base = "";
const secret = "cashier-workspace-fixture-password-2026";
function passwordHash() {
  const salt = randomBytes(16).toString("hex");
  return "scrypt$32768$8$1$" + salt + "$" +
    scryptSync(secret, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
}
async function login(email: string) {
  const response = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email, password: secret, client: "web" }),
  });
  assert.equal(response.status, 201);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}
async function read(headers: Record<string, string> = {}) {
  const response = await fetch(base + "/api/v1/cashier/pos/workspace", { headers });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.pathname !== "/variety_foundation_test")
    throw Error("Cashier workspace HTTP tests require the disposable foundation PostgreSQL database");
  const cfg = readConfig({
    DATABASE_URL: process.env.DATABASE_URL!,
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "branch-a",
    API_INSECURE_COOKIES: "true",
    POS_TILL_FOUNDATION_ENABLED: "true",
    POS_CASH_SALES_ENABLED: "false",
  });
  app = await createApplication(cfg);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);

  await db.$executeRawUnsafe('TRUNCATE "User", "Location", "LoginThrottle" CASCADE');
  await db.location.createMany({ data: [
    { id: "branch-a", name: "Accra counter", active: true },
    { id: "branch-b", name: "Kumasi counter", active: true },
  ] });
  const hash = passwordHash();
  await db.user.createMany({ data: [
    { id: "cashier-http", name: "Actual Cashier", email: "cashier-http@example.test", phone: "+233240032401", passwordHash: hash, role: "cashier" },
    { id: "admin-http", name: "Admin Staff", email: "admin-http@example.test", phone: "+233240032402", passwordHash: hash, role: "admin" },
    { id: "customer-http", name: "Customer", email: "customer-http@example.test", phone: "+233240032403", passwordHash: hash, role: "customer" },
  ] });
  await db.userLocation.create({ data: { userId: "cashier-http", locationId: "branch-a" } });
  const tills = app.get(CashierTillsService);
  await tills.open("admin-http", "test-read-till-a", "test-request-a", {
    locationId: "branch-a", tillCode: "COUNTER-A", openingFloatMinor: 10000,
  });
  await tills.open("admin-http", "test-read-till-b", "test-request-b", {
    locationId: "branch-b", tillCode: "COUNTER-B", openingFloatMinor: 20000,
  });
});
after(async () => { await app?.close(); });

test("HTTP endpoint enforces real authentication and cashier-only role", async () => {
  assert.equal((await read()).status, 401);
  assert.equal((await read(await login("admin-http@example.test"))).status, 403);
  assert.equal((await read(await login("customer-http@example.test"))).status, 403);
});

test("HTTP cashier read is current-branch scoped and omits private drawer amounts", async () => {
  const response = await read(await login("cashier-http@example.test"));
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const view = response.body.data;
  assert.deepEqual(view.locations, [{ id: "branch-a", name: "Accra counter" }]);
  assert.equal(view.openTills.length, 1);
  assert.equal(view.openTills[0].tillCode, "COUNTER-A");
  assert.ok(!("openingFloatMinor" in view.openTills[0]));
  assert.equal(view.enabled, true);
  assert.equal(view.cashSalesEnabled, false);
  assert.deepEqual(view.ownRecentCashSales, []);
});

test("HTTP previously authenticated cashier loses access after live branch revocation", async () => {
  const headers = await login("cashier-http@example.test");
  assert.equal((await read(headers)).status, 200);
  await db.userLocation.delete({ where: {
    userId_locationId: { userId: "cashier-http", locationId: "branch-a" },
  } });
  assert.equal((await read(headers)).status, 403);
  await db.userLocation.create({ data: { userId: "cashier-http", locationId: "branch-a" } });
  await db.location.update({ where: { id: "branch-a" }, data: { active: false } });
  assert.equal((await read(headers)).status, 403);
});

test("OpenAPI documents only a protected GET for cashier workspace", () => {
  const paths = productionOpenApi(app).paths;
  assert.equal(Object.keys(paths).length, 157);
  const route = paths["/api/v1/cashier/pos/workspace"];
  assert.ok(route?.get);
  assert.equal(route?.post, undefined);
  assert.deepEqual(route?.get?.security, [
    { cookieAuth: [] }, { bearerAuth: [] },
  ]);
});
