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
const fixtureSecret = "Verified-catalog-read-2026";

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
    throw Error("Catalog read tests require the foundation test database or an isolated vg_admin_core_test_* PostgreSQL schema");

  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);

  await db.$executeRawUnsafe('TRUNCATE "Category", "Product", "Variant", "Location", "User", "LoginThrottle", "StockReceipt" CASCADE');
  await db.user.createMany({ data: [
    { id: "catalog-admin", email: "catalog-admin@example.test", name: "Catalog Admin", phone: "+233240002001", passwordHash: fixtureHash(), role: "admin" },
    { id: "catalog-inventory", email: "catalog-inventory@example.test", name: "Inventory Manager", phone: "+233240002002", passwordHash: fixtureHash(), role: "inventory_manager" },
    { id: "catalog-customer", email: "catalog-customer@example.test", name: "Catalog Customer", phone: "+233240002003", passwordHash: fixtureHash(), role: "customer" },
  ] });
  await db.location.create({ data: { id: "loc_accra", name: "Accra Main", active: true } });
  await db.category.createMany({ data: [
    { id: "cat-rice", slug: "rice-grains", name: "Rice & Grains", description: "Staples", active: true, sortOrder: 1 },
    { id: "cat-drinks", slug: "drinks", name: "Drinks", description: "Beverages", active: true, sortOrder: 2 },
  ] });
  await db.product.create({ data: {
    id: "product-rice", slug: "premium-rice", name: "Premium Rice", categoryId: "cat-rice", description: "Long grain rice", shortDescription: "Premium long grain", image: "https://example.test/rice.jpg", tags: ["rice", "staple"], published: true,
    variants: { create: [
      { id: "variant-rice-5kg", sku: "RICE-5KG", name: "5 kg", unit: "bag", unitSize: "5 kg", priceMinor: 12000, compareAtPriceMinor: 13500, barcode: "1234567890123", active: true },
      { id: "variant-rice-10kg", sku: "RICE-10KG", name: "10 kg", unit: "bag", unitSize: "10 kg", priceMinor: 22000, active: false },
    ] },
  } });
  await db.product.create({ data: {
    id: "product-cola", slug: "cola", name: "Cola Drink", categoryId: "cat-drinks", description: "Soft drink", shortDescription: "Chilled cola", image: "https://example.test/cola.jpg", tags: ["drink"], published: false,
    variants: { create: [{ id: "variant-cola", sku: "COLA-500", name: "500 ml", unit: "bottle", unitSize: "500 ml", priceMinor: 900, active: true }] },
  } });
  await db.stockPosition.create({ data: { id: "pos-rice", variantId: "variant-rice-5kg", locationId: "loc_accra", safetyStock: "1" } });
  const receipt = await db.stockReceipt.create({ data: { id: "receipt-rice", receivedBy: "catalog-admin", note: "Initial stock" } });
  await db.stockLot.createMany({ data: [
    { id: "lot-rice-good", positionId: "pos-rice", receiptId: receipt.id, lotNumber: "RICE-GOOD", quantity: "10", expiryDate: new Date("2027-12-31"), quarantined: false, kind: "regular", unitCostMinor: 8000 },
    { id: "lot-rice-quarantine", positionId: "pos-rice", receiptId: receipt.id, lotNumber: "RICE-Q", quantity: "5", expiryDate: new Date("2027-12-31"), quarantined: true, kind: "regular", unitCostMinor: 8000 },
    { id: "lot-rice-expired", positionId: "pos-rice", receiptId: receipt.id, lotNumber: "RICE-OLD", quantity: "4", expiryDate: new Date("2025-01-01"), quarantined: false, kind: "regular", unitCostMinor: 7000 },
  ] });
  await db.stockMovement.create({ data: { id: "move-rice", lotId: "lot-rice-good", receiptId: receipt.id, delta: "10", resultingQty: "10", actorId: "catalog-admin", reason: "receive", createdAt: new Date("2026-10-27T01:00:00Z") } });
  await db.reservation.create({ data: { id: "reservation-rice", positionId: "pos-rice", lotId: "lot-rice-good", claimType: "order", claimId: "catalog-order", claimLineId: "catalog-line", quantity: "2", state: "active", expiresAt: new Date("2027-01-01T00:00:00Z") } });
});

after(async () => { await app?.close(); });

test("admin catalogue reads are protected and inventory managers may read them", async () => {
  assert.equal((await request("/admin/products")).response.status, 401);
  assert.equal((await request("/admin/products", await login("catalog-customer@example.test"))).response.status, 403);
  assert.equal((await request("/admin/products", await login("catalog-inventory@example.test"))).response.status, 200);
});

test("admin product list uses production availability and supports search", async () => {
  const headers = await login("catalog-admin@example.test");
  const all = await request("/admin/products", headers);
  assert.equal(all.response.status, 200);
  assert.equal(all.body.ok, true);
  assert.equal(all.body.data.length, 2);
  const rice = all.body.data.find((row: { id: string }) => row.id === "product-rice");
  assert.equal(rice.categoryName, "Rice & Grains");
  const rice5kg = rice.variants.find((row: { id: string }) => row.id === "variant-rice-5kg");
  const rice10kg = rice.variants.find((row: { id: string }) => row.id === "variant-rice-10kg");
  assert.equal(rice5kg.availableToSell, "7");
  assert.equal(rice5kg.safetyStock, "1");
  assert.equal(rice5kg.isAvailable, true);
  assert.equal(rice.anyAvailable, true);
  assert.equal(rice10kg.isActive, false);

  const search = await request("/admin/products?q=cola", headers);
  assert.deepEqual(search.body.data.map((row: { id: string }) => row.id), ["product-cola"]);
});

test("admin product detail exposes all lots, movements and authoritative availability", async () => {
  const headers = await login("catalog-admin@example.test");
  const found = await request("/admin/products/product-rice", headers);
  assert.equal(found.response.status, 200);
  assert.equal(found.body.data.name, "Premium Rice");
  const variant = found.body.data.variants.find((row: { id: string }) => row.id === "variant-rice-5kg");
  assert.deepEqual(variant.availability, { sellablePhysical: "10", reserved: "2", availableToSell: "7", isAvailable: true });
  assert.equal(found.body.data.lots.length, 3);
  assert.equal(found.body.data.lots.find((row: { id: string }) => row.id === "lot-rice-quarantine").isQuarantined, true);
  assert.equal(found.body.data.movements[0].id, "move-rice");
  assert.equal(found.body.data.movements[0].delta, "10");

  const missing = await request("/admin/products/not-a-product", headers);
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error.code, "NOT_FOUND");
});

test("admin categories report total products separately from currently purchasable products", async () => {
  const headers = await login("catalog-admin@example.test");
  const result = await request("/admin/categories", headers);
  assert.equal(result.response.status, 200);
  const rice = result.body.data.find((row: { id: string }) => row.id === "cat-rice");
  const drinks = result.body.data.find((row: { id: string }) => row.id === "cat-drinks");
  assert.equal(rice.productCount, 1);
  assert.equal(rice.availableCount, 1);
  assert.equal(drinks.productCount, 1);
  assert.equal(drinks.availableCount, 0);
});

test("production OpenAPI publishes admin product and category read routes", () => {
  const document = productionOpenApi(app);
  assert.ok(document.paths["/api/v1/admin/products"]?.get);
  assert.ok(document.paths["/api/v1/admin/products/{productId}"]?.get);
  assert.ok(document.paths["/api/v1/admin/categories"]?.get);
});
