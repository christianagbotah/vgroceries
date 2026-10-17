import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";

let app: INestApplication;
let base = "";
let document: any;

before(async () => {
  app = await createApplication();
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  document = await (await fetch(base + "/api/v1/openapi.json")).json();
});
after(async () => { await app.close(); });

const refundPaths = [
  "/api/v1/refunds",
  "/api/v1/refunds/{refundId}/actions",
  "/api/v1/admin/orders/{orderId}/actions",
] as const;

const bearerCookieSecurity = [{ cookieAuth: [] }, { bearerAuth: [] }];

function parameter(op: any, name: string) {
  return (op.parameters ?? []).find((p: any) => p.name === name);
}

function requestSchemaText(op: any) {
  return JSON.stringify(op.requestBody ?? {}).toLowerCase();
}

function schemaReferences(value: unknown): string[] {
  const text = JSON.stringify(value);
  return [...text.matchAll(/#\/components\/schemas\/([A-Za-z0-9_]+)/g)].map((match) => match[1]);
}

function refundOpenApiSurface(): string {
  const paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) => path.includes("refund") || path.includes("admin/orders")),
  );
  const schemas: Record<string, unknown> = {};
  const pending = [...new Set(schemaReferences(paths))];
  const seen = new Set<string>();
  while (pending.length) {
    const name = pending.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const schema = document.components.schemas[name];
    if (!schema) continue;
    schemas[name] = schema;
    for (const reference of schemaReferences(schema)) if (!seen.has(reference)) pending.push(reference);
  }
  return JSON.stringify({ paths, schemas }).toLowerCase();
}

test("production OpenAPI exposes exactly the three Refunds Authority paths on a 82-path surface", () => {
  for (const path of refundPaths) assert.ok(document.paths[path], `missing ${path}`);
  assert.equal(Object.keys(document.paths).length, 82);
  for (const absent of [
    "/api/v1/refunds/manual",
    "/api/v1/refunds/cash",
    "/api/v1/refunds/providers/{provider}/events",
    "/api/v1/refunds/{refundId}/webhook",
  ]) assert.equal(document.paths[absent], undefined, `unexpected refund route ${absent}`);
});

test("refund ledger is administrator-authenticated, bounded and documents safe filters", () => {
  const op = document.paths["/api/v1/refunds"].get;
  assert.deepEqual(op.security, bearerCookieSecurity);
  assert.ok(String(op.description).toLowerCase().includes("admin"));
  for (const name of ["page", "perPage", "status", "provider", "method", "sourceType", "orderReference", "from", "to"])
    assert.ok(parameter(op, name), `missing refund filter ${name}`);
  assert.equal(parameter(op, "perPage").schema.maximum, 100);
  assert.ok(op.responses["200"]);
});

test("refund action is admin-only, replay protected and exposes no client financial authority", () => {
  const op = document.paths["/api/v1/refunds/{refundId}/actions"].post;
  assert.deepEqual(op.security, bearerCookieSecurity);
  assert.ok(String(op.description).toLowerCase().includes("admin"));
  assert.ok(parameter(op, "refundId")?.required);
  assert.ok(parameter(op, "Idempotency-Key")?.required);
  assert.ok(parameter(op, "X-CSRF-Token"));
  assert.ok(op.responses["200"]);
  const text = requestSchemaText(op);
  for (const allowed of ["approve", "execute", "retry", "reconcile"]) assert.ok(text.includes(allowed));
  for (const forbidden of ["amountminor", "currency", "providerreference", "merchantreference", "paymentattemptid", "manual_recording", "cash"])
    assert.equal(text.includes(forbidden), false, `client refund authority leaked: ${forbidden}`);
});

test("administrator order financial actions document only cancel-refund and server-derived excess correction", () => {
  const op = document.paths["/api/v1/admin/orders/{orderId}/actions"].post;
  assert.deepEqual(op.security, bearerCookieSecurity);
  assert.ok(String(op.description).toLowerCase().includes("admin"));
  assert.ok(parameter(op, "orderId")?.required);
  assert.ok(parameter(op, "Idempotency-Key")?.required);
  assert.ok(parameter(op, "X-CSRF-Token"));
  assert.ok(op.responses["200"]);
  const text = requestSchemaText(op);
  for (const allowed of ["cancel_refund", "refund_excess_capture", "reason"]) assert.ok(text.includes(allowed));
  for (const forbidden of ["amountminor", "currency", "provider", "paymentattemptid"])
    assert.equal(text.includes(forbidden), false, `client order-refund authority leaked: ${forbidden}`);
});

test("production refund OpenAPI contains no raw provider evidence, credentials or hidden execution authority", () => {
  const surface = refundOpenApiSurface();
  for (const forbidden of [
    '"merchantrefundreference"', '"originalpaymentmerchantreference"', '"originalpaymentproviderreference"',
    '"rawbody"', '"rawbodyhash"', '"safemetadata"', '"signature"', '"webhooksecret"', '"providersecret"',
  ]) assert.equal(surface.includes(forbidden), false, `forbidden Refunds OpenAPI field ${forbidden}`);
});

test("source authority keeps Refund persistence in Refunds and PaymentAttempt truth in Payments", () => {
  const ordersDir = join(process.cwd(), "src/orders");
  const orders = readdirSync(ordersDir).filter((x) => x.endsWith(".ts")).map((x) => readFileSync(join(ordersDir, x), "utf8")).join("\n");
  assert.doesNotMatch(orders, /\.refund\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/);
  assert.doesNotMatch(orders, /\.refundExecution\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/);

  const refundsDir = join(process.cwd(), "src/refunds");
  const refundFiles = readdirSync(refundsDir).filter((x) => x.endsWith(".ts"));
  const refunds = refundFiles.map((x) => readFileSync(join(refundsDir, x), "utf8")).join("\n");
  assert.doesNotMatch(refunds, /\.paymentAttempt\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/);
  assert.doesNotMatch(refunds, /class\s+FakeRefundProvider|hubtel|https?:\/\//i);
});
