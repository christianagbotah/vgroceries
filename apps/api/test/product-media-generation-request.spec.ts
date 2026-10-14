import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";

let app: INestApplication;
let db: Database;
let base = "";
let mediaRoot = "";
const password = "Verified-generation-password-2026";

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
    AI_IMAGE_PROVIDER: "fake",
    AI_IMAGE_MODEL: "gpt-image-2",
    AI_IMAGE_MAX_CANDIDATES: "4",
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

function generation(overrides: Record<string, unknown> = {}) {
  return {
    mode: "unbranded_generation",
    stylePreset: "clean_studio",
    backgroundIntent: "plain",
    candidateCount: 2,
    operatorNote: "Clean catalogue staging.",
    ...overrides,
  };
}

function keyed(session: SessionHeaders, key: string) {
  return { ...session, "idempotency-key": key };
}

async function media(productId: string, id: string, status = "approved") {
  const sha = createHash("sha256").update(`${productId}:${id}`).digest("hex");
  return db.productMedia.create({
    data: {
      id,
      productId,
      source: "upload",
      status,
      storageKey: `${status === "approved" ? "public" : "private"}/${productId}/${sha}.webp`,
      publicUrl: status === "approved" ? `http://media.example.test/products/${productId}/${sha}.webp` : null,
      mimeType: "image/webp",
      width: 128,
      height: 128,
      byteSize: 100,
      sha256: sha,
      altText: `${productId} reference`,
      createdBy: "admin-generation@example.test",
      ...(status === "approved" ? { approvedBy: "admin-generation@example.test", approvedAt: new Date() } : {}),
    },
  });
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Generation request tests require the isolated variety_foundation_test database");
  mediaRoot = await mkdtemp(join(tmpdir(), "vg-media-generation-request-"));
  app = await createApplication(config(mediaRoot));
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  await db.$executeRawUnsafe('TRUNCATE "User", "Category", "Idempotency", "AuditEvent", "OutboxEvent", "LoginThrottle" CASCADE');
  for (const [email, role] of [
    ["admin-generation@example.test", "admin"],
    ["inventory-generation@example.test", "inventory_manager"],
    ["customer-generation@example.test", "customer"],
  ] as const) {
    await db.user.create({ data: { id: email, email, name: email, passwordHash: fixtureHash(), role } });
  }
  await db.category.create({ data: { id: "cat-generation", slug: "generation", name: "Generation" } });
  await db.product.createMany({
    data: [
      { id: "product-unbranded", slug: "product-unbranded", name: "Garden Tomatoes", categoryId: "cat-generation", shortDescription: "Fresh ripe tomatoes.", description: "Fresh tomatoes for everyday cooking.", tags: ["fresh", "tomato"], brandMode: "unbranded" },
      { id: "product-branded", slug: "product-branded", name: "Reference Cereal", categoryId: "cat-generation", shortDescription: "Packaged cereal reference.", description: "A branded packaged grocery item.", tags: ["cereal"], brandMode: "branded" },
      { id: "product-other", slug: "product-other", name: "Other Product", categoryId: "cat-generation", tags: [], brandMode: "branded" },
    ],
  });
  await media("product-branded", "media-branded-approved", "approved");
  await media("product-branded", "media-branded-pending", "ready_for_review");
  await media("product-other", "media-other-approved", "approved");
});

after(async () => {
  await app?.close();
  if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
});

test("admin and inventory staff can queue 1-4 candidates while customer and invalid counts are rejected", async () => {
  const admin = await login("admin-generation@example.test");
  const inventory = await login("inventory-generation@example.test");
  const customer = await login("customer-generation@example.test");

  const queued = await request(
    "/admin/catalog/products/product-unbranded/media/generations",
    generation({ candidateCount: 4 }),
    keyed(admin, "media-admin-0001"),
  );
  assert.equal(queued.response.status, 201);
  assert.equal(queued.body.data.status, "queued");
  assert.equal(queued.body.data.candidateCount, 4);
  assert.equal(queued.body.data.provider, "fake");
  assert.equal(queued.body.data.model, "gpt-image-2");
  assert.deepEqual(queued.body.data.candidateMediaIds, []);

  const inventoryQueued = await request(
    "/admin/catalog/products/product-unbranded/media/generations",
    generation({ candidateCount: 1, stylePreset: "fresh_market" }),
    keyed(inventory, "media-inventory-0001"),
  );
  assert.equal(inventoryQueued.response.status, 201);

  const denied = await request(
    "/admin/catalog/products/product-unbranded/media/generations",
    generation(),
    keyed(customer, "media-customer-0001"),
  );
  assert.equal(denied.response.status, 403);

  for (const [count, key] of [[0, "media-invalid-0000"], [5, "media-invalid-0005"]] as const) {
    const invalid = await request(
      "/admin/catalog/products/product-unbranded/media/generations",
      generation({ candidateCount: count }),
      keyed(admin, key),
    );
    assert.equal(invalid.response.status, 400);
  }
});

test("generation request replay is exact and changed input under the same key conflicts without duplicate jobs", async () => {
  const admin = await login("admin-generation@example.test");
  const headers = keyed(admin, "media-replay-0001");
  const payload = generation({ candidateCount: 2, backgroundIntent: "market_display" });
  const first = await request("/admin/catalog/products/product-unbranded/media/generations", payload, headers);
  assert.equal(first.response.status, 201);
  const replay = await request("/admin/catalog/products/product-unbranded/media/generations", payload, headers);
  assert.equal(replay.response.status, 201);
  assert.equal(replay.body.data.id, first.body.data.id);

  const conflict = await request(
    "/admin/catalog/products/product-unbranded/media/generations",
    { ...payload, backgroundIntent: "grocery_shelf" },
    headers,
  );
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(await db.imageGenerationJob.count({ where: { id: first.body.data.id } }), 1);
  assert.equal(await db.idempotency.count({ where: { actorId: "admin-generation@example.test", operation: "product_media_generation", key: "media-replay-0001" } }), 1);
  assert.equal(await db.auditEvent.count({ where: { action: "media.generation.requested", entityId: first.body.data.id } }), 1);
});

test("branded generation requires an approved reference owned by the same product", async () => {
  const admin = await login("admin-generation@example.test");
  const missing = await request(
    "/admin/catalog/products/product-branded/media/generations",
    generation({ mode: "branded_packshot_edit", candidateCount: 1 }),
    keyed(admin, "media-branded-missing"),
  );
  assert.equal(missing.response.status, 400);
  assert.equal(missing.body.error.code, "REFERENCE_IMAGE_REQUIRED");

  const foreign = await request(
    "/admin/catalog/products/product-branded/media/generations",
    generation({ mode: "branded_packshot_edit", candidateCount: 1, referenceMediaId: "media-other-approved" }),
    keyed(admin, "media-branded-foreign"),
  );
  assert.equal(foreign.response.status, 404);

  const privateUpload = await request(
    "/admin/catalog/products/product-branded/media/generations",
    generation({ mode: "branded_packshot_edit", candidateCount: 1, referenceMediaId: "media-branded-pending" }),
    keyed(admin, "media-branded-private-upload"),
  );
  assert.equal(privateUpload.response.status, 201);
  assert.equal(privateUpload.body.data.referenceMediaId, "media-branded-pending");

  const queued = await request(
    "/admin/catalog/products/product-branded/media/generations",
    generation({ mode: "branded_packshot_edit", candidateCount: 1, referenceMediaId: "media-branded-approved" }),
    keyed(admin, "media-branded-valid"),
  );
  assert.equal(queued.response.status, 201);
  assert.equal(queued.body.data.referenceMediaId, "media-branded-approved");
});

test("generation status is staff-only and exposes persisted candidates only after they exist", async () => {
  const admin = await login("admin-generation@example.test");
  const inventory = await login("inventory-generation@example.test");
  const customer = await login("customer-generation@example.test");
  const queued = await request(
    "/admin/catalog/products/product-unbranded/media/generations",
    generation({ candidateCount: 3 }),
    keyed(admin, "media-status-0001"),
  );
  assert.equal(queued.response.status, 201);
  const jobId = queued.body.data.id;
  for (const session of [admin, inventory]) {
    const read = await request(`/admin/catalog/media/generations/${jobId}`, undefined, session);
    assert.equal(read.response.status, 200);
    assert.equal(read.body.data.id, jobId);
    assert.deepEqual(read.body.data.candidateMediaIds, []);
  }
  const denied = await request(`/admin/catalog/media/generations/${jobId}`, undefined, customer);
  assert.equal(denied.response.status, 403);
  const missing = await request("/admin/catalog/media/generations/missing-job", undefined, admin);
  assert.equal(missing.response.status, 404);
});

test("queued job persists a server-built prompt and sanitized request snapshot without provider secrets", async () => {
  const inventory = await login("inventory-generation@example.test");
  const queued = await request(
    "/admin/catalog/products/product-unbranded/media/generations",
    generation({ stylePreset: "ghana_market", backgroundIntent: "market_display", operatorNote: "Display neatly for a Ghanaian grocery catalogue." }),
    keyed(inventory, "media-snapshot-0001"),
  );
  assert.equal(queued.response.status, 201);
  const row = await db.imageGenerationJob.findUniqueOrThrow({ where: { id: queued.body.data.id } });
  assert.match(row.prompt, /Garden Tomatoes/);
  assert.match(row.prompt, /Ghanaian grocery-market/i);
  const snapshot = JSON.stringify(row.requestSnapshot);
  assert.match(snapshot, /ghana_market/);
  assert.match(snapshot, /market_display/);
  assert.doesNotMatch(snapshot, /api.?key|authorization|bearer|secret/i);
  assert.equal(row.provider, "fake");
  assert.equal(row.model, "gpt-image-2");
});


test("production OpenAPI documents idempotent product-media generation and staff-only polling", async () => {
  const response = await fetch(base + "/api/v1/openapi.json");
  assert.equal(response.status, 200);
  const document = await response.json();
  const generationPath = "/api/v1/admin/catalog/products/{productId}/media/generations";
  const statusPath = "/api/v1/admin/catalog/media/generations/{jobId}";
  const security = [{ cookieAuth: [] }, { bearerAuth: [] }];

  const generate = document.paths[generationPath]?.post;
  assert.ok(generate, "generation request route must be documented");
  assert.deepEqual(generate.security, security);
  assert.ok(generate.parameters.some((parameter: any) => parameter.name === "Idempotency-Key" && parameter.in === "header" && parameter.required));
  assert.match(JSON.stringify(generate.requestBody), /CreateGenerationRequest/);
  assert.match(JSON.stringify(generate.responses["201"]), /ImageGenerationJobViewEnvelope/);

  const status = document.paths[statusPath]?.get;
  assert.ok(status, "generation status route must be documented");
  assert.deepEqual(status.security, security);
  assert.match(JSON.stringify(status.responses["200"]), /ImageGenerationJobViewEnvelope/);

  const text = JSON.stringify({ generate, status }).toLowerCase();
  assert.doesNotMatch(text, /openai_api_key|authorization.*schema|providerresponse|raw.*binary/);
});
