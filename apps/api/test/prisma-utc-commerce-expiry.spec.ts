import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { Database } from "../src/database/database";
import { readConfig } from "../src/config";

const digest = () => randomBytes(32).toString("hex");
const unique = () => randomUUID();

test("UTC Prisma deadlines hold for guest checkout, POS stock holds and inventory reservations", async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).pathname !== "/variety_foundation_test")
    throw Error("UTC commerce deadline test requires the disposable foundation PostgreSQL database");

  const db = new Database(readConfig({
    DATABASE_URL: databaseUrl,
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc_accra",
  }));
  const rollback = new Error("ROLLBACK_SYNTHETIC_UTC_COMMERCE_FIXTURES");

  try {
    await db.$connect();
    try {
      await db.$transaction(async tx => {
        const rows = await tx.$queryRawUnsafe<Array<{ timezone: string }>>(
          "SELECT current_setting('TimeZone') AS timezone",
        );
        assert.equal(rows[0]?.timezone, "UTC");

        const location = await tx.location.create({
          data: { id: "utc-test-" + unique(), name: "Synthetic UTC test location" },
        });
        const admin = await tx.user.create({
          data: {
            name: "Synthetic UTC test administrator", role: "admin", active: true,
            email: "utc-test-" + unique() + "@example.test", phone: "",
            passwordHash: "unusable-fixture-only",
          },
        });
        const category = await tx.category.create({
          data: { slug: "utc-test-" + unique(), name: "Synthetic UTC test category" },
        });
        const product = await tx.product.create({
          data: {
            slug: "utc-test-" + unique(), name: "Synthetic UTC test product",
            categoryId: category.id, tags: [],
          },
        });
        const variant = await tx.variant.create({
          data: {
            sku: "UTC-TEST-" + unique(), productId: product.id,
            name: "Synthetic unit", unit: "piece", priceMinor: 125,
          },
        });
        const position = await tx.stockPosition.create({
          data: { variantId: variant.id, locationId: location.id },
        });
        const lot = await tx.stockLot.create({
          data: {
            positionId: position.id, lotNumber: "UTC-TEST-" + unique(),
            quantity: "5.000",
          },
        });

        const guest = await tx.guestCheckoutSession.create({
          data: {
            tokenHash: digest(), csrfHash: digest(),
            expiresAt: new Date(Date.now() - 60_000),
          },
        });
        const reservation = await tx.reservation.create({
          data: {
            positionId: position.id, lotId: lot.id, claimType: "order",
            claimId: unique(), claimLineId: unique(),
            quantity: "1.000", expiresAt: new Date(Date.now() + 5 * 60_000),
          },
        });
        const till = await tx.cashierTillSession.create({
          data: {
            locationId: location.id, openedByUserId: admin.id,
            tillCode: "UTC_TEST_COUNTER", openingFloatMinor: 0,
          },
        });
        const hold = await tx.posStockHold.create({
          data: {
            locationId: location.id, tillSessionId: till.id,
            createdByUserId: admin.id, status: "held",
            subtotalMinor: 125, expiresAt: new Date(Date.now() + 2 * 60_000),
          },
        });

        // PostgreSQL's current wall clock (clock_timestamp, not a transaction-
        // frozen now()) must agree with intended JS deadlines.
        // A Prisma read-back alone can conceal a five-hour timestamp skew.
        const sql = [
          "SELECT",
          '(SELECT EXTRACT(EPOCH FROM ("expiresAt"-clock_timestamp()))::float8 FROM "GuestCheckoutSession" WHERE id=$1) AS guest_seconds,',
          '(SELECT EXTRACT(EPOCH FROM ("expiresAt"-clock_timestamp()))::float8 FROM "Reservation" WHERE id=$2) AS reservation_seconds,',
          '(SELECT EXTRACT(EPOCH FROM ("expiresAt"-clock_timestamp()))::float8 FROM "PosStockHold" WHERE id=$3) AS hold_seconds',
        ].join(" ");
        const timing = await tx.$queryRawUnsafe<Array<{
          guest_seconds: number;
          reservation_seconds: number;
          hold_seconds: number;
        }>>(sql, guest.id, reservation.id, hold.id);
        assert.equal(timing.length, 1);
        assert.ok(timing[0].guest_seconds >= -90 && timing[0].guest_seconds < 0,
          "Already-expired guest session must remain expired in SQL: " + timing[0].guest_seconds);
        assert.ok(timing[0].reservation_seconds > 0 && timing[0].reservation_seconds <= 300,
          "Inventory reservation must expire in <=5 minutes: " + timing[0].reservation_seconds);
        assert.ok(timing[0].hold_seconds > 0 && timing[0].hold_seconds <= 120,
          "POS stock hold must expire in <=2 minutes: " + timing[0].hold_seconds);

        assert.equal(await tx.guestCheckoutSession.count({
          where: { id: guest.id, expiresAt: { gt: new Date() } },
        }), 0);
        assert.equal(await tx.reservation.count({
          where: { id: reservation.id, state: "active", expiresAt: { gt: new Date() } },
        }), 1);
        assert.equal(await tx.posStockHold.count({
          where: { id: hold.id, status: "held", expiresAt: { gt: new Date() } },
        }), 1);

        // Always roll back: absolutely no synthetic stock, checkout, sale,
        // cashier or account rows survive even a successful test run.
        throw rollback;
      }, { timeout: 15_000 });
      assert.fail("Synthetic commerce fixtures must always be rolled back");
    } catch (error) {
      if (error !== rollback) throw error;
    }
  } finally {
    await db.$disconnect();
  }
});
