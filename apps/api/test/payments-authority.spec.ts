import { after, before, test } from "node:test";
import assert from "node:assert/strict";
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

const paymentPaths = [
  "/api/v1/orders/{orderId}/payment-attempts",
  "/api/v1/payments/providers/{provider}/events",
  "/api/v1/payments",
  "/api/v1/payments/{attemptId}/reconcile",
] as const;

test("production OpenAPI exposes exactly the four Payments Authority routes and no browser payment-outcome", () => {
  for (const path of paymentPaths) assert.ok(document.paths[path], `missing ${path}`);
  assert.equal(document.paths["/api/v1/orders/{orderId}/payment-outcome"], undefined);
  assert.equal(document.paths["/api/v1/payments/fake/events"], undefined);
  assert.equal(Object.keys(document.paths).length, 25);
});

test("payment initiation documents owner security, replay and CSRF without client money authority", () => {
  const op = document.paths["/api/v1/orders/{orderId}/payment-attempts"].post;
  assert.deepEqual(op.security, [{ cookieAuth: [] }, { bearerAuth: [] }, { guestAuth: [] }]);
  assert.ok(op.parameters.some((p: any) => p.name === "orderId" && p.in === "path" && p.required));
  assert.ok(op.parameters.some((p: any) => p.name === "Idempotency-Key" && p.in === "header" && p.required));
  assert.ok(op.parameters.some((p: any) => p.name === "X-CSRF-Token" && p.in === "header" && !p.required));
  assert.ok(String(op.description).toLowerCase().includes("server"));
  assert.equal(op.responses["201"] !== undefined, true);
  const requestText = JSON.stringify(op.requestBody ?? {}).toLowerCase();
  for (const forbidden of ["amountminor", "currency", "provider", "customerid", "pan", "cvv", "cardnumber"]) assert.equal(requestText.includes(forbidden), false);
});

test("provider event route is adapter-authenticated raw evidence, not customer-authenticated payment truth", () => {
  const op = document.paths["/api/v1/payments/providers/{provider}/events"].post;
  assert.deepEqual(op.security, []);
  assert.ok(op.parameters.some((p: any) => p.name === "provider" && p.in === "path" && p.required));
  const description = String(op.description).toLowerCase();
  assert.ok(description.includes("adapter"));
  assert.ok(description.includes("verif"));
  assert.ok(description.includes("raw"));
  assert.equal(op.responses["200"] !== undefined, true);
});

test("staff payment ledger and reconcile routes document admin-only application authorization", () => {
  const list = document.paths["/api/v1/payments"].get;
  const reconcile = document.paths["/api/v1/payments/{attemptId}/reconcile"].post;
  assert.deepEqual(list.security, [{ cookieAuth: [] }, { bearerAuth: [] }]);
  assert.deepEqual(reconcile.security, [{ cookieAuth: [] }, { bearerAuth: [] }]);
  assert.ok(String(list.description).toLowerCase().includes("admin"));
  assert.ok(String(reconcile.description).toLowerCase().includes("admin"));
  assert.ok(reconcile.parameters.some((p: any) => p.name === "attemptId" && p.in === "path" && p.required));
  for (const name of ["page", "perPage", "status", "settlementState", "provider", "method", "orderReference", "from", "to"])
    assert.ok(list.parameters.some((p: any) => p.name === name), `missing payment filter ${name}`);
});

test("production payment schemas contain no card secrets, provider credentials or raw webhook evidence", () => {
  const paymentSurface = JSON.stringify({
    paths: Object.fromEntries(Object.entries(document.paths).filter(([path]) => path.includes("payment"))),
    schemas: document.components.schemas,
  }).toLowerCase();
  for (const forbidden of [
    '"pan"', '"cvv"', '"cvc"', '"cardnumber"', '"card_number"',
    '"providersecret"', '"provider_secret"', '"webhooksecret"', '"signaturesecret"',
    '"rawbody"', '"rawbodyhash"', '"safemetadata"', '"merchantreference"',
  ]) assert.equal(paymentSurface.includes(forbidden), false, `forbidden OpenAPI field ${forbidden}`);
});
