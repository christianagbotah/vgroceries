import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { AllocationService } from "../src/inventory/allocation.service";
import { readConfig } from "../src/config";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let second: INestApplication;
let db: Database;
let allocation: AllocationService;
let allocation2: AllocationService;

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

beforeEach(async () => {
  if (!app) {
    app = await createApplication(config()); second = await createApplication(config());
    db = app.get(Database); allocation = app.get(AllocationService); allocation2 = second.get(AllocationService);
  }
  await seedCommerceFixtures(db);
});
after(async () => { await second?.close(); await app?.close(); });

const line = (claimLineId: string, variantId = "var-salt", quantity = "1") => ({ claimLineId, variantId, quantity });
const input = (claimId: string, expiresAt: Date, lines = [line(`${claimId}-line`)]) => ({
  claimType: "order" as const, claimId, locationId: "loc_accra", expiresAt,
  actorId: "system:payments", requestId: `req-${claimId}`, lines,
});

test("fully covered claim extends but never shortens generation 1", async () => {
  const firstExpiry = new Date(Date.now() + 120_000);
  await db.$transaction((tx) => allocation.create(tx, input("covered", firstExpiry)));
  const later = new Date(Date.now() + 600_000);
  const result = await db.$transaction((tx) => allocation.ensureClaimCoverage(tx, input("covered", later)));
  assert.equal(result.generation, 1); assert.equal(result.reused, true);
  const rows = await db.reservation.findMany({ where: { claimId: "covered", state: "active" } });
  assert.ok(rows.every((r) => r.expiresAt.getTime() === later.getTime()));
  const earlier = new Date(Date.now() + 180_000);
  await db.$transaction((tx) => allocation.ensureClaimCoverage(tx, input("covered", earlier)));
  const after = await db.reservation.findMany({ where: { claimId: "covered", state: "active" } });
  assert.ok(after.every((r) => r.expiresAt.getTime() === later.getTime()));
});

test("expired or released generation can reacquire the same lot as generation 2", async () => {
  const short = new Date(Date.now() + 60_000);
  await db.$transaction((tx) => allocation.create(tx, input("reacquire", short)));
  await db.reservation.updateMany({ where: { claimId: "reacquire" }, data: { state: "expired" } });
  const result = await db.$transaction((tx) => allocation.ensureClaimCoverage(tx, input("reacquire", new Date(Date.now() + 600_000))));
  assert.equal(result.generation, 2); assert.equal(result.reused, false);
  const rows = await db.reservation.findMany({ where: { claimId: "reacquire" }, orderBy: { generation: "asc" } });
  assert.deepEqual([...new Set(rows.map((r) => r.generation))], [1, 2]);
  assert.equal(rows.filter((r) => r.generation === 2 && r.state === "active").length, 1);
});

test("partial active generation is refused rather than mixed with a new generation", async () => {
  const expiry = new Date(Date.now() + 600_000);
  await db.$transaction((tx) => allocation.create(tx, input("partial", expiry, [line("partial-a", "var-salt", "1")])));
  await assert.rejects(() => db.$transaction((tx) => allocation.ensureClaimCoverage(tx, input("partial", expiry, [line("partial-a", "var-salt", "1"), line("partial-b", "var-rice", "1")]))));
  assert.equal(await db.reservation.count({ where: { claimId: "partial", generation: 2 } }), 0);
});

test("failed reacquisition creates no partial new generation", async () => {
  const expiry = new Date(Date.now() + 600_000);
  await db.reservation.create({ data: {
    id: "history-failed", positionId: "pos-salt", lotId: "lot-salt", claimType: "order",
    claimId: "no-stock", claimLineId: "no-stock-line", generation: 1, quantity: "1", state: "released", expiresAt: expiry,
  } });
  await db.stockLot.update({ where: { id: "lot-salt" }, data: { quantity: "0" } });
  await assert.rejects(() => db.$transaction((tx) => allocation.ensureClaimCoverage(tx, input("no-stock", expiry, [line("no-stock-line", "var-salt", "1")]))));
  assert.equal(await db.reservation.count({ where: { claimId: "no-stock", generation: 2 } }), 0);
});

test("two paid claims competing for the final unit produce at most one coverage success", async () => {
  await db.stockLot.update({ where: { id: "lot-salt" }, data: { quantity: "1" } });
  const expiry = new Date(Date.now() + 600_000);
  const outcomes = await Promise.allSettled([
    db.$transaction((tx) => allocation.ensureClaimCoverage(tx, input("race-a", expiry))),
    second.get(Database).$transaction((tx) => allocation2.ensureClaimCoverage(tx, input("race-b", expiry))),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await db.reservation.count({ where: { state: "active", claimId: { in: ["race-a", "race-b"] } } }), 1);
});
