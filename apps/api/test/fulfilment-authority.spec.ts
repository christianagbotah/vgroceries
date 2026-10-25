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

const fulfilmentPaths = {
  queue: "/api/v1/admin/fulfilment",
  detail: "/api/v1/admin/fulfilment/orders/{orderId}",
  confirm: "/api/v1/admin/fulfilment/orders/{orderId}/confirm",
  startPicking: "/api/v1/admin/fulfilment/orders/{orderId}/start-picking",
  pick: "/api/v1/admin/fulfilment/orders/{orderId}/picks/{reservationId}",
  pack: "/api/v1/admin/fulfilment/orders/{orderId}/pack",
  handover: "/api/v1/admin/fulfilment/orders/{orderId}/handover",
} as const;

const bearerCookieSecurity = [{ cookieAuth: [] }, { bearerAuth: [] }];

function parameter(op: any, name: string) {
  return (op.parameters ?? []).find((p: any) => p.name === name);
}

function responseRef(op: any, code = "200") {
  return op.responses?.[code]?.content?.["application/json"]?.schema?.$ref;
}

function requestRef(op: any) {
  return op.requestBody?.content?.["application/json"]?.schema?.$ref;
}

function assertAdminMutation(op: any, requestSchema: string) {
  assert.deepEqual(op.security, bearerCookieSecurity);
  assert.ok(String(op.description).toLowerCase().includes("admin"));
  assert.ok(parameter(op, "orderId")?.required);
  assert.ok(parameter(op, "Idempotency-Key")?.required);
  assert.ok(parameter(op, "X-CSRF-Token"));
  assert.equal(requestRef(op), `#/components/schemas/${requestSchema}`);
  assert.equal(responseRef(op), "#/components/schemas/FulfilmentActionResponseEnvelope");
}

test("production OpenAPI exposes exactly seven Fulfilment Authority paths on an 93-path surface", () => {
  for (const path of Object.values(fulfilmentPaths)) assert.ok(document.paths[path], `missing ${path}`);
  assert.equal(Object.keys(document.paths).length, 93);

  assert.ok(document.paths[fulfilmentPaths.queue].get);
  assert.ok(document.paths[fulfilmentPaths.detail].get);
  assert.ok(document.paths[fulfilmentPaths.confirm].post);
  assert.ok(document.paths[fulfilmentPaths.startPicking].post);
  assert.ok(document.paths[fulfilmentPaths.pick].put);
  assert.ok(document.paths[fulfilmentPaths.pack].post);
  assert.ok(document.paths[fulfilmentPaths.handover].post);

  for (const absent of [
    "/api/v1/dispatch",
    "/api/v1/riders",
    "/api/v1/cod/remittances",
    "/api/v1/returns",
    "/api/v1/pos",
  ]) assert.equal(document.paths[absent], undefined, `unexpected authority route ${absent}`);
});

test("fulfilment queue and detail are administrator-authenticated and bounded", () => {
  const queue = document.paths[fulfilmentPaths.queue].get;
  assert.deepEqual(queue.security, bearerCookieSecurity);
  assert.ok(String(queue.description).toLowerCase().includes("admin"));
  for (const name of ["page", "perPage", "status"])
    assert.ok(parameter(queue, name), `missing fulfilment filter ${name}`);
  assert.equal(parameter(queue, "perPage").schema.maximum, 100);
  assert.equal(responseRef(queue), "#/components/schemas/FulfilmentQueueResponseEnvelope");

  const detail = document.paths[fulfilmentPaths.detail].get;
  assert.deepEqual(detail.security, bearerCookieSecurity);
  assert.ok(String(detail.description).toLowerCase().includes("admin"));
  assert.ok(parameter(detail, "orderId")?.required);
  assert.equal(responseRef(detail), "#/components/schemas/FulfilmentDetailResponseEnvelope");
});

test("fulfilment mutations document replay protection, strict schemas and PUT pick correction", () => {
  assertAdminMutation(document.paths[fulfilmentPaths.confirm].post, "FulfilmentConfirmRequest");
  assertAdminMutation(document.paths[fulfilmentPaths.startPicking].post, "FulfilmentStartPickingRequest");
  assertAdminMutation(document.paths[fulfilmentPaths.pack].post, "FulfilmentPackRequest");
  assertAdminMutation(document.paths[fulfilmentPaths.handover].post, "FulfilmentHandoverRequest");

  const pick = document.paths[fulfilmentPaths.pick].put;
  assertAdminMutation(pick, "FulfilmentPickRequest");
  assert.ok(parameter(pick, "reservationId")?.required);
  assert.equal(document.paths[fulfilmentPaths.pick].post, undefined);
});

test("fulfilment OpenAPI exposes operational data but no hidden stock, refund or payment authority", () => {
  const schemaText = JSON.stringify({
    paths: Object.fromEntries(Object.entries(document.paths).filter(([path]) => path.includes("/admin/fulfilment"))),
    schemas: Object.fromEntries(Object.entries(document.components.schemas).filter(([name]) => name.startsWith("Fulfilment"))),
  }).toLowerCase();

  for (const allowed of ["allowedactions", "blockingreasons", "lotnumber", "expirydate", "stockconsumedat"])
    assert.ok(schemaText.includes(allowed), `missing safe fulfilment field ${allowed}`);
  for (const forbidden of ["verificationcode", "verificationcodehash", "providerref", "rawbody", "refundexecution", "paymentattemptid"])
    assert.equal(schemaText.includes(forbidden), false, `forbidden fulfilment OpenAPI field ${forbidden}`);
});

test("source authority keeps stock, reservation, refund and payment mutation outside Fulfilment", () => {
  const fulfilmentDir = join(process.cwd(), "src/fulfilment");
  const source = readdirSync(fulfilmentDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(join(fulfilmentDir, name), "utf8"))
    .join("\n");

  for (const model of ["stockLot", "reservation", "refund", "refundExecution", "paymentAttempt"])
    assert.doesNotMatch(source, new RegExp(`\\.${model}\\.(?:create|update|updateMany|upsert|delete|deleteMany)\\s*\\(`));
});
