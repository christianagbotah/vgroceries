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
const fixtureSecret = "Verified-admin-orders-2026";

function fixtureHash() {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$8$1$${salt}$${scryptSync(fixtureSecret, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
}

function config() {
  return readConfig({
    DATABASE_URL: process.env.DATABASE_URL!,
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc_accra",
    API_INSECURE_COOKIES: "true",
  });
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
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    origin: "http://localhost:3000",
    "x-csrf-token": body.data.csrfToken,
  };
}

before(async () => {
  const testUrl = new URL(process.env.DATABASE_URL!);
  const databaseName = testUrl.pathname.replace(/^\//, "");
  const isolatedSchema = testUrl.searchParams.get("schema")?.startsWith("vg_admin_core_test_") ?? false;
  if (databaseName !== "variety_foundation_test" && !isolatedSchema)
    throw Error("Admin order tests require the foundation test database or an isolated vg_admin_core_test_* PostgreSQL schema");

  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);

  await db.$executeRawUnsafe('TRUNCATE "Order", "User", "DeliveryZone", "GuestCheckoutSession", "LoginThrottle" CASCADE');
  await db.user.createMany({ data: [
    { id: "orders-admin", email: "orders-admin@example.test", name: "Orders Admin", phone: "+233240001001", passwordHash: fixtureHash(), role: "admin" },
    { id: "orders-inventory", email: "orders-inventory@example.test", name: "Inventory User", phone: "+233240001002", passwordHash: fixtureHash(), role: "inventory_manager" },
    { id: "orders-customer", email: "orders-customer@example.test", name: "Akosua Mensah", phone: "+233240001003", passwordHash: fixtureHash(), role: "customer" },
  ] });
  await db.deliveryZone.create({ data: {
    id: "zone-accra-core", name: "Accra Core", areas: ["Osu"], feeMinor: 1500,
    minimumOrderMinor: 0, serviceHours: "08:00-20:00", cutoff: "18:00", slotsPerDay: 4,
  } });
  await db.guestCheckoutSession.create({ data: {
    id: "orders-guest", tokenHash: "c".repeat(64), csrfHash: "d".repeat(64), expiresAt: new Date("2026-10-28T00:00:00Z")
  } });
  await db.order.create({ data: {
    id: "order-online-1", reference: "VG-ORD-1001", channel: "online", customerUserId: "orders-customer",
    customerName: "Akosua Mensah", customerPhone: "+233240001003", customerEmail: "orders-customer@example.test",
    fulfilment: "delivery", zoneId: "zone-accra-core", paymentMethod: "mobile_money", paymentStatus: "pending",
    fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned", subtotalMinor: 12000, deliveryFeeMinor: 1500,
    totalMinor: 13500, verificationKeyVersion: 1, verificationCodeHash: "a".repeat(64),
    createdAt: new Date("2026-10-27T00:00:00Z"),
    deliveryAddress: { create: { label: "Home", recipientName: "Akosua Mensah", phone: "+233240001003", locality: "Osu", street: "Oxford Street", landmark: "Near the mall", ghanaPostGps: "GA-123-4567" } },
    lines: { create: [
      { id: "line-online-1", variantId: "variant-rice-5kg", productId: "product-rice", productName: "Premium Rice", variantName: "5 kg", unit: "bag", quantity: "2", unitPriceMinor: 6000, lineTotalMinor: 12000 },
    ] },
    events: { create: [{ actorKind: "system", action: "Order placed", customerSafe: true, createdAt: new Date("2026-10-27T00:00:00Z") }] },
  } });
  await db.order.create({ data: {
    id: "order-pos-1", reference: "VG-ORD-1002", channel: "pos", guestSessionId: "orders-guest", customerName: "Walk-in Customer", customerPhone: "+233240009999",
    fulfilment: "collection", paymentMethod: "cash_counter", paymentStatus: "succeeded", fulfilmentStatus: "collected", deliveryStatus: "delivered",
    subtotalMinor: 4500, totalMinor: 4500, verificationKeyVersion: 1, verificationCodeHash: "b".repeat(64),
    createdAt: new Date("2026-10-27T00:05:00Z"),
    lines: { create: [{ id: "line-pos-1", variantId: "variant-milk-1l", productId: "product-milk", productName: "Fresh Milk", variantName: "1 litre", unit: "bottle", quantity: "1", unitPriceMinor: 4500, lineTotalMinor: 4500 }] },
  } });
});

after(async () => { await app?.close(); });

test("admin order list is protected and rejects non-admin staff", async () => {
  assert.equal((await request("/admin/orders")).response.status, 401);
  assert.equal((await request("/admin/orders", await login("orders-customer@example.test"))).response.status, 403);
  assert.equal((await request("/admin/orders", await login("orders-inventory@example.test"))).response.status, 403);
});

test("admin order list returns real rows with filters and search", async () => {
  const headers = await login("orders-admin@example.test");
  const all = await request("/admin/orders", headers);
  assert.equal(all.response.status, 200);
  assert.equal(all.body.ok, true);
  assert.deepEqual(all.body.data.map((row: { reference: string }) => row.reference), ["VG-ORD-1002", "VG-ORD-1001"]);
  assert.equal(all.body.data[0].lineCount, 1);
  assert.equal(all.body.data[0].totalLabel, "₵45.00");

  const online = await request("/admin/orders?channel=online", headers);
  assert.deepEqual(online.body.data.map((row: { reference: string }) => row.reference), ["VG-ORD-1001"]);
  const pending = await request("/admin/orders?payment=pending&status=awaiting_confirmation", headers);
  assert.deepEqual(pending.body.data.map((row: { reference: string }) => row.reference), ["VG-ORD-1001"]);
  const search = await request("/admin/orders?q=akosua", headers);
  assert.deepEqual(search.body.data.map((row: { reference: string }) => row.reference), ["VG-ORD-1001"]);
});

test("admin order detail projects persisted public and internal order state", async () => {
  const headers = await login("orders-admin@example.test");
  const found = await request("/admin/orders/order-online-1", headers);
  assert.equal(found.response.status, 200);
  assert.equal(found.body.data.order.reference, "VG-ORD-1001");
  assert.equal(found.body.data.order.lines[0].productName, "Premium Rice");
  assert.equal(found.body.data.internal.address.locality, "Osu");
  assert.equal(found.body.data.internal.zone.name, "Accra Core");
  assert.deepEqual(found.body.data.internal.reservations, []);
  assert.deepEqual(found.body.data.internal.refunds, []);
  assert.equal(JSON.stringify(found.body).includes("verificationCodeHash"), false);

  const missing = await request("/admin/orders/missing-order", headers);
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error.code, "NOT_FOUND");
});

test("production OpenAPI publishes both admin order read routes", () => {
  const document = productionOpenApi(app);
  assert.ok(document.paths["/api/v1/admin/orders"]?.get);
  assert.ok(document.paths["/api/v1/admin/orders/{orderId}"]?.get);
});
