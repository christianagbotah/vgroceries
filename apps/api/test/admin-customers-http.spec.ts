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
const fixtureSecret = "Verified-admin-customers-2026";

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
  const databaseName = testUrl.pathname.replace(/^\//, "");
  const isolatedSchema = testUrl.searchParams.get("schema")?.startsWith("vg_admin_core_test_") ?? false;
  if (databaseName !== "variety_foundation_test" && !isolatedSchema)
    throw Error("Admin customer tests require the foundation test database or an isolated vg_admin_core_test_* PostgreSQL schema");

  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);

  await db.$executeRawUnsafe('TRUNCATE "Order", "User", "CustomerAddress", "LoginThrottle" CASCADE');
  await db.user.createMany({ data: [
    { id: "customers-admin", email: "customers-admin@example.test", name: "Customer Admin", phone: "+233240003001", passwordHash: fixtureHash(), role: "admin" },
    { id: "customers-inventory", email: "customers-inventory@example.test", name: "Inventory Manager", phone: "+233240003002", passwordHash: fixtureHash(), role: "inventory_manager" },
    { id: "customer-akosua", email: "akosua@example.test", name: "Akosua Mensah", phone: "", passwordHash: fixtureHash(), role: "customer", createdAt: new Date("2026-10-01T09:00:00Z") },
    { id: "customer-kojo", email: "kojo@example.test", name: "Kojo Boateng", phone: "+233240003004", passwordHash: fixtureHash(), role: "customer", createdAt: new Date("2026-10-02T09:00:00Z") },
  ] });
  await db.customerAddress.create({ data: { id: "addr-akosua", userId: "customer-akosua", label: "Home", recipientName: "Akosua Mensah", phone: "+233244444444", locality: "Osu", street: "Oxford Street", landmark: "Mall", ghanaPostGps: "GA-123-4567", isDefault: true } });
  await db.order.createMany({ data: [
    { id: "customer-order-paid", reference: "VG-CUST-1001", customerUserId: "customer-akosua", customerName: "Akosua Mensah", customerPhone: "+233244444444", customerEmail: "akosua@example.test", fulfilment: "collection", paymentMethod: "cash_counter", paymentStatus: "succeeded", fulfilmentStatus: "collected", deliveryStatus: "delivered", subtotalMinor: 12000, totalMinor: 12000, verificationKeyVersion: 1, verificationCodeHash: "a".repeat(64), createdAt: new Date("2026-10-20T12:00:00Z") },
    { id: "customer-order-failed", reference: "VG-CUST-1002", customerUserId: "customer-akosua", customerName: "Akosua Mensah", customerPhone: "+233244444444", customerEmail: "akosua@example.test", fulfilment: "delivery", paymentMethod: "mobile_money", paymentStatus: "failed", fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned", subtotalMinor: 5000, totalMinor: 5000, verificationKeyVersion: 1, verificationCodeHash: "b".repeat(64), createdAt: new Date("2026-10-21T12:00:00Z") },
  ] });
});

after(async () => { await app?.close(); });

test("admin customer reads are protected and remain administrator-only", async () => {
  assert.equal((await request("/admin/customers")).response.status, 401);
  assert.equal((await request("/admin/customers", await login("akosua@example.test"))).response.status, 403);
  assert.equal((await request("/admin/customers", await login("customers-inventory@example.test"))).response.status, 403);
});

test("admin customer list projects real account aggregates without fabricating returns", async () => {
  const headers = await login("customers-admin@example.test");
  const result = await request("/admin/customers", headers);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.data.length, 2);
  const akosua = result.body.data.find((row: { id: string }) => row.id === "customer-akosua");
  assert.equal(akosua.name, "Akosua Mensah");
  assert.equal(akosua.phone, "+233244444444");
  assert.equal(akosua.orderCount, 2);
  assert.equal(akosua.spendLabel, "₵120.00");
  assert.equal(akosua.returnCount, 0);
  assert.equal(akosua.addressCount, 1);
  assert.deepEqual(akosua.supportNotes, []);
  assert.equal(akosua.isDemo, false);
});

test("admin customer detail returns persisted addresses and order history", async () => {
  const headers = await login("customers-admin@example.test");
  const result = await request("/admin/customers/customer-akosua", headers);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.customer.id, "customer-akosua");
  assert.deepEqual(result.body.data.customer.addressIds, ["addr-akosua"]);
  assert.equal(result.body.data.addresses[0].ghanaPostGps, "GA-123-4567");
  assert.deepEqual(result.body.data.orders.map((row: { reference: string }) => row.reference), ["VG-CUST-1002", "VG-CUST-1001"]);
  assert.deepEqual(result.body.data.returns, []);

  const missing = await request("/admin/customers/not-a-customer", headers);
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error.code, "NOT_FOUND");
});

test("admin customers returns an empty list when there are no customer accounts", async () => {
  const headers = await login("customers-admin@example.test");
  await db.user.updateMany({ where: { id: { in: ["customer-akosua", "customer-kojo"] } }, data: { role: "rider" } });
  const result = await request("/admin/customers", headers);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.data, []);
});

test("production OpenAPI publishes both admin customer read routes", () => {
  const document = productionOpenApi(app);
  assert.ok(document.paths["/api/v1/admin/customers"]?.get);
  assert.ok(document.paths["/api/v1/admin/customers/{customerId}"]?.get);
});
