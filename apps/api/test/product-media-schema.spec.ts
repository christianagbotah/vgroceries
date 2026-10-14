import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import type {
  AdminProductMediaView,
  CatalogMediaImage,
  CreateGenerationRequest,
  CreateProductDraftRequest,
  ImageGenerationJobView,
  ProductMediaView,
  ReorderGalleryRequest,
  SetFeaturedMediaRequest,
} from "@variety/contracts";
import {
  createGenerationRequestSchema,
  createProductDraftRequestSchema,
  reorderGalleryRequestSchema,
  setFeaturedMediaRequestSchema,
} from "@variety/contracts";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";

let app: INestApplication;
let db: Database;

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!,
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
});

function delegates() {
  const client = db as Database & {
    productMedia?: any;
    imageGenerationJob?: any;
  };
  assert.ok(client.productMedia, "ProductMedia Prisma model is missing");
  assert.ok(client.imageGenerationJob, "ImageGenerationJob Prisma model is missing");
  return {
    media: client.productMedia,
    job: client.imageGenerationJob,
  };
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) {
    throw Error("Product media schema tests require an isolated *variety_foundation_test database");
  }
  app = await createApplication(config());
  db = app.get(Database);
  await db.$executeRawUnsafe('TRUNCATE "Category", "Product" CASCADE');
  await db.category.create({ data: { id: "media-cat", slug: "media-cat", name: "Media" } });
  await db.product.create({
    data: {
      id: "media-product",
      slug: "media-product",
      name: "Media Product",
      categoryId: "media-cat",
      tags: ["media"],
    },
  });
});
after(async () => { await app?.close(); });

test("product media contracts export strict request vocabulary", () => {
  const draft: CreateProductDraftRequest = {
    name: "Fresh Tomatoes",
    slug: "fresh-tomatoes",
    categoryId: "media-cat",
    shortDescription: "Market fresh tomatoes",
  };
  const generation: CreateGenerationRequest = {
    mode: "unbranded_generation",
    stylePreset: "fresh_market",
    backgroundIntent: "market_display",
    candidateCount: 4,
    operatorNote: "Natural Ghana grocery merchandising",
  };
  const featured: SetFeaturedMediaRequest = { mediaId: "media-1" };
  const reorder: ReorderGalleryRequest = { orderedMediaIds: ["media-1", "media-2"] };
  const publicImage = {} as CatalogMediaImage;
  const mediaView = {} as ProductMediaView;
  const jobView = {} as ImageGenerationJobView;
  const adminView = {} as AdminProductMediaView;
  void [publicImage, mediaView, jobView, adminView];

  assert.deepEqual(createProductDraftRequestSchema.parse(draft), draft);
  assert.deepEqual(createGenerationRequestSchema.parse(generation), generation);
  assert.deepEqual(setFeaturedMediaRequestSchema.parse(featured), featured);
  assert.deepEqual(reorderGalleryRequestSchema.parse(reorder), reorder);

  for (const bad of [
    { ...generation, mode: "invent_brand" },
    { ...generation, stylePreset: "cartoon" },
    { ...generation, backgroundIntent: "moon" },
    { ...generation, candidateCount: 0 },
    { ...generation, candidateCount: 5 },
    { ...generation, operatorNote: "x".repeat(501) },
  ]) assert.equal(createGenerationRequestSchema.safeParse(bad).success, false);
});

test("product media schema persists provenance, review state and generation jobs", async () => {
  const { media, job } = delegates();
  const queued = await job.create({ data: {
    id: "media-job",
    productId: "media-product",
    requestedBy: "admin-1",
    mode: "unbranded_generation",
    stylePreset: "clean_studio",
    status: "queued",
    provider: "fake",
    model: "fake-image-v1",
    prompt: "trusted server prompt",
    requestSnapshot: { backgroundIntent: "plain" },
    candidateCount: 2,
  } });
  assert.equal(queued.attemptCount, 0);
  assert.equal(queued.candidateCount, 2);

  const candidate = await media.create({ data: {
    id: "media-candidate",
    productId: "media-product",
    source: "ai_generated",
    status: "ready_for_review",
    storageKey: "private/media-product/a.webp",
    mimeType: "image/webp",
    width: 1200,
    height: 1200,
    byteSize: 12345,
    sha256: "a".repeat(64),
    altText: "Fresh tomatoes",
    generationJobId: queued.id,
    createdBy: "admin-1",
  } });
  assert.equal(candidate.status, "ready_for_review");
  assert.equal(candidate.generationJobId, queued.id);

  await assert.rejects(() => media.create({ data: {
    ...candidate,
    id: "media-duplicate-key",
    generationJobId: null,
  } }));
  await assert.rejects(() => media.create({ data: {
    ...candidate,
    id: "media-bad-source",
    storageKey: "private/media-product/b.webp",
    source: "invented",
  } }));
  await assert.rejects(() => media.create({ data: {
    ...candidate,
    id: "media-bad-status",
    storageKey: "private/media-product/c.webp",
    status: "published_without_review",
  } }));
  await assert.rejects(() => job.create({ data: {
    id: "media-job-bad-count",
    productId: "media-product",
    requestedBy: "admin-1",
    mode: "unbranded_generation",
    stylePreset: "clean_studio",
    status: "queued",
    provider: "fake",
    model: "fake-image-v1",
    prompt: "prompt",
    requestSnapshot: {},
    candidateCount: 5,
  } }));
});

test("product owns brand mode and featured media relation while legacy image remains", async () => {
  const product = await db.product.findUniqueOrThrow({ where: { id: "media-product" } }) as typeof db.product extends never ? never : any;
  assert.equal(product.brandMode, "auto");
  assert.equal(product.featuredMediaId, null);
  assert.equal(product.image, "");
  await assert.rejects(() => db.product.update({
    where: { id: "media-product" },
    data: { brandMode: "invented" } as any,
  }));
});
