import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";

let app: INestApplication;
let db: Database;
let base = "";
let mediaRoot = "";
const password = "Verified-media-password-2026";

function fixtureHash() {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$8$1$${salt}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
}

function config(root: string) {
  return readConfig({
    DATABASE_URL: process.env.DATABASE_URL!,
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc_accra",
    API_INSECURE_COOKIES: "true",
    PRODUCT_MEDIA_STORAGE: "filesystem",
    PRODUCT_MEDIA_FILESYSTEM_ROOT: root,
    PRODUCT_MEDIA_PUBLIC_BASE_URL: "http://media.example.test/products/",
  });
}

async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(base + "/api/v1" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

async function login(email: string) {
  const result = await request(
    "/auth/sessions",
    { email, password, client: "web" },
    { origin: "http://localhost:3000" },
  );
  assert.equal(result.response.status, 201);
  return {
    cookie: result.response.headers.get("set-cookie")!.split(";")[0],
    origin: "http://localhost:3000",
    "x-csrf-token": result.body.data.csrfToken,
  };
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Product draft tests require the isolated variety_foundation_test database");
  mediaRoot = await mkdtemp(join(tmpdir(), "vg-media-draft-"));
  app = await createApplication(config(mediaRoot));
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  await db.$executeRawUnsafe('TRUNCATE "User", "Category", "AuditEvent", "OutboxEvent", "LoginThrottle" CASCADE');
  for (const [email, role] of [
    ["admin-media@example.test", "admin"],
    ["inventory-media@example.test", "inventory_manager"],
    ["customer-media@example.test", "customer"],
  ] as const) {
    await db.user.create({ data: { id: email, email, name: email, passwordHash: fixtureHash(), role } });
  }
  await db.category.createMany({
    data: [
      { id: "cat-media", slug: "media", name: "Media" },
      { id: "cat-inactive-media", slug: "inactive-media", name: "Inactive", active: false },
    ],
  });
});

after(async () => {
  await app?.close();
  if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
});

test("admin creates an unpublished stable product draft and duplicate slug cannot overwrite it", async () => {
  const headers = await login("admin-media@example.test");
  const payload = {
    name: "Fresh Garden Tomatoes",
    slug: "fresh-garden-tomatoes",
    categoryId: "cat-media",
    shortDescription: "Fresh tomatoes for the catalogue.",
    tags: ["fresh", "produce"],
  };
  const created = await request("/admin/catalog/products", payload, headers);
  assert.equal(created.response.status, 201);
  assert.match(created.body.data.productId, /^[a-f0-9-]{36}$/);
  assert.equal(created.body.data.editorPath, `/admin/products/${created.body.data.productId}`);
  const product = await db.product.findUniqueOrThrow({ where: { id: created.body.data.productId } });
  assert.equal(product.published, false);
  assert.equal(product.image, "");
  assert.equal(product.brandMode, "auto");
  assert.equal(product.slug, payload.slug);
  assert.equal(product.categoryId, payload.categoryId);
  assert.equal(await db.auditEvent.count({ where: { action: "catalog.product.draft.created", entityId: product.id } }), 1);

  const duplicate = await request("/admin/catalog/products", payload, headers);
  assert.equal(duplicate.response.status, 409);
  assert.equal(await db.product.count({ where: { slug: payload.slug } }), 1);
});

test("draft creation is admin-only and validates strict input plus an active category", async () => {
  for (const email of ["inventory-media@example.test", "customer-media@example.test"]) {
    const denied = await request(
      "/admin/catalog/products",
      { name: "Denied", slug: `denied-${email.split("@")[0]}`, categoryId: "cat-media" },
      await login(email),
    );
    assert.equal(denied.response.status, 403);
  }
  const admin = await login("admin-media@example.test");
  const invalid = await request(
    "/admin/catalog/products",
    { name: "Bad", slug: "Bad Slug", categoryId: "cat-media", published: true },
    admin,
  );
  assert.equal(invalid.response.status, 400);
  const missing = await request(
    "/admin/catalog/products",
    { name: "Missing", slug: "missing-category", categoryId: "missing-category" },
    admin,
  );
  assert.equal(missing.response.status, 404);
  const inactive = await request(
    "/admin/catalog/products",
    { name: "Inactive", slug: "inactive-category-product", categoryId: "cat-inactive-media" },
    admin,
  );
  assert.equal(inactive.response.status, 404);
});
