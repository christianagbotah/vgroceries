import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { codExceptionQuerySchema } from "@variety/contracts";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication, db: Database, base: string;
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1",
  ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

async function token(email: string) {
  const r = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email, password: commerceTestPassword, client: "native" }),
  });
  assert.equal(r.status, 201);
  return (await r.json()).data.accessToken as string;
}
async function get(path: string, credential?: string) {
  const response = await fetch(base + "/api/v1" + path, {
    headers: credential ? { authorization: `Bearer ${credential}` } : {},
  });
  return { status: response.status, body: await response.json() };
}
async function cod(ref: string, options: {amount?: number; paymentStatus?: string; deliveryStatus?: string; delivered?: boolean; cancelled?: boolean} = {}) {
  const order = await db.order.create({ data: {
    reference: ref, customerUserId: "customer-a", customerName: "Private Test Customer",
    customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required",
    paymentMethod: "cash_on_delivery", paymentStatus: options.paymentStatus ?? "unpaid",
    fulfilmentStatus: options.delivered ? "delivered" : "dispatched",
    deliveryStatus: options.deliveryStatus ?? (options.delivered ? "delivered" : "unassigned"),
    subtotalMinor: options.amount ?? 1100, deliveryFeeMinor: 0,
    totalMinor: options.amount ?? 1100, verificationKeyVersion: 1,
    verificationCodeHash: "4".repeat(64), stockConsumedAt: new Date(),
    ...(options.cancelled ? { cancelledAt: new Date() } : {}),
  } });
  // The database requires authoritative fulfilment dispatch handover
  // before any delivery job may exist. Never disable this provenance guard
  // for test fixtures, even when testing only read-only COD reporting.
  await db.fulfilmentRun.create({ data: {
    orderId: order.id, locationId: "loc_accra", handoverKind: "dispatch",
    handedOverBy: "admin-commerce", handedOverAt: new Date(),
  } });
  const job = options.delivered ? await db.deliveryJob.create({ data: {
    orderId: order.id, assignmentKind: "manual_provider", providerKey: "test-courier",
    status: "delivered", custodyState: "customer", assignedBy: "admin-commerce",
    assignedAt: new Date(), deliveredAt: new Date(),
  } }) : null;
  return { order, job };
}

before(async () => {
  app = await createApplication(config()); await app.listen(0, "127.0.0.1");
  base = await app.getUrl(); db = app.get(Database);
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => app?.close());

test("COD query contract bounds pagination, rejects extra selectors and accepts only explicit phases", () => {
  assert.deepEqual(codExceptionQuerySchema.parse({}), { page: 1, perPage: 25, phase: "all" });
  assert.equal(codExceptionQuerySchema.parse({page: "2", perPage: "100",phase: "delivered"}).page, 2);
  for (const bad of [{perPage: "101"}, {perPage: "0"}, {phase: "collected"}, {actorId: "admin"}, {page: "-1"}]) {
    assert.equal(codExceptionQuerySchema.safeParse(bad).success, false);
  }
});

test("COD exception inbox requires real administrator, never exposes customer PII, does not settle delivery proof as cash", async () => {
  const delivered = await cod("VG-COD-EXCEPTION-DELIVERED", {delivered: true,amount: 2200});
  const pending = await cod("VG-COD-EXCEPTION-PENDING", {amount: 1100});
  await cod("VG-COD-EXCEPTION-CANCELLED", {cancelled: true});
  const disputed = await cod("VG-COD-EXCEPTION-PAID-STATUS", {delivered: true,paymentStatus: "succeeded",amount: 400});

  assert.equal((await get("/admin/dispatch/cod-exceptions")).status, 401);
  const customer = await token("customer-a@example.test");
  assert.equal((await get("/admin/dispatch/cod-exceptions", customer)).status, 403);
  const admin = await token("admin-commerce@example.test");
  assert.equal((await get("/admin/dispatch/cod-exceptions?phase=forged", admin)).status, 400);
  assert.equal((await get("/admin/dispatch/cod-exceptions?perPage=101", admin)).status, 400);

  const earlier = await db.order.findUniqueOrThrow({ where: { id: delivered.order.id } });
  const result = await get("/admin/dispatch/cod-exceptions?page=1&perPage=25", admin);
  assert.equal(result.status, 200);
  const data = result.body.data;
  assert.equal(data.total, 3);
  assert.equal(data.totalOrderFaceValueMinor, 3700);
  assert.equal(data.evidenceStatus, "collection_and_remittance_not_yet_implemented");
  assert.equal(data.items.length, 3);
  const deliveredRow = data.items.find((i: {orderId:string}) => i.orderId === delivered.order.id);
  assert.equal(deliveredRow.exception, "delivered_collection_unverified");
  assert.equal(deliveredRow.collectionEvidence, "not_recorded_in_variety");
  assert.equal(deliveredRow.remittanceEvidence, "not_recorded_in_variety");
  assert.equal(deliveredRow.deliveryJobId, delivered.job!.id);
  assert.equal(data.items.find((i: {orderId:string}) => i.orderId === pending.order.id).exception, "delivery_incomplete");
  assert.equal(data.items.find((i: {orderId:string}) => i.orderId === disputed.order.id).exception, "payment_state_requires_review");
  const raw = JSON.stringify(data);
  for (const secret of ["Private Test Customer", "+233241111111", "passwordHash", "customerPhone", "customerName"])
    assert.equal(raw.includes(secret), false, `leaked private field ${secret}`);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: delivered.order.id } })).paymentStatus, earlier.paymentStatus);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: delivered.order.id } })).stockConsumedAt?.getTime(), earlier.stockConsumedAt?.getTime());
  const deliveredOnly = await get("/admin/dispatch/cod-exceptions?phase=delivered&perPage=1", admin);
  assert.equal(deliveredOnly.status, 200);
  assert.equal(deliveredOnly.body.data.total, 2);
  assert.equal(deliveredOnly.body.data.items.length, 1);
  const inTransit = await get("/admin/dispatch/cod-exceptions?phase=in_transit", admin);
  assert.equal(inTransit.status, 200);
  assert.equal(inTransit.body.data.total, 1);
  assert.equal(inTransit.body.data.items[0].orderId, pending.order.id);
});

test("COD OpenAPI exposes a secured read-only exception inbox without cash settlement endpoints", async () => {
  const response = await fetch(base + "/api/v1/openapi.json");
  assert.equal(response.status, 200);
  const doc = await response.json();
  const op = doc.paths["/api/v1/admin/dispatch/cod-exceptions"]?.get;
  assert.ok(op);
  assert.deepEqual(op.security, [{cookieAuth: []}, {bearerAuth: []}]);
  assert.equal(op.requestBody, undefined);
  assert.equal(op.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/CodExceptionInboxEnvelope");
  assert.equal(doc.paths["/api/v1/cod/remittances"], undefined);
  assert.equal(doc.paths["/api/v1/cod/collections"], undefined);
});
