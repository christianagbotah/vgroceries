import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { Database } from "../src/database/database";
import { readConfig } from "../src/config";

test("PrismaPg stores session and invitation deadlines in UTC regardless of database default timezone", async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).pathname !== "/variety_foundation_test")
    throw new Error("UTC deadline test must only access the disposable foundation test DB");
  const db = new Database(readConfig({
    DATABASE_URL: databaseUrl,
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "loc_accra",
  }));
  const userIds: string[] = [];
  try {
    await db.$connect();
    const tz = await db.$queryRawUnsafe<Array<{ timezone: string }>>(
      "SELECT current_setting('TimeZone') AS timezone",
    );
    assert.equal(tz[0].timezone, "UTC",
      "Every PrismaPg pooled connection must have a UTC database session");

    const customerId = randomUUID();
    const cashierId = randomUUID();
    userIds.push(customerId, cashierId);
    await db.user.createMany({
      data: [
        {
          id: customerId, name: "UTC test customer", role: "customer",
          email: randomUUID() + "@example.test", phone: "", active: true,
          passwordHash: "unusable-test-fixture",
        },
        {
          id: cashierId, name: "UTC test cashier", role: "cashier",
          email: randomUUID() + "@example.test", phone: "", active: false,
          passwordHash: "unusable-test-fixture",
        },
      ],
    });

    const past = await db.session.create({
      data: {
        userId: customerId, channel: "web",
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const future = await db.session.create({
      data: {
        userId: customerId, channel: "native",
        accessHash: randomBytes(32).toString("hex"),
        currentRefreshHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 15 * 60_000),
        accessExpiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    const invitation = await db.staffInvitation.create({
      data: {
        userId: cashierId,
        createdByUserId: cashierId,
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 48 * 60 * 60_000),
      },
    });

    const sql = [
      "SELECT",
      '(SELECT EXTRACT(EPOCH FROM ("expiresAt"-now()))::float8',
      ' FROM "Session" WHERE id=$1) AS past_seconds,',
      '(SELECT EXTRACT(EPOCH FROM ("expiresAt"-now()))::float8',
      ' FROM "Session" WHERE id=$2) AS future_seconds,',
      '(SELECT EXTRACT(EPOCH FROM ("accessExpiresAt"-now()))::float8',
      ' FROM "Session" WHERE id=$2) AS access_seconds,',
      '(SELECT EXTRACT(EPOCH FROM ("expiresAt"-now()))::float8',
      ' FROM "StaffInvitation" WHERE id=$3) AS invitation_seconds',
    ].join(" ");
    const rows = await db.$queryRawUnsafe<Array<{
      past_seconds: number;
      future_seconds: number;
      access_seconds: number;
      invitation_seconds: number;
    }>>(sql, past.id, future.id, invitation.id);
    assert.ok(rows[0].past_seconds >= -90 && rows[0].past_seconds < 0,
      "Past session must be expired in SQL: " + rows[0].past_seconds);
    assert.ok(rows[0].future_seconds > 0 && rows[0].future_seconds <= 900,
      "Future session should have ~15m: " + rows[0].future_seconds);
    assert.ok(rows[0].access_seconds > 0 && rows[0].access_seconds <= 300,
      "Native access should have ~5m: " + rows[0].access_seconds);
    assert.ok(rows[0].invitation_seconds > 47.99 * 3600 &&
      rows[0].invitation_seconds <= 48 * 3600,
      "Invitation should have 48h: " + rows[0].invitation_seconds);
    assert.equal(await db.session.count({
      where: { id: past.id, expiresAt: { gt: new Date() } },
    }), 0, "Prisma expiry predicate must reject an expired session");
    assert.equal(await db.session.count({
      where: { id: future.id, expiresAt: { gt: new Date() } },
    }), 1);
  } finally {
    if (userIds.length) {
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.staffInvitation.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await db.$disconnect();
  }
});
