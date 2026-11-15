import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { hashPassword } from "../src/identity/crypto";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

const origin = "http://localhost:3000";
let app: INestApplication, db: Database, base = "";
let seq = 0;
const payload = (delta = "-2") => ({
  lotId: "lot-rice", variantId: "var-rice",
  delta, reason: "Verified physical stock count discrepancy",
  locationId: "loc_accra",
});
const config = (on: boolean) => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!,
  WEB_ORIGINS: origin,
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
  STOCK_ADJUSTMENTS_ENABLED: on ? "true" : "false",
});

async function login(id: string) {
  const resp = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: id + "@example.test",
      password: commerceTestPassword, client: "native" }),
  });
  assert.equal(resp.status, 201, "Login must be real authenticated HTTP");
  return (await resp.json()).data.accessToken as string;
}
async function invoke(path: string, method: "GET" | "POST",
  bearer: string | null, body?: unknown, key?: string, server = base) {
  const resp = await fetch(server + "/api/v1" + path, {
    method,
    headers: {
      ...(bearer ? { authorization: "Bearer " + bearer } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: resp.status, body: await resp.json() };
}
async function quantity() {
  return (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } }))
    .quantity.toString();
}
before(async () => {
  if (new URL(process.env.DATABASE_URL!).pathname !== "/variety_foundation_test")
    throw Error("Stock adjustment HTTP tests must only run in disposable foundation DB");
  app = await createApplication(config(true));
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
});
beforeEach(async () => {
  seq++;
  await seedCommerceFixtures(db);
  const hashed = await hashPassword(commerceTestPassword);
  await db.user.createMany({ data: [
    { id: "stockmanager", email: "stockmanager@example.test",
      name: "Stock Manager", passwordHash: hashed, role: "inventory_manager" },
    { id: "admin-secondary", email: "admin-secondary@example.test",
      name: "Independent Approver", passwordHash: hashed, role: "admin" },
    { id: "cashier-adjustment", email: "cashier-adjustment@example.test",
      name: "Cashier", passwordHash: hashed, role: "cashier" },
  ] });
  await db.userLocation.create({ data: {
    userId: "stockmanager", locationId: "loc_accra",
  } });
});
after(async () => { await app?.close(); });

test("maker creates pending correction; checker applies once with audit, movement and outbox", async () => {
  const maker = await login("stockmanager");
  const checker = await login("admin-secondary");
  const key = "adj-request-unique-" + seq;
  const initial = await quantity();
  const issued = await invoke("/inventory/adjustments/create", "POST",
    maker, payload(), key);
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  assert.equal(issued.body.data.status, "pending_approval");
  assert.equal(await quantity(), initial, "Request must not change stock");
  assert.equal(await db.stockMovement.count(), 0);
  const adjustmentId: string = issued.body.data.adjustmentId;
  assert.equal((await invoke("/inventory/adjustments/decide", "POST", maker,
    { adjustmentId, decision: "approve" })).status, 403);
  const approved = await invoke("/inventory/adjustments/decide", "POST",
    checker, { adjustmentId, decision: "approve" });
  assert.equal(approved.status, 201, JSON.stringify(approved.body));
  assert.equal(approved.body.data.status, "approved");
  assert.equal(await quantity(), "18");
  assert.equal(await db.stockMovement.count({
    where: { lotId: "lot-rice", reason: "adjustment" },
  }), 1);
  assert.equal(await db.auditEvent.count({
    where: { action: "inventory.adjustment_approved", entityId: adjustmentId },
  }), 1);
  assert.equal(await db.outboxEvent.count({
    where: { type: "inventory.adjusted", aggregateId: adjustmentId },
  }), 1);
  const replay = await invoke("/inventory/adjustments/create", "POST",
    maker, payload(), key);
  assert.equal(replay.status, 201);
  assert.equal(replay.body.data.adjustmentId, adjustmentId);
  assert.equal(replay.body.data.status, "approved",
    "Idempotent request must return current terminal status");
  assert.equal((await invoke("/inventory/adjustments/decide", "POST",
    checker, { adjustmentId, decision: "approve" })).body.data.replayed, true);
  assert.equal(await db.stockMovement.count({
    where: { lotId: "lot-rice", reason: "adjustment" },
  }), 1);
  const history = await invoke("/inventory/adjustments?locationId=loc_accra",
    "GET", maker);
  assert.equal(history.status, 200);
  const row = history.body.data.find((x: { id: string }) => x.id === adjustmentId);
  assert.equal(row.afterQuantity, "18");
  assert.equal(row.status, "approved");
  assert.ok(row.approvedBy);
});

test("reject path, self-checker veto and idempotency body conflict never move stock", async () => {
  const admin = await login("admin-commerce");
  const checker = await login("admin-secondary");
  const key = "adj-reject-" + seq;
  const sent = await invoke("/inventory/adjustments/create", "POST",
    admin, payload("+1"), key);
  assert.equal(sent.status, 201);
  const id = sent.body.data.adjustmentId;
  assert.equal((await invoke("/inventory/adjustments/decide", "POST",
    admin, { adjustmentId: id, decision: "reject" })).status, 403);
  const rejected = await invoke("/inventory/adjustments/decide", "POST",
    checker, { adjustmentId: id, decision: "reject" });
  assert.equal(rejected.status, 201);
  assert.equal(rejected.body.data.status, "rejected");
  assert.equal(await quantity(), "20");
  assert.equal(await db.stockMovement.count(), 0);
  assert.equal((await invoke("/inventory/adjustments/decide", "POST",
    checker, { adjustmentId: id, decision: "approve" })).status, 409);
  assert.equal((await invoke("/inventory/adjustments/create", "POST",
    admin, payload("-3"), key)).status, 409);
  const replay = await invoke("/inventory/adjustments/create", "POST",
    admin, payload("+1"), key);
  assert.equal(replay.body.data.status, "rejected");
});

test("active customer reservations veto corrections below held stock", async () => {
  const maker = await login("stockmanager");
  const checker = await login("admin-secondary");
  await db.reservation.create({
    data: {
      positionId: "pos-rice", lotId: "lot-rice",
      claimType: "order", claimId: "synthetic-claim-" + seq,
      claimLineId: "synthetic-line-" + seq, quantity: "12",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  const submitted = await invoke("/inventory/adjustments/create", "POST",
    maker, payload("-10"), "adj-reserved-" + seq);
  assert.equal(submitted.status, 201);
  const decision = await invoke("/inventory/adjustments/decide", "POST",
    checker, { adjustmentId: submitted.body.data.adjustmentId, decision: "approve" });
  assert.equal(decision.status, 409, JSON.stringify(decision.body));
  assert.equal(await quantity(), "20");
  assert.equal(await db.stockMovement.count(), 0);
  assert.equal((await db.stockAdjustment.findUniqueOrThrow({
    where: { id: submitted.body.data.adjustmentId },
  })).status, "pending_approval");
});

test("roles, branch grants, malformed claims and the OFF switch fail closed", async () => {
  const cashier = await login("cashier-adjustment");
  const maker = await login("stockmanager");
  const admin = await login("admin-commerce");
  assert.equal((await invoke("/inventory/adjustments", "GET", cashier)).status, 403);
  assert.equal((await invoke("/inventory/adjustments/create", "POST",
    cashier, payload(), "adj-deny-cashier-" + seq)).status, 403);
  assert.equal((await invoke("/inventory/adjustments/decide", "POST",
    maker, { adjustmentId: "00000000-0000-4000-8000-000000000000",
      decision: "approve" })).status, 403);
  assert.equal((await invoke("/inventory/adjustments?locationId=loc_inactive",
    "GET", maker)).status, 403);
  assert.equal((await invoke("/inventory/adjustments/create", "POST",
    maker, { ...payload(), locationId: "loc_inactive" },
    "adj-deny-branch-" + seq)).status, 403);
  assert.equal((await invoke("/inventory/adjustments/create", "POST",
    admin, { ...payload(), delta: "0" }, "adj-zero-" + seq)).status, 400);
  assert.equal((await invoke("/inventory/adjustments/create", "POST",
    admin, { ...payload(), quantity: "999" }, "adj-extra-" + seq)).status, 400);
  const disabled = await createApplication(config(false));
  try {
    await disabled.listen(0, "127.0.0.1");
    const off = await disabled.getUrl();
    assert.equal((await invoke("/inventory/adjustments", "GET",
      admin, undefined, undefined, off)).status, 503);
    assert.equal((await invoke("/inventory/adjustments/create", "POST",
      admin, payload(), "adj-flag-off-" + seq, off)).status, 503);
    assert.equal((await invoke("/inventory/adjustments/decide", "POST",
      admin, { adjustmentId: "00000000-0000-4000-8000-000000000000",
        decision: "reject" }, undefined, off)).status, 503);
  } finally { await disabled.close(); }
  assert.equal(await db.stockAdjustment.count(), 0);
  assert.equal(await quantity(), "20");
});


test("two simultaneous independent approvals cannot double-apply one lot adjustment", async () => {
  const maker = await login("stockmanager");
  const checker = await login("admin-secondary");
  const submitted = await invoke("/inventory/adjustments/create", "POST",
    maker, payload("-3"), "adj-concurrent-" + seq);
  assert.equal(submitted.status, 201);
  const adjustmentId = submitted.body.data.adjustmentId;
  const decisions = await Promise.all([
    invoke("/inventory/adjustments/decide", "POST",
      checker, { adjustmentId, decision: "approve" }),
    invoke("/inventory/adjustments/decide", "POST",
      checker, { adjustmentId, decision: "approve" }),
  ]);
  assert.deepEqual(decisions.map(x => x.status).sort(), [201, 201]);
  assert.deepEqual(decisions.map(x => x.body.data.replayed).sort(), [false, true]);
  assert.equal(await quantity(), "17");
  assert.equal(await db.stockMovement.count({
    where: { lotId: "lot-rice", reason: "adjustment" },
  }), 1);
});

test("stale physical quantity, revoked branch and zero-after-quantity reporting are safe", async () => {
  const maker = await login("stockmanager");
  const checker = await login("admin-secondary");
  const first = await invoke("/inventory/adjustments/create", "POST",
    maker, payload("-2"), "adj-stale-" + seq);
  assert.equal(first.status, 201);
  await db.stockLot.update({ where: { id: "lot-rice" },
    data: { quantity: "19" },
  });
  assert.equal((await invoke("/inventory/adjustments/decide", "POST",
    checker, { adjustmentId: first.body.data.adjustmentId,
      decision: "approve" })).status, 409);
  assert.equal(await quantity(), "19");
  assert.equal(await db.stockMovement.count(), 0);
  await db.userLocation.delete({
    where: { userId_locationId: {
      userId: "stockmanager", locationId: "loc_accra",
    } },
  });
  assert.equal((await invoke("/inventory/adjustments/create", "POST",
    maker, payload("-1"), "adj-revoked-" + seq)).status, 403);
  const admin = await login("admin-commerce");
  const toZero = await invoke("/inventory/adjustments/create", "POST",
    admin, payload("-19"), "adj-zero-balance-" + seq);
  assert.equal(toZero.status, 201);
  assert.equal((await invoke("/inventory/adjustments/decide", "POST",
    checker, { adjustmentId: toZero.body.data.adjustmentId,
      decision: "approve" })).status, 201);
  assert.equal(await quantity(), "0");
  const list = await invoke("/inventory/adjustments", "GET", checker);
  assert.equal(list.status, 200);
  const row = list.body.data.find((x: { id: string }) =>
    x.id === toZero.body.data.adjustmentId);
  assert.equal(row.afterQuantity, "0",
    "A legitimately zero ending balance must be shown, not omitted");
});

test("product variant disabled after request cannot receive an approval", async () => {
  const maker = await login("stockmanager");
  const checker = await login("admin-secondary");
  const submitted = await invoke("/inventory/adjustments/create", "POST",
    maker, payload("+1"), "adj-disabled-variant-" + seq);
  assert.equal(submitted.status, 201);
  await db.variant.update({ where: { id: "var-rice" }, data: { active: false } });
  const decision = await invoke("/inventory/adjustments/decide", "POST",
    checker, { adjustmentId: submitted.body.data.adjustmentId, decision: "approve" });
  assert.equal(decision.status, 409);
  assert.equal(await quantity(), "20");
  assert.equal(await db.stockMovement.count(), 0);
  assert.equal((await db.stockAdjustment.findUniqueOrThrow({
    where: { id: submitted.body.data.adjustmentId },
  })).status, "pending_approval");
});
