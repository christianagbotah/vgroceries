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

async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(base + "/api/v1" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : undefined };
}

async function login(email: string): Promise<SessionHeaders> {
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

async function image(r: number, g: number, b: number) {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r, g, b } } }).png().toBuffer();
}

async function upload(productId: string, session: SessionHeaders, bytes: Buffer, name: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), `${name}.png`);
  form.append("altText", name);
  const response = await fetch(base + `/api/v1/admin/catalog/products/${productId}/media/uploads`, {
    method: "POST",
    headers: session,
    body: form,
  });
  return { response, body: await response.json() };
}

async function createProduct(id: string) {
  return db.product.create({
    data: { id, slug: id, name: id, categoryId: "cat-lifecycle", tags: [] },
  });
}

async function uploaded(productId: string, session: SessionHeaders, rgb: [number, number, number], name: string) {
  const result = await upload(productId, session, await image(...rgb), name);
  assert.equal(result.response.status, 201);
  return result.body.data as { id: string; storageKey?: string };
}

async function approve(mediaId: string, session: SessionHeaders) {
  return request(`/admin/catalog/media/${mediaId}/approve`, {}, session);
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Product media lifecycle tests require the isolated variety_foundation_test database");
  mediaRoot = await mkdtemp(join(tmpdir(), "vg-media-lifecycle-"));
  app = await createApplication(config(mediaRoot));
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  await db.$executeRawUnsafe('TRUNCATE "User", "Category", "AuditEvent", "OutboxEvent", "LoginThrottle" CASCADE');
  for (const [email, role] of [
    ["admin-lifecycle@example.test", "admin"],
    ["inventory-lifecycle@example.test", "inventory_manager"],
    ["customer-lifecycle@example.test", "customer"],
  ] as const) {
    await db.user.create({ data: { id: email, email, name: email, passwordHash: fixtureHash(), role } });
  }
  await db.category.create({ data: { id: "cat-lifecycle", slug: "lifecycle", name: "Lifecycle" } });
});

after(async () => {
  await app?.close();
  if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
});

test("approval is admin-only and promotes private normalized media to immutable public storage", async () => {
  const admin = await login("admin-lifecycle@example.test");
  const inventory = await login("inventory-lifecycle@example.test");
  await createProduct("media-approve-product");
  const candidate = await uploaded("media-approve-product", admin, [220, 40, 30], "Approval tomato");
  const beforeRow = await db.productMedia.findUniqueOrThrow({ where: { id: candidate.id } });
  assert.match(beforeRow.storageKey, /^private\/media-approve-product\//);
  const privatePath = join(mediaRoot, ...beforeRow.storageKey.split("/"));
  await access(privatePath);

  const denied = await approve(candidate.id, inventory);
  assert.equal(denied.response.status, 403);

  const approved = await approve(candidate.id, admin);
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.data.status, "approved");
  assert.match(approved.body.data.publicUrl, /^http:\/\/media\.example\.test\/products\/media-approve-product\//);

  const row = await db.productMedia.findUniqueOrThrow({ where: { id: candidate.id } });
  assert.match(row.storageKey, /^public\/media-approve-product\//);
  assert.equal(row.status, "approved");
  assert.equal(row.approvedBy, "admin-lifecycle@example.test");
  assert.ok(row.approvedAt);
  await assert.rejects(() => access(privatePath));
  await access(join(mediaRoot, ...row.storageKey.split("/")));
  assert.equal(await db.auditEvent.count({ where: { action: "media.approved", entityId: row.id } }), 1);
});

test("featured and gallery changes accept only approved same-product media and keep contiguous unique ordering", async () => {
  const admin = await login("admin-lifecycle@example.test");
  await createProduct("media-gallery-product");
  await createProduct("media-gallery-other");
  const first = await uploaded("media-gallery-product", admin, [200, 20, 20], "Gallery first");
  const second = await uploaded("media-gallery-product", admin, [20, 200, 20], "Gallery second");
  const pending = await uploaded("media-gallery-product", admin, [20, 20, 200], "Gallery pending");
  const foreign = await uploaded("media-gallery-other", admin, [120, 80, 200], "Foreign media");
  for (const item of [first, second, foreign]) assert.equal((await approve(item.id, admin)).response.status, 200);

  const featured = await request(
    "/admin/catalog/products/media-gallery-product/media/featured",
    { mediaId: first.id },
    admin,
  );
  assert.equal(featured.response.status, 200);
  assert.equal(featured.body.data.featuredMedia.id, first.id);

  const unapproved = await request(
    "/admin/catalog/products/media-gallery-product/media/featured",
    { mediaId: pending.id },
    admin,
  );
  assert.equal(unapproved.response.status, 409);
  assert.equal(unapproved.body.error.code, "MEDIA_NOT_APPROVED");

  const crossProduct = await request(
    "/admin/catalog/products/media-gallery-product/media/featured",
    { mediaId: foreign.id },
    admin,
  );
  assert.equal(crossProduct.response.status, 404);

  const duplicate = await request(
    "/admin/catalog/products/media-gallery-product/media/reorder",
    { orderedMediaIds: [first.id, first.id] },
    admin,
  );
  assert.equal(duplicate.response.status, 400);

  const reordered = await request(
    "/admin/catalog/products/media-gallery-product/media/reorder",
    { orderedMediaIds: [second.id, first.id] },
    admin,
  );
  assert.equal(reordered.response.status, 200);
  assert.deepEqual(reordered.body.data.approvedGallery.map((row: any) => row.id), [second.id, first.id]);
  assert.equal(reordered.body.data.featuredMedia.id, first.id);
  assert.equal(reordered.body.data.approvedGallery.filter((row: any) => row.id === first.id).length, 1);
  const rows = await db.productMedia.findMany({ where: { id: { in: [first.id, second.id, pending.id] } } });
  assert.equal(rows.find((row) => row.id === second.id)!.galleryOrder, 0);
  assert.equal(rows.find((row) => row.id === first.id)!.galleryOrder, 1);
  assert.equal(rows.find((row) => row.id === pending.id)!.galleryOrder, null);
  assert.equal(await db.auditEvent.count({ where: { action: "media.featured.changed", entityId: "media-gallery-product" } }), 1);
  assert.equal(await db.auditEvent.count({ where: { action: "media.gallery.reordered", entityId: "media-gallery-product" } }), 1);
});

test("archiving featured media requires explicit replacement or removal and compacts gallery order", async () => {
  const admin = await login("admin-lifecycle@example.test");
  await createProduct("media-archive-product");
  const first = await uploaded("media-archive-product", admin, [230, 110, 20], "Archive first");
  const second = await uploaded("media-archive-product", admin, [20, 110, 230], "Archive second");
  for (const item of [first, second]) assert.equal((await approve(item.id, admin)).response.status, 200);
  assert.equal((await request("/admin/catalog/products/media-archive-product/media/reorder", { orderedMediaIds: [first.id, second.id] }, admin)).response.status, 200);
  assert.equal((await request("/admin/catalog/products/media-archive-product/media/featured", { mediaId: first.id }, admin)).response.status, 200);

  const refused = await request(`/admin/catalog/media/${first.id}/archive`, {}, admin);
  assert.equal(refused.response.status, 409);
  assert.equal(refused.body.error.code, "FEATURED_REPLACEMENT_REQUIRED");

  const replaced = await request(`/admin/catalog/media/${first.id}/archive`, { replacementFeaturedMediaId: second.id }, admin);
  assert.equal(replaced.response.status, 200);
  assert.equal(replaced.body.data.status, "archived");
  let product = await db.product.findUniqueOrThrow({ where: { id: "media-archive-product" } });
  assert.equal(product.featuredMediaId, second.id);
  let secondRow = await db.productMedia.findUniqueOrThrow({ where: { id: second.id } });
  assert.equal(secondRow.galleryOrder, 0);

  const removed = await request(`/admin/catalog/media/${second.id}/archive`, { replacementFeaturedMediaId: null }, admin);
  assert.equal(removed.response.status, 200);
  product = await db.product.findUniqueOrThrow({ where: { id: "media-archive-product" } });
  assert.equal(product.featuredMediaId, null);
  secondRow = await db.productMedia.findUniqueOrThrow({ where: { id: second.id } });
  assert.equal(secondRow.status, "archived");
  assert.equal(secondRow.galleryOrder, null);
  assert.equal(await db.auditEvent.count({ where: { action: "media.archived", entityId: { in: [first.id, second.id] } } }), 2);
});

test("reject and brand-mode override enforce administrator authority and audit truth", async () => {
  const admin = await login("admin-lifecycle@example.test");
  const inventory = await login("inventory-lifecycle@example.test");
  await createProduct("media-brand-product");
  const candidate = await uploaded("media-brand-product", inventory, [90, 130, 50], "Brand candidate");

  const deniedReject = await request(`/admin/catalog/media/${candidate.id}/reject`, {}, inventory);
  assert.equal(deniedReject.response.status, 403);
  const rejected = await request(`/admin/catalog/media/${candidate.id}/reject`, {}, admin);
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.body.data.status, "rejected");
  assert.ok(rejected.body.data.rejectedAt);
  const approveRejected = await approve(candidate.id, admin);
  assert.equal(approveRejected.response.status, 409);

  const deniedMode = await request(
    "/admin/catalog/products/media-brand-product/media/brand-mode",
    { brandMode: "branded" },
    inventory,
  );
  assert.equal(deniedMode.response.status, 403);
  const branded = await request(
    "/admin/catalog/products/media-brand-product/media/brand-mode",
    { brandMode: "branded" },
    admin,
  );
  assert.equal(branded.response.status, 200);
  assert.equal(branded.body.data.brandMode, "branded");
  assert.equal(branded.body.data.resolvedBrandMode, "branded");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: "media-brand-product" } })).brandMode, "branded");
  assert.equal(await db.auditEvent.count({ where: { action: "media.rejected", entityId: candidate.id } }), 1);
  assert.equal(await db.auditEvent.count({ where: { action: "product.brand_mode.overridden", entityId: "media-brand-product" } }), 1);
});

test("featured/archive races never leave an archived media row as the product featured image", async () => {
  const admin = await login("admin-lifecycle@example.test");
  await createProduct("media-race-product");
  const first = await uploaded("media-race-product", admin, [150, 30, 100], "Race first");
  const second = await uploaded("media-race-product", admin, [30, 150, 100], "Race second");
  for (const item of [first, second]) assert.equal((await approve(item.id, admin)).response.status, 200);
  assert.equal((await request("/admin/catalog/products/media-race-product/media/featured", { mediaId: first.id }, admin)).response.status, 200);

  const [archiveResult, featureResult] = await Promise.all([
    request(`/admin/catalog/media/${first.id}/archive`, { replacementFeaturedMediaId: second.id }, admin),
    request("/admin/catalog/products/media-race-product/media/featured", { mediaId: first.id }, admin),
  ]);
  assert.equal(archiveResult.response.status, 200);
  assert.ok([200, 409].includes(featureResult.response.status));
  const product = await db.product.findUniqueOrThrow({ where: { id: "media-race-product" } });
  const current = product.featuredMediaId
    ? await db.productMedia.findUniqueOrThrow({ where: { id: product.featuredMediaId } })
    : null;
  assert.ok(!current || (current.status === "approved" && current.archivedAt === null));
  assert.equal(product.featuredMediaId, second.id);
});


test("production OpenAPI documents the complete product-media lifecycle authority", async () => {
  const response = await fetch(base + "/api/v1/openapi.json");
  assert.equal(response.status, 200);
  const document = await response.json() as any;
  const paths = [
    "/api/v1/admin/catalog/media/{mediaId}/approve",
    "/api/v1/admin/catalog/media/{mediaId}/reject",
    "/api/v1/admin/catalog/media/{mediaId}/archive",
    "/api/v1/admin/catalog/products/{productId}/media/featured",
    "/api/v1/admin/catalog/products/{productId}/media/reorder",
    "/api/v1/admin/catalog/products/{productId}/media/brand-mode",
  ];
  assert.equal(Object.keys(document.paths).length, 82);
  for (const path of paths) {
    const operation = document.paths[path]?.post;
    assert.ok(operation, `missing ${path}`);
    assert.deepEqual(operation.security, [{ cookieAuth: [] }, { bearerAuth: [] }]);
    assert.ok(operation.responses["200"], `${path} must document its successful response`);
    assert.ok(operation.responses["401"] && operation.responses["403"] && operation.responses["409"]);
  }
  for (const path of [
    "/api/v1/admin/catalog/media/{mediaId}/archive",
    "/api/v1/admin/catalog/products/{productId}/media/featured",
    "/api/v1/admin/catalog/products/{productId}/media/reorder",
    "/api/v1/admin/catalog/products/{productId}/media/brand-mode",
  ]) assert.ok(document.paths[path].post.requestBody, `${path} must document its request body`);
});
