/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  assertUtcDeadlineClock,
  MAX_DATABASE_CLOCK_SKEW_MS,
} from "../apps/api/src/database/utc-deadline-guard";

const now = Date.UTC(2026, 10, 18, 22, 30, 0);

describe("fail-closed PostgreSQL UTC deadline startup guard", () => {
  test("accepts an exact UTC session and a clock up to permitted tolerance", () => {
    expect(() => assertUtcDeadlineClock([{ timezone: "UTC", epoch_seconds: now / 1000 }], now)).not.toThrow();
    expect(() => assertUtcDeadlineClock([{ timezone: "UTC", epoch_seconds: (now - MAX_DATABASE_CLOCK_SKEW_MS) / 1000 }], now)).not.toThrow();
    expect(() => assertUtcDeadlineClock([{ timezone: "UTC", epoch_seconds: (now + MAX_DATABASE_CLOCK_SKEW_MS) / 1000 }], now)).not.toThrow();
  });
  test("rejects non-UTC and ambiguous session timezone values", () => {
    for (const timezone of ["America/Toronto", "Africa/Accra", "Etc/UTC", "GMT", "utc", "", "UTC+01"]) {
      expect(() => assertUtcDeadlineClock([{ timezone, epoch_seconds: now / 1000 }], now)).toThrow("UTC session required");
    }
  });
  test("rejects absent, duplicated, corrupt or stale DB clock evidence", () => {
    for (const value of [[], [{timezone:"UTC",epoch_seconds:now/1000},{timezone:"UTC",epoch_seconds:now/1000}]]) {
      expect(() => assertUtcDeadlineClock(value, now)).toThrow("UTC session required");
    }
    for (const epoch_seconds of [NaN, Infinity, -Infinity, (now+MAX_DATABASE_CLOCK_SKEW_MS+1)/1000, (now-MAX_DATABASE_CLOCK_SKEW_MS-1)/1000]) {
      expect(() => assertUtcDeadlineClock([{ timezone: "UTC", epoch_seconds }], now)).toThrow("database clock cannot be trusted");
    }
  });
  test("checked evidence remains calendar- and DST-independent", () => {
    for (const sample of ["2026-03-08T07:00:00.000Z", "2026-11-01T06:00:00.000Z"]) {
      const sampledAtMs = Date.parse(sample);
      expect(() => assertUtcDeadlineClock([{ timezone: "UTC", epoch_seconds: sampledAtMs / 1000 }], sampledAtMs)).not.toThrow();
      expect(() => assertUtcDeadlineClock([{ timezone: "America/Toronto", epoch_seconds: sampledAtMs / 1000 }], sampledAtMs)).toThrow();
    }
  });
  test("database initialization queries the session and disconnects on failure", () => {
    const source = readFileSync("apps/api/src/database/database.ts", "utf8");
    expect(source).toContain('options: "-c timezone=UTC"');
    expect(source).toContain("current_setting('TimeZone')");
    expect(source).toContain("EXTRACT(EPOCH FROM clock_timestamp())::float8");
    expect(source).toContain("assertUtcDeadlineClock(rows)");
    expect(source).toContain("await this.$disconnect()");
  });
});
