import assert from "node:assert/strict";
import { test } from "node:test";
import { Database } from "../src/database/database";
import { readConfig } from "../src/config";

/** A read-only regression for the PrismaPg P2010 void-decoding bug. */
test("PrismaPg OTP advisory lock uses a supported scalar return type", async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).pathname !== "/variety_foundation_test")
    throw new Error("OTP lock regression must only access the disposable foundation CI database.");
  const db = new Database(readConfig({
    DATABASE_URL: databaseUrl,
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc_accra",
  }));
  try {
    await db.$connect();
    await db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ locked: number }>>`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${"otp-test-lock"}, 0))`;
      assert.equal(rows[0]?.locked, 1);
    });
  } finally {
    await db.$disconnect();
  }
});
