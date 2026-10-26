import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { productionOpenApi } from "../src/http/production-openapi";

let app: INestApplication;
let db: Database;
let base = "";
const fixtureSecret = "Verified-dashboard-test-2026";

function fixtureHash() {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$8$1$${salt}$${scryptSync(fixtureSecret, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
}

function config() {
  return readConfig({ DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true" });
}

async function request(path: string, headers: Record<string, string> = {}) {
  const response = await fetch(base + "/api/v1" + path, { headers });
  return { response, body: await response.json() };
}

async function login(email: string) {
  const response = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email, password: fixtureSecret, client: "web" }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0], origin: "http://localhost:3000", "x-csrf-token": body.data.csrfToken };
}

before(async () => {
  const testUrl = new URL(process.env.DATABASE_URL!);
  if (!testUrl.searchParams.get("schema")?.startsWith("vg_dashboard_test_")) throw Error("Dashboard tests require an isolated vg_dashboard_test_* PostgreSQL schema");
  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);

  await db.$executeRawUnsafe('TRUNCATE "Order", "User", "PaymentAttempt", "Refund" CASCADE');
  await db.user.createMany({ data: [
    { id: "dashboard-admin", email: "dashboard-admin@example.test", name: "Dashboard Admin", phone: "+233240000001", passwordHash: fixtureHash(), role: "admin" },
    { id: "dashboard-customer", email: "dashboard-customer@example.test", name: "Dashboard Customer", phone: "+233240000002", passwordHash: fixtureHash(), role: "customer" },
  ] });
  const order = await db.order.create({ data: {
    id: "dashboard-order", reference: "VG-DASHBOARD-1", customerUserId: "dashboard-customer", customerName: "Dashboard Customer", customerPhone: "+233241111111",
    fulfilment: "delivery", paymentMethod: "mobile_money", paymentStatus: "pending", fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned",
    subtotalMinor: 12500, totalMinor: 12500, verificationKeyVersion: 1, verificationCodeHash: "a".repeat(64),
  } });
  await db.paymentAttempt.create({ data: {
    orderId: order.id, provider: "fake", method: "mobile_money", amountMinor: 12500, merchantReference: "VG-DASHBOARD-PAY", status: "pending", initiationState: "accepted", settlementState: "unsettled",
  } });
});

after(async () => { await app?.close(); });

test("admin dashboard is a real protected production endpoint", async () => {
  const missingSession = await request("/admin/dashboard");
  assert.equal(missingSession.response.status, 401);

  const customer = await request("/admin/dashboard", await login("dashboard-customer@example.test"));
  assert.equal(customer.response.status, 403);

  const admin = await request("/admin/dashboard", await login("dashboard-admin@example.test"));
  assert.equal(admin.response.status, 200);
  assert.equal(admin.body.ok, true);
  assert.equal(admin.body.data.actionable.awaitingConfirmation, 1);
  assert.equal(admin.body.data.actionable.pendingPayments, 1);
  assert.equal(admin.body.data.reports.paymentsReconciliation.unsettled, 1);
  assert.equal(admin.body.data.recentOrders[0].reference, "VG-DASHBOARD-1");
  assert.equal(typeof admin.body.data.today.onlineMinor, "number");
});

test("production OpenAPI publishes the admin dashboard route", () => {
  const document = productionOpenApi(app);
  assert.ok(document.paths["/api/v1/admin/dashboard"]?.get);
});
