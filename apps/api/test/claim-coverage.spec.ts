import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { ClaimCoverageService } from "../src/inventory/claim-coverage.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let coverage: ClaimCoverageService;

const future = () => new Date(Date.now() + 60 * 60 * 1000);

function expectLost(error: unknown) {
  assert.ok(error instanceof ApiProblem);
  assert.equal(error.getStatus(), 409);
  assert.equal((error.getResponse() as { code: string }).code, "RESERVATION_LOST");
  return true;
}

async function reserve(input: {
  id: string;
  claimId: string;
  claimLineId: string;
  lotId?: string;
  positionId?: string;
  generation?: number;
  quantity?: string;
  expiresAt?: Date;
}) {
  return db.reservation.create({ data: {
    id: input.id,
    positionId: input.positionId ?? "pos-rice",
    lotId: input.lotId ?? "lot-rice",
    claimType: "order",
    claimId: input.claimId,
    claimLineId: input.claimLineId,
    generation: input.generation ?? 1,
    quantity: input.quantity ?? "1",
    state: "active",
    expiresAt: input.expiresAt ?? future(),
  } });
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Claim coverage tests require the isolated variety_foundation_test database");
  app = await createApplication();
  db = app.get(Database);
  coverage = app.get(ClaimCoverageService);
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
  await db.stockLot.create({ data: {
    id: "lot-rice-second",
    positionId: "pos-rice",
    lotNumber: "RICE-SECOND",
    quantity: "10",
    expiryDate: new Date("2030-01-01"),
  } });
});

after(async () => { await app?.close(); });

test("exact claim coverage locks one active generation and returns deterministic reservation provenance", async () => {
  await reserve({ id: "res-b", claimId: "claim-exact", claimLineId: "line-rice", lotId: "lot-rice-second", quantity: "1" });
  await reserve({ id: "res-a", claimId: "claim-exact", claimLineId: "line-rice", quantity: "1" });

  const result = await db.$transaction((tx) => coverage.lockExact(tx, {
    claimType: "order",
    claimId: "claim-exact",
    locationId: "loc_accra",
    lines: [{ claimLineId: "line-rice", variantId: "var-rice", quantity: "2" }],
  }));

  assert.equal(result.generation, 1);
  assert.deepEqual(result.reservations.map((row) => row.id), ["res-a", "res-b"]);
  assert.deepEqual(result.reservations.map((row) => row.lotId), ["lot-rice", "lot-rice-second"]);
  assert.deepEqual(result.reservations.map((row) => row.quantity.toString()), ["1", "1"]);
  assert.ok(result.reservations.every((row) => row.variantId === "var-rice"));
  assert.ok(result.reservations.every((row) => row.locationId === "loc_accra"));
});

test("partial or missing active coverage is rejected", async () => {
  await reserve({ id: "res-partial", claimId: "claim-partial", claimLineId: "line-rice", quantity: "1" });
  await assert.rejects(
    () => db.$transaction((tx) => coverage.lockExact(tx, {
      claimType: "order",
      claimId: "claim-partial",
      locationId: "loc_accra",
      lines: [{ claimLineId: "line-rice", variantId: "var-rice", quantity: "2" }],
    })),
    expectLost,
  );

  await assert.rejects(
    () => db.$transaction((tx) => coverage.lockExact(tx, {
      claimType: "order",
      claimId: "claim-missing",
      locationId: "loc_accra",
      lines: [{ claimLineId: "line-rice", variantId: "var-rice", quantity: "1" }],
    })),
    expectLost,
  );
});

test("extra active reservation lines are rejected rather than silently consumed", async () => {
  await reserve({ id: "res-main", claimId: "claim-extra", claimLineId: "line-rice", quantity: "1" });
  await reserve({ id: "res-extra", claimId: "claim-extra", claimLineId: "line-unexpected", lotId: "lot-rice-second", quantity: "1" });
  await assert.rejects(
    () => db.$transaction((tx) => coverage.lockExact(tx, {
      claimType: "order",
      claimId: "claim-extra",
      locationId: "loc_accra",
      lines: [{ claimLineId: "line-rice", variantId: "var-rice", quantity: "1" }],
    })),
    expectLost,
  );
});

test("multiple active generations are rejected", async () => {
  await reserve({ id: "res-gen-1", claimId: "claim-generations", claimLineId: "line-rice", generation: 1, quantity: "1" });
  await reserve({ id: "res-gen-2", claimId: "claim-generations", claimLineId: "line-rice", lotId: "lot-rice-second", generation: 2, quantity: "1" });
  await assert.rejects(
    () => db.$transaction((tx) => coverage.lockExact(tx, {
      claimType: "order",
      claimId: "claim-generations",
      locationId: "loc_accra",
      lines: [{ claimLineId: "line-rice", variantId: "var-rice", quantity: "2" }],
    })),
    expectLost,
  );
});

test("stale active reservations are expired before coverage is evaluated", async () => {
  await reserve({
    id: "res-stale",
    claimId: "claim-stale",
    claimLineId: "line-rice",
    quantity: "1",
    expiresAt: new Date(Date.now() - 1000),
  });
  await assert.rejects(
    () => db.$transaction((tx) => coverage.lockExact(tx, {
      claimType: "order",
      claimId: "claim-stale",
      locationId: "loc_accra",
      lines: [{ claimLineId: "line-rice", variantId: "var-rice", quantity: "1" }],
    })),
    expectLost,
  );
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: "res-stale" } })).state, "expired");
});

test("variant mismatch is rejected even when claim-line quantity matches", async () => {
  await reserve({
    id: "res-wrong-variant",
    claimId: "claim-variant",
    claimLineId: "line-rice",
    positionId: "pos-salt",
    lotId: "lot-salt",
    quantity: "1",
  });
  await assert.rejects(
    () => db.$transaction((tx) => coverage.lockExact(tx, {
      claimType: "order",
      claimId: "claim-variant",
      locationId: "loc_accra",
      lines: [{ claimLineId: "line-rice", variantId: "var-rice", quantity: "1" }],
    })),
    expectLost,
  );
});

test("coverage input rejects duplicate lines and malformed quantities before locking stock claims", async () => {
  await assert.rejects(
    () => db.$transaction((tx) => coverage.lockExact(tx, {
      claimType: "order",
      claimId: "claim-bad-input",
      locationId: "loc_accra",
      lines: [
        { claimLineId: "line-rice", variantId: "var-rice", quantity: "1" },
        { claimLineId: "line-rice", variantId: "var-rice", quantity: "1" },
      ],
    })),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.equal(error.getStatus(), 400);
      assert.equal((error.getResponse() as { code: string }).code, "VALIDATION_FAILED");
      return true;
    },
  );

  await assert.rejects(
    () => db.$transaction((tx) => coverage.lockExact(tx, {
      claimType: "order",
      claimId: "claim-bad-quantity",
      locationId: "loc_accra",
      lines: [{ claimLineId: "line-rice", variantId: "var-rice", quantity: "1.2345" }],
    })),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.equal(error.getStatus(), 400);
      return true;
    },
  );
});
