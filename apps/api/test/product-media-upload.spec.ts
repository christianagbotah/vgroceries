import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import sharp from "sharp";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { validateAndNormalizeProductImage } from "../src/product-media/image-validation";
import { createProductMediaStorageKey } from "../src/product-media/storage-key";

let app: INestApplication;
let db: Database;
let base = "";
let mediaRoot = "";
const password = "Verified-media-password-2026";

type SessionHeaders = { cookie: string; origin: string; "x-csrf-token": string };

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

async function jsonRequest(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(base + "/api/v1" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

async function login(email: string): Promise<SessionHeaders> {
  const result = await jsonRequest(
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

async function upload(productId: string, session: SessionHeaders, bytes: Buffer, filename = "product.png", altText = "Product image") {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), filename);
  form.append("altText", altText);
  const response = await fetch(base + `/api/v1/admin/catalog/products/${productId}/media/uploads`, {
    method: "POST",
    headers: session,
    body: form,
  });
  const body = await response.json();
  return { response, body };
}

async function image(red: number, green: number, blue: number) {
  return sharp({ create: { width: 48, height: 32, channels: 3, background: { r: red, g: green, b: blue } } })
    .png()
    .toBuffer();
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Product upload tests require the isolated variety_foundation_test database");
  mediaRoot = await mkdtemp(join(tmpdir(), "vg-media-upload-"));
  app = await createApplication(config(mediaRoot));
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  await db.$executeRawUnsafe('TRUNCATE "User", "Category", "AuditEvent", "OutboxEvent", "LoginThrottle" CASCADE');
  for (const [email, role] of [
    ["admin-upload@example.test", "admin"],
    ["inventory-upload@example.test", "inventory_manager"],
    ["customer-upload@example.test", "customer"],
  ] as const) {
    await db.user.create({ data: { id: email, email, name: email, passwordHash: fixtureHash(), role } });
  }
  await db.category.create({ data: { id: "cat-upload", slug: "upload", name: "Upload" } });
  for (const id of ["media-product-a", "media-product-b"]) {
    await db.product.create({ data: { id, slug: id, name: id, categoryId: "cat-upload", tags: [] } });
  }
});

after(async () => {
  await app?.close();
  if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
});

test("admin and inventory staff upload normalized private candidates while customer and cross-product reads are denied", async () => {
  const admin = await login("admin-upload@example.test");
  const inventory = await login("inventory-upload@example.test");
  const customer = await login("customer-upload@example.test");

  const first = await upload("media-product-a", admin, await image(220, 30, 20), "tomatoes.png", "Fresh tomatoes");
  assert.equal(first.response.status, 201);
  assert.equal(first.body.data.productId, "media-product-a");
  assert.equal(first.body.data.source, "upload");
  assert.equal(first.body.data.status, "ready_for_review");
  assert.equal(first.body.data.mimeType, "image/webp");
  assert.equal(first.body.data.publicUrl, undefined);
  assert.match(first.body.data.previewUrl, new RegExp(`/api/v1/admin/catalog/media/${first.body.data.id}/content$`));

  const second = await upload("media-product-a", inventory, await image(20, 180, 40), "greens.png", "Fresh greens");
  assert.equal(second.response.status, 201);

  const denied = await upload("media-product-a", customer, await image(20, 40, 180));
  assert.equal(denied.response.status, 403);

  const own = await jsonRequest("/admin/catalog/products/media-product-a/media", undefined, admin);
  assert.equal(own.response.status, 200);
  assert.deepEqual(own.body.data.reviewCandidates.map((row: any) => row.id).sort(), [first.body.data.id, second.body.data.id].sort());
  const other = await jsonRequest("/admin/catalog/products/media-product-b/media", undefined, admin);
  assert.equal(other.response.status, 200);
  assert.equal(other.body.data.reviewCandidates.length, 0);
  const customerRead = await jsonRequest("/admin/catalog/products/media-product-a/media", undefined, customer);
  assert.equal(customerRead.response.status, 403);

  const content = await fetch(base + first.body.data.previewUrl, { headers: { cookie: admin.cookie, origin: admin.origin } });
  assert.equal(content.status, 200);
  assert.match(content.headers.get("content-type") ?? "", /^image\/webp/);
  assert.ok((await content.arrayBuffer()).byteLength > 0);

  const row = await db.productMedia.findUniqueOrThrow({ where: { id: first.body.data.id } });
  assert.match(row.storageKey, /^private\/media-product-a\//);
  assert.equal(row.publicUrl, null);
  assert.equal(await db.auditEvent.count({ where: { action: "media.uploaded", entityId: row.id } }), 1);
});

test("corrupt and oversized uploads leave no media row or stored object", async () => {
  const admin = await login("admin-upload@example.test");
  const before = await db.productMedia.count();
  const corrupt = await upload("media-product-a", admin, Buffer.from("not-an-image"), "fake.png");
  assert.equal(corrupt.response.status, 400);
  assert.equal(corrupt.body.error.code, "CORRUPT_IMAGE");
  assert.equal(await db.productMedia.count(), before);

  const oversized = await upload(
    "media-product-a",
    admin,
    Buffer.alloc(12 * 1024 * 1024 + 1, 0x41),
    "too-large.png",
  );
  assert.ok([400, 413].includes(oversized.response.status));
  assert.equal(await db.productMedia.count(), before);
});

test("database failure after storage put compensates the orphan when no row references the key", async () => {
  const admin = await login("admin-upload@example.test");
  const bytes = await image(111, 77, 222);
  const normalized = await validateAndNormalizeProductImage(bytes);
  const key = createProductMediaStorageKey("media-product-b", normalized.sha256, "private");
  const expectedPath = join(mediaRoot, ...key.split("/"));

  await db.$executeRawUnsafe("CREATE FUNCTION test_reject_product_media_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test media db fault'; END; $$");
  await db.$executeRawUnsafe('CREATE TRIGGER test_product_media_failure BEFORE INSERT ON "ProductMedia" FOR EACH ROW EXECUTE FUNCTION test_reject_product_media_insert()');
  try {
    const failed = await upload("media-product-b", admin, bytes, "compensate.png", "Compensation test");
    assert.equal(failed.response.status, 500);
    assert.equal(await db.productMedia.count({ where: { storageKey: key } }), 0);
    await assert.rejects(() => access(expectedPath));
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_product_media_failure ON "ProductMedia"');
    await db.$executeRawUnsafe("DROP FUNCTION IF EXISTS test_reject_product_media_insert()");
  }
});
