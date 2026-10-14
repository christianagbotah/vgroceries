import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";

let app: INestApplication;
let db: Database;
let base = "";

function config() {
  return readConfig({
    DATABASE_URL: process.env.DATABASE_URL!,
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc_accra",
    API_INSECURE_COOKIES: "true",
    PRODUCT_MEDIA_STORAGE: "filesystem",
    PRODUCT_MEDIA_FILESYSTEM_ROOT: "/tmp/vg-catalog-approved-media",
    PRODUCT_MEDIA_PUBLIC_BASE_URL: "https://media.example.test/products/",
  });
}

async function get(path: string) {
  const response = await fetch(base + "/api/v1" + path);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : undefined };
}

async function createProduct(input: { id: string; slug: string; image: string }) {
  await db.product.create({
    data: {
      id: input.id,
      slug: input.slug,
      name: input.id,
      categoryId: "cat-public-media",
      shortDescription: `${input.id} short`,
      description: `${input.id} description`,
      image: input.image,
      tags: [],
      published: true,
      variants: {
        create: {
          id: `var-${input.id}`,
          sku: `sku-${input.id}`,
          name: "Each",
          unit: "each",
          unitSize: "1",
          priceMinor: 1299,
          active: true,
        },
      },
    },
  });
}

async function media(input: {
  id: string;
  productId: string;
  status: string;
  url?: string;
  order?: number;
}) {
  return db.productMedia.create({
    data: {
      id: input.id,
      productId: input.productId,
      source: "upload",
      status: input.status,
      storageKey: `${input.status}/${input.productId}/${input.id}.webp`,
      publicUrl: input.url ?? null,
      mimeType: "image/webp",
      width: 1200,
      height: 1200,
      byteSize: 2048,
      sha256: `${input.id}-sha256`,
      altText: `${input.id} alt`,
      galleryOrder: input.order ?? null,
      createdBy: "catalog-media-test",
      ...(input.status === "approved"
        ? { approvedBy: "catalog-media-test", approvedAt: new Date() }
        : {}),
      ...(input.status === "rejected" ? { rejectedAt: new Date() } : {}),
      ...(input.status === "archived" ? { archivedAt: new Date() } : {}),
    },
  });
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Approved catalogue media tests require the isolated variety_foundation_test database");
  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  await db.$executeRawUnsafe('TRUNCATE "Category", "ProductMedia", "ImageGenerationJob" CASCADE');
  await db.category.create({ data: { id: "cat-public-media", slug: "public-media", name: "Public media" } });
});

after(async () => {
  await app?.close();
});

test("public catalogue exposes approved media in gallery order and never leaks review-state rows", async () => {
  await createProduct({ id: "prd-approved-media", slug: "approved-media", image: "https://legacy.example.test/old.webp" });
  const featured = await media({
    id: "media-featured",
    productId: "prd-approved-media",
    status: "approved",
    url: "https://media.example.test/products/featured.webp",
    order: 1,
  });
  await media({
    id: "media-gallery-two",
    productId: "prd-approved-media",
    status: "approved",
    url: "https://media.example.test/products/gallery-two.webp",
    order: 2,
  });
  await media({ id: "media-draft", productId: "prd-approved-media", status: "draft", order: 0 });
  await media({ id: "media-review", productId: "prd-approved-media", status: "ready_for_review", order: 0 });
  await media({ id: "media-rejected", productId: "prd-approved-media", status: "rejected", order: 0 });
  await media({ id: "media-archived", productId: "prd-approved-media", status: "archived", url: "https://media.example.test/products/archived.webp", order: 0 });
  await db.product.update({ where: { id: "prd-approved-media" }, data: { featuredMediaId: featured.id } });

  const result = await get("/catalog/products/approved-media");
  assert.equal(result.response.status, 200);
  const product = result.body.data.product;

  assert.equal(product.image, "https://media.example.test/products/featured.webp");
  assert.deepEqual(product.featuredImage, {
    id: "media-featured",
    url: "https://media.example.test/products/featured.webp",
    altText: "media-featured alt",
    width: 1200,
    height: 1200,
  });
  assert.deepEqual(product.gallery.map((item: { id: string }) => item.id), ["media-featured", "media-gallery-two"]);
  assert.equal(product.gallery.filter((item: { id: string }) => item.id === "media-featured").length, 1);
  assert.equal(JSON.stringify(product).includes("media-draft"), false);
  assert.equal(JSON.stringify(product).includes("media-review"), false);
  assert.equal(JSON.stringify(product).includes("media-rejected"), false);
  assert.equal(JSON.stringify(product).includes("media-archived"), false);
  assert.equal("status" in product.gallery[0], false);
  assert.equal("source" in product.gallery[0], false);
  assert.equal("storageKey" in product.gallery[0], false);
});

test("public catalogue keeps the legacy product image when no approved media exists", async () => {
  await createProduct({ id: "prd-legacy-media", slug: "legacy-media", image: "https://legacy.example.test/fallback.webp" });
  await media({ id: "legacy-pending", productId: "prd-legacy-media", status: "ready_for_review" });

  const result = await get("/catalog/products/legacy-media");
  assert.equal(result.response.status, 200);
  const product = result.body.data.product;
  assert.equal(product.image, "https://legacy.example.test/fallback.webp");
  assert.equal(product.featuredImage, undefined);
  assert.deepEqual(product.gallery, []);
});
