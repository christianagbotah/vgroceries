import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

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

async function login() {
  const r = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: "admin-commerce@example.test", password: commerceTestPassword, client: "web" }),
  });
  assert.equal(r.status, 201);
  const body = await r.json();
  return {
    cookie: r.headers.get("set-cookie")!.split(";")[0],
    csrf: body.data.csrfToken as string,
  };
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
  await db.stockLot.update({ where: { id: "lot-salt" }, data: { quantity: "2" } });
});

after(async () => { await app?.close(); });

test("admin dashboard is a real authenticated production resource", async () => {
  const anonymous = await fetch(base + "/api/v1/admin/dashboard");
  assert.equal(anonymous.status, 401);

  const auth = await login();
  const response = await fetch(base + "/api/v1/admin/dashboard", { headers: { cookie: auth.cookie } });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.data.actionable.lowStock, "number");
  assert.equal(typeof payload.data.reports.paymentsReconciliation.exceptions, "number");
  assert.ok(Array.isArray(payload.data.recentOrders));
});

test("admin AI suggestions are live-data grounded and review state is durable", async () => {
  const auth = await login();
  const headers = { cookie: auth.cookie, origin, "x-csrf-token": auth.csrf, "content-type": "application/json" };

  const generated = await fetch(base + "/api/v1/admin/ai/generate", { method: "POST", headers, body: "{}" });
  assert.equal(generated.status, 200);
  const generatedBody = await generated.json();
  assert.ok(generatedBody.data.generated >= 1);

  const list = await fetch(base + "/api/v1/admin/ai/suggestions", { headers: { cookie: auth.cookie } });
  assert.equal(list.status, 200);
  const listBody = await list.json();
  const suggestion = listBody.data.find((item: { kind: string }) => item.kind === "replenishment");
  assert.ok(suggestion, "low stock should create a replenishment suggestion");
  assert.ok(suggestion.evidence.some((line: string) => /available/i.test(line)));
  assert.ok(suggestion.proposedAction);

  const catalogueGap = listBody.data.find((item: { title: string }) => /Yam/.test(item.title) && /catalogue/i.test(item.title));
  assert.ok(catalogueGap, "missing required Ghana meal ingredients should surface as catalogue-gap suggestions");
  assert.ok(catalogueGap.evidence.some((line: string) => /ampesi/i.test(line)));

  const review = await fetch(base + "/api/v1/admin/ai/review", {
    method: "POST", headers,
    body: JSON.stringify({ suggestionId: suggestion.id, decision: "reviewed" }),
  });
  assert.equal(review.status, 200);

  const reread = await fetch(base + "/api/v1/admin/ai/suggestions", { headers: { cookie: auth.cookie } });
  const rereadBody = await reread.json();
  assert.equal(rereadBody.data.find((item: { id: string }) => item.id === suggestion.id)?.status, "reviewed");
});

test("admin business questions answer from current authority data and OpenAPI exposes the resources", async () => {
  const auth = await login();
  const response = await fetch(base + "/api/v1/admin/ai/business-question", {
    method: "POST",
    headers: { cookie: auth.cookie, origin, "x-csrf-token": auth.csrf, "content-type": "application/json" },
    body: JSON.stringify({ question: "What stock needs attention?" }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.data.answer, /stock|variant|available/i);
  assert.ok(payload.data.evidence.length > 0);

  const document = await (await fetch(base + "/api/v1/openapi.json")).json();
  for (const path of [
    "/api/v1/admin/dashboard",
    "/api/v1/admin/ai/suggestions",
    "/api/v1/admin/ai/generate",
    "/api/v1/admin/ai/review",
    "/api/v1/admin/ai/business-question",
  ]) assert.ok(document.paths[path], `missing ${path}`);
});
