import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let base = "";
const origin = "http://localhost:3000";
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: origin,
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
  const products = [
    { id: "product-yam", slug: "yam", name: "Fresh Yam", variantId: "var-yam", sku: "YAM-1", priceMinor: 1800, tags: ["yam"] },
    { id: "product-kontomire", slug: "kontomire", name: "Fresh Kontomire", variantId: "var-kontomire", sku: "KONTO-1", priceMinor: 900, tags: ["kontomire", "cocoyam leaves"] },
    { id: "product-egg", slug: "eggs", name: "Fresh Eggs", variantId: "var-egg", sku: "EGG-1", priceMinor: 250, tags: ["egg", "eggs"] },
  ];
  for (const product of products) {
    await db.product.create({ data: {
      id: product.id, slug: product.slug, name: product.name, categoryId: "cat-commerce", published: true, tags: product.tags,
      variants: { create: { id: product.variantId, sku: product.sku, name: "Standard", unit: "piece", priceMinor: product.priceMinor } },
    } });
    await db.stockPosition.create({ data: {
      id: `pos-${product.variantId}`, variantId: product.variantId, locationId: "loc_accra", safetyStock: "0",
      lots: { create: { id: `lot-${product.variantId}`, lotNumber: product.sku, quantity: "20" } },
    } });
  }
  await db.product.create({ data: {
    id: "product-yam-hidden", slug: "hidden-yam", name: "Hidden Yam", categoryId: "cat-commerce", published: false, tags: ["yam"],
    variants: { create: { id: "var-yam-hidden", sku: "YAM-HIDDEN", name: "Hidden", unit: "piece", priceMinor: 1 } },
  } });
});

after(async () => { await app?.close(); });

test("meal planning resolves Ghana food language only to live catalogue stock and server prices", async () => {
  const response = await fetch(base + "/api/v1/ai/meal-plan", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ text: "yam ampesi with kontomire and nkosua for 2 people", language: "auto" }),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  const plan = payload.data;
  assert.equal(plan.servings, 2);
  assert.equal(plan.dishId, "yam_ampesi_kontomire");
  assert.ok(["twi", "mixed"].includes(plan.detectedLanguage));
  assert.ok(plan.lines.some((line: { productId: string }) => line.productId === "product-yam"));
  assert.ok(plan.lines.some((line: { productId: string }) => line.productId === "product-kontomire"));
  assert.ok(plan.lines.some((line: { productId: string }) => line.productId === "product-egg"));
  assert.ok(plan.lines.every((line: { productId: string }) => line.productId !== "product-yam-hidden"));
  assert.equal(
    plan.subtotalMinor,
    plan.lines.filter((line: { availableNow: boolean }) => line.availableNow)
      .reduce((sum: number, line: { lineTotalMinor: number }) => sum + line.lineTotalMinor, 0),
  );
});

test("OpenAPI documents the catalogue-grounded Ghana meal planner", async () => {
  const document = await (await fetch(base + "/api/v1/openapi.json")).json();
  const operation = document.paths["/api/v1/ai/meal-plan"]?.post;
  assert.ok(operation);
  assert.deepEqual(operation.security ?? [], []);
  assert.equal(operation.requestBody.content["application/json"].schema.$ref, "#/components/schemas/GhanaMealPlanRequest");
  assert.equal(operation.responses["201"].content["application/json"].schema.$ref, "#/components/schemas/GhanaMealPlanResponseEnvelope");
});
