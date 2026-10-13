import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let orderId = "";
let reservationId = "";

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

function models() {
  const client = db as Database & {
    fulfilmentRun?: any;
    fulfilmentPick?: any;
    stockDepletion?: any;
    stockDepletionLine?: any;
  };
  assert.ok(client.fulfilmentRun, "FulfilmentRun Prisma model is missing");
  assert.ok(client.fulfilmentPick, "FulfilmentPick Prisma model is missing");
  assert.ok(client.stockDepletion, "StockDepletion Prisma model is missing");
  assert.ok(client.stockDepletionLine, "StockDepletionLine Prisma model is missing");
  return {
    run: client.fulfilmentRun,
    pick: client.fulfilmentPick,
    depletion: client.stockDepletion,
    line: client.stockDepletionLine,
  };
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Fulfilment schema tests require an isolated *variety_foundation_test database");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  const order = await db.order.create({ data: {
    reference: "VG-FULFIL-SCHEMA", customerUserId: "customer-a", customerName: "Ama Customer",
    customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required",
    paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "awaiting_confirmation",
    deliveryStatus: "unassigned", subtotalMinor: 1990, deliveryFeeMinor: 1200, totalMinor: 3190,
    verificationKeyVersion: 1, verificationCodeHash: "f".repeat(64),
    lines: { create: [{ id: "fulfil-line-rice", variantId: "var-rice", productId: "product-rice", productName: "Fixture Rice", variantName: "Weighted rice", unit: "kg", quantity: "2", unitPriceMinor: 199, lineTotalMinor: 398 }] },
  } });
  orderId = order.id;
  reservationId = (await db.reservation.create({ data: {
    id: "fulfil-reservation-rice", positionId: "pos-rice", lotId: "lot-rice",
    claimType: "order", claimId: orderId, claimLineId: "fulfil-line-rice", generation: 1,
    quantity: "2", state: "active", expiresAt: new Date(Date.now() + 3600000),
  } })).id;
});
after(async () => { await app?.close(); });

test("fulfilment schema enforces one run per order and one pick per reservation", async () => {
  const { run, pick } = models();
  const created = await run.create({ data: { orderId, locationId: "loc_accra", confirmedBy: "admin-commerce", confirmedAt: new Date() } });
  assert.equal(created.version, 1);
  await assert.rejects(() => run.create({ data: { orderId, locationId: "loc_accra" } }));

  const pickData = {
    fulfilmentRunId: created.id, orderId, orderLineId: "fulfil-line-rice", reservationId,
    lotId: "lot-rice", variantId: "var-rice", quantity: "2", pickedQuantity: "2",
    state: "picked", recordedBy: "admin-commerce", recordedAt: new Date(),
  };
  const picked = await pick.create({ data: pickData });
  assert.equal(picked.state, "picked");
  await assert.rejects(() => pick.create({ data: { ...pickData, id: undefined } }));
  for (const bad of [
    { quantity: "0" }, { pickedQuantity: "-1" }, { pickedQuantity: "3" },
    { state: "invented" }, { version: 0 },
  ]) await assert.rejects(() => pick.create({ data: { ...pickData, reservationId: `${reservationId}-${Object.keys(bad)[0]}`, ...bad } }));
});

test("stock depletion identity is once-only and line arithmetic is constrained", async () => {
  const { depletion, line } = models();
  const row = await depletion.create({ data: {
    claimType: "order", claimId: orderId, locationId: "loc_accra", kind: "dispatch_handover",
    actorId: "admin-commerce", requestId: "req-fulfil-schema",
  } });
  await assert.rejects(() => depletion.create({ data: {
    claimType: "order", claimId: orderId, locationId: "loc_accra", kind: "dispatch_handover",
    actorId: "admin-commerce", requestId: "req-duplicate",
  } }));
  await assert.rejects(() => depletion.create({ data: {
    claimType: "order", claimId: `${orderId}-bad-kind`, locationId: "loc_accra", kind: "invented",
    actorId: "admin-commerce", requestId: "req-bad-kind",
  } }));

  const lineData = {
    depletionId: row.id, reservationId, claimLineId: "fulfil-line-rice", variantId: "var-rice", lotId: "lot-rice",
    quantity: "2", lotQuantityBefore: "20", lotQuantityAfter: "18",
  };
  const createdLine = await line.create({ data: lineData });
  assert.equal(createdLine.quantity.toString(), "2");
  await assert.rejects(() => line.create({ data: { ...lineData, id: undefined } }));
  for (const bad of [
    { quantity: "0" }, { lotQuantityBefore: "-1" }, { lotQuantityAfter: "-1" },
    { quantity: "3", lotQuantityBefore: "20", lotQuantityAfter: "18" },
  ]) await assert.rejects(() => line.create({ data: { ...lineData, reservationId: `${reservationId}-${Object.keys(bad)[0]}`, ...bad } }));

  await assert.rejects(() => depletion.update({ where: { id: row.id }, data: { kind: "collection_handover" } }));
  await assert.rejects(() => depletion.delete({ where: { id: row.id } }));
  await assert.rejects(() => line.update({ where: { id: createdLine.id }, data: { lotQuantityAfter: "17" } }));
  await assert.rejects(() => line.delete({ where: { id: createdLine.id } }));
});
