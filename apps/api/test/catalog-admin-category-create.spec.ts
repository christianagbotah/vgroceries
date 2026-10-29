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
const fixtureSecret = "Verified-category-create-2026";

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

async function createCategory(headers: Record<string, string>, body: Record<string, unknown>) {
  const response = await fetch(base + "/api/v1/admin/categories", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

before(async () => {
  const testUrl = new URL(process.env.DATABASE_URL!);
  const databaseName = testUrl.pathname.replace(/^\//, "");
  const isolatedSchema = testUrl.searchParams.get("schema")?.startsWith("vg_admin_core_test_") ?? false;
  if (databaseName !== "variety_foundation_test" && !isolatedSchema)
    throw Error("Category create tests require the foundation test database or an isolated vg_admin_core_test_* PostgreSQL schema");

  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);

  await db.$executeRawUnsafe('TRUNCATE "Category", "User", "LoginThrottle", "AuditEvent", "Location" CASCADE');
  await db.user.createMany({ data: [
    { id: "category-admin", email: "category-admin@example.test", name: "Category Admin", phone: "+233240003001", passwordHash: fixtureHash(), role: "admin" },
    { id: "category-inventory", email: "category-inventory@example.test", name: "Inventory Manager", phone: "+233240003002", passwordHash: fixtureHash(), role: "inventory_manager" },
  ] });
  await db.location.create({ data: { id: "loc_accra", name: "Accra Main", active: true } });
  await db.category.createMany({ data: [
    { id: "cat-existing-a", slug: "fresh-produce", name: "Fresh Produce", description: "Fresh food", active: true, sortOrder: 4 },
    { id: "cat-existing-b", slug: "household", name: "Household", description: "Home essentials", active: true, sortOrder: 7 },
  ] });
});

after(async () => { await app?.close(); });

test("category creation is authenticated, admin-only, validated, audited and uses the next sort order", async () => {
  const anonymous = await createCategory({}, { name: "Breakfast", slug: "breakfast", description: "Breakfast food", isActive: true });
  assert.equal(anonymous.response.status, 401);

  const inventory = await createCategory(await login("category-inventory@example.test"), { name: "Breakfast", slug: "breakfast", description: "Breakfast food", isActive: true });
  assert.equal(inventory.response.status, 403);

  const adminHeaders = await login("category-admin@example.test");
  const created = await createCategory(adminHeaders, { name: "Breakfast & Cereals", slug: "breakfast-cereals", description: "Breakfast staples and cereals.", isActive: true });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.ok, true);
  assert.ok(created.body.data.categoryId);

  const category = await db.category.findUnique({ where: { id: created.body.data.categoryId } });
  assert.equal(category?.name, "Breakfast & Cereals");
  assert.equal(category?.slug, "breakfast-cereals");
  assert.equal(category?.description, "Breakfast staples and cereals.");
  assert.equal(category?.active, true);
  assert.equal(category?.sortOrder, 8);

  const audit = await db.auditEvent.findFirst({ where: { entityId: created.body.data.categoryId, action: "catalog.category.created" } });
  assert.equal(audit?.actorId, "category-admin");

  const duplicate = await createCategory(adminHeaders, { name: "Duplicate", slug: "fresh-produce", description: "", isActive: true });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.error.code, "CATEGORY_SLUG_CONFLICT");

  const invalid = await createCategory(adminHeaders, { name: "Invalid", slug: "Bad Slug!", description: "", isActive: true });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, "VALIDATION_FAILED");
});

test("production OpenAPI publishes category creation on the existing admin categories resource", () => {
  const document = productionOpenApi(app);
  assert.ok(document.paths["/api/v1/admin/categories"]?.post);
});
