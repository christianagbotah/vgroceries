import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { FakeImageGenerationProvider } from "../src/product-media/fake-image-generation.provider";
import { ImageGenerationProviderError } from "../src/product-media/image-generation.errors";
import type { GeneratedImageCandidate, ImageEditRequest, ImageGenerationProvider, ImageGenerationRequest } from "../src/product-media/image-generation.provider";
import { FilesystemProductMediaStorage } from "../src/product-media/filesystem-product-media.storage";
import { ProductMediaStorageError, type ProductMediaStorage, type PutProductMediaInput, type StoredProductMedia } from "../src/product-media/product-media.storage";
import { createProductMediaStorageKey } from "../src/product-media/storage-key";
import { validateAndNormalizeProductImage } from "../src/product-media/image-validation";

const workerPath = "../src/product-media/" + "generation-worker.service";
async function workerClass(): Promise<any> {
  try {
    const mod = await import(workerPath);
    assert.ok(mod?.GenerationWorkerService, "generation worker service must exist");
    return mod.GenerationWorkerService;
  } catch (error) {
    assert.fail(`generation worker service must exist: ${String(error)}`);
  }
}

let db: Database;
let mediaRoot = "";
let storage: FilesystemProductMediaStorage;
const productId = "worker-product";
const actorId = "worker-admin@example.test";

function config() {
  return readConfig({
    DATABASE_URL: process.env.DATABASE_URL!,
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc_accra",
    API_INSECURE_COOKIES: "true",
  });
}

async function resetStorage() {
  if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
  mediaRoot = await mkdtemp(join(tmpdir(), "vg-media-worker-"));
  storage = new FilesystemProductMediaStorage(mediaRoot, "http://media.example.test/products/");
}

async function seedJob(overrides: Record<string, unknown> = {}) {
  return db.imageGenerationJob.create({
    data: {
      productId,
      requestedBy: actorId,
      mode: "unbranded_generation",
      stylePreset: "clean_studio",
      status: "queued",
      provider: "fake",
      model: "gpt-image-2",
      prompt: "Realistic grocery photograph of fresh garden tomatoes. No invented branding.",
      requestSnapshot: {
        mode: "unbranded_generation",
        stylePreset: "clean_studio",
        backgroundIntent: "plain",
        candidateCount: 2,
        resolvedBrandMode: "unbranded",
      },
      candidateCount: 2,
      attemptCount: 0,
      ...overrides,
    },
  });
}

class ScriptedProvider implements ImageGenerationProvider {
  readonly id = "fake";
  calls = 0;
  constructor(private readonly steps: Array<"rate" | "safety" | "success">) {}
  private async run(request: ImageGenerationRequest): Promise<GeneratedImageCandidate[]> {
    const step = this.steps[Math.min(this.calls, this.steps.length - 1)] ?? "success";
    this.calls += 1;
    if (step === "rate") throw new ImageGenerationProviderError("rate_limited", "rate limited");
    if (step === "safety") throw new ImageGenerationProviderError("safety_rejected", "safety rejected");
    return new FakeImageGenerationProvider().generate(request);
  }
  generate(request: ImageGenerationRequest) { return this.run(request); }
  edit(request: ImageEditRequest) { return this.run(request); }
}

class TrackingStorage implements ProductMediaStorage {
  readonly puts: string[] = [];
  readonly deletes: string[] = [];
  constructor(
    private readonly inner: ProductMediaStorage,
    private readonly failPut = false,
  ) {}
  async put(input: PutProductMediaInput): Promise<StoredProductMedia> {
    if (this.failPut) throw new ProductMediaStorageError("STORAGE_UNAVAILABLE", "test storage unavailable");
    this.puts.push(input.key);
    return this.inner.put(input);
  }
  read(key: string) { return this.inner.read(key); }
  async delete(key: string) { this.deletes.push(key); await this.inner.delete(key); }
  exists(key: string) { return this.inner.exists(key); }
  publicUrl(key: string) { return this.inner.publicUrl(key); }
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Product media worker tests require the isolated variety_foundation_test database");
  db = new Database(config());
  await db.$connect();
});

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User", "Category", "Idempotency", "AuditEvent", "OutboxEvent", "LoginThrottle" CASCADE');
  await db.category.create({ data: { id: "worker-category", slug: "worker-category", name: "Worker Category" } });
  await db.product.create({
    data: {
      id: productId,
      slug: productId,
      name: "Garden Tomatoes",
      categoryId: "worker-category",
      description: "Fresh tomatoes for everyday cooking.",
      tags: ["fresh", "tomato"],
      brandMode: "unbranded",
    },
  });
  await resetStorage();
});

after(async () => {
  await db?.$disconnect();
  if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
});

test("two workers cannot claim the same queued job", async () => {
  const Worker = await workerClass();
  const job = await seedJob({ candidateCount: 1 });
  const a = new Worker(db, storage, new FakeImageGenerationProvider());
  const b = new Worker(db, storage, new FakeImageGenerationProvider());
  const claims = await Promise.all([a.claimNextJob(), b.claimNextJob()]);
  const claimed = claims.filter(Boolean);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, job.id);
  const durable = await db.imageGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(durable.status, "generating");
  assert.equal(durable.attemptCount, 1);
  assert.ok(durable.startedAt);
});

test("successful fake-provider generation persists private review candidates then marks the job succeeded", async () => {
  const Worker = await workerClass();
  const job = await seedJob({ candidateCount: 2 });
  const worker = new Worker(db, storage, new FakeImageGenerationProvider());
  assert.equal((await worker.claimNextJob()).id, job.id);
  await worker.processJob(job.id);
  const durable = await db.imageGenerationJob.findUniqueOrThrow({ where: { id: job.id }, include: { candidates: { orderBy: { createdAt: "asc" } } } });
  assert.equal(durable.status, "succeeded");
  assert.equal(durable.attemptCount, 1);
  assert.ok(durable.completedAt);
  assert.equal(durable.candidates.length, 2);
  for (const candidate of durable.candidates) {
    assert.equal(candidate.status, "ready_for_review");
    assert.equal(candidate.source, "ai_generated");
    assert.equal(candidate.generationJobId, job.id);
    assert.ok(candidate.storageKey.startsWith(`private/${productId}/`));
    assert.equal(await storage.exists(candidate.storageKey), true);
  }
  assert.equal(await db.auditEvent.count({ where: { action: "media.generation.completed", entityId: job.id } }), 1);
});

test("retryable provider failures requeue twice and succeed on the third claimed attempt", async () => {
  const Worker = await workerClass();
  const job = await seedJob({ candidateCount: 1 });
  const provider = new ScriptedProvider(["rate", "rate", "success"]);
  const worker = new Worker(db, storage, provider);
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.equal((await worker.claimNextJob()).id, job.id);
    await worker.processJob(job.id);
    const durable = await db.imageGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(durable.attemptCount, attempt);
    assert.equal(durable.status, attempt < 3 ? "queued" : "succeeded");
  }
  assert.equal(provider.calls, 3);
  assert.equal(await db.productMedia.count({ where: { generationJobId: job.id } }), 1);
});

test("terminal safety rejection fails once without persisting candidate media", async () => {
  const Worker = await workerClass();
  const job = await seedJob({ candidateCount: 1 });
  const worker = new Worker(db, storage, new ScriptedProvider(["safety"]));
  await worker.claimNextJob();
  await worker.processJob(job.id);
  const durable = await db.imageGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(durable.status, "failed");
  assert.equal(durable.attemptCount, 1);
  assert.equal(durable.errorCode, "safety_rejected");
  assert.ok(durable.completedAt);
  assert.equal(await db.productMedia.count({ where: { generationJobId: job.id } }), 0);
});

test("transient storage failure never creates partial media and becomes terminal after three attempts", async () => {
  const Worker = await workerClass();
  const job = await seedJob({ candidateCount: 1 });
  const failing = new TrackingStorage(storage, true);
  const worker = new Worker(db, failing, new FakeImageGenerationProvider());
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.equal((await worker.claimNextJob()).id, job.id);
    await worker.processJob(job.id);
    const durable = await db.imageGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(durable.attemptCount, attempt);
    assert.equal(durable.status, attempt < 3 ? "queued" : "failed");
  }
  assert.equal(await db.productMedia.count({ where: { generationJobId: job.id } }), 0);
});

test("database failure after storage writes compensates every unreferenced object", async () => {
  const Worker = await workerClass();
  const job = await seedJob({ candidateCount: 2 });
  const tracking = new TrackingStorage(storage);
  const worker = new Worker(db, tracking, new FakeImageGenerationProvider());
  await db.$executeRawUnsafe("CREATE FUNCTION test_reject_worker_media_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'worker media db fault'; END; $$");
  await db.$executeRawUnsafe('CREATE TRIGGER test_worker_media_failure BEFORE INSERT ON "ProductMedia" FOR EACH ROW EXECUTE FUNCTION test_reject_worker_media_insert()');
  try {
    await worker.claimNextJob();
    await worker.processJob(job.id);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER test_worker_media_failure ON "ProductMedia"');
    await db.$executeRawUnsafe("DROP FUNCTION test_reject_worker_media_insert()");
  }
  assert.ok(tracking.puts.length > 0);
  assert.deepEqual(new Set(tracking.deletes), new Set(tracking.puts));
  for (const key of tracking.puts) assert.equal(await storage.exists(key), false);
  assert.equal(await db.productMedia.count({ where: { generationJobId: job.id } }), 0);
  assert.equal((await db.imageGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).status, "failed");
});

test("processing an already-succeeded job after restart cannot duplicate candidates", async () => {
  const Worker = await workerClass();
  const job = await seedJob({ candidateCount: 2 });
  const worker = new Worker(db, storage, new FakeImageGenerationProvider());
  await worker.claimNextJob();
  await worker.processJob(job.id);
  const first = await db.productMedia.findMany({ where: { generationJobId: job.id }, orderBy: { id: "asc" } });
  assert.equal(first.length, 2);
  await worker.processJob(job.id);
  const second = await db.productMedia.findMany({ where: { generationJobId: job.id }, orderBy: { id: "asc" } });
  assert.deepEqual(second.map((row) => row.id), first.map((row) => row.id));
});

test("branded edit jobs read the owned reference image and create ai_edited candidates", async () => {
  const Worker = await workerClass();
  const referenceBytes = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 220, g: 180, b: 80 } } }).png().toBuffer();
  const normalized = await validateAndNormalizeProductImage(referenceBytes);
  const key = createProductMediaStorageKey(productId, normalized.sha256, "private");
  await storage.put({ key, bytes: normalized.bytes, contentType: normalized.mimeType, visibility: "private" });
  const reference = await db.productMedia.create({ data: {
    productId,
    source: "upload",
    status: "ready_for_review",
    storageKey: key,
    mimeType: normalized.mimeType,
    width: normalized.width,
    height: normalized.height,
    byteSize: normalized.byteSize,
    sha256: normalized.sha256,
    altText: "Genuine packshot",
    createdBy: actorId,
  } });
  await db.product.update({ where: { id: productId }, data: { brandMode: "branded" } });
  const job = await seedJob({
    mode: "branded_packshot_edit",
    referenceMediaId: reference.id,
    candidateCount: 1,
    requestSnapshot: { mode: "branded_packshot_edit", stylePreset: "clean_studio", backgroundIntent: "plain", candidateCount: 1, resolvedBrandMode: "branded", referenceMediaId: reference.id },
  });
  const worker = new Worker(db, storage, new FakeImageGenerationProvider());
  await worker.claimNextJob();
  await worker.processJob(job.id);
  const candidate = await db.productMedia.findFirstOrThrow({ where: { generationJobId: job.id } });
  assert.equal(candidate.source, "ai_edited");
  assert.equal((await db.imageGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).status, "succeeded");
});


test("media worker entry point is explicit, graceful-runner based, and package-script addressable", async () => {
  const path = "../src/" + "media-worker";
  let mod: any = null;
  try { mod = await import(path); } catch { /* RED until the entry point exists */ }
  assert.equal(typeof mod?.runMediaWorker, "function");
  const packageJson = JSON.parse(await (await import("node:fs/promises")).readFile(join(process.cwd(), "package.json"), "utf8"));
  assert.equal(packageJson.scripts?.["worker:media"], "node --env-file-if-exists=.env dist/src/media-worker.js");
});
