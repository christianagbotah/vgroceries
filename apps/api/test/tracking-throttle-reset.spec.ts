import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "../src/database/database";
import { TrackingThrottleService } from "../src/orders/tracking-throttle.service";
import { ApiProblem } from "../src/http/errors";

type Entry = { attempts: number; windowStart: Date };
function harness() {
  const store = new Map<string, Entry>();
  const db = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      $queryRaw: async (_sql: TemplateStringsArray, key: string) => {
        const old = store.get(key);
        const reset = !old || Date.now() - old.windowStart.getTime() >= 15 * 60_000;
        const item = { attempts: reset ? 1 : old.attempts + 1, windowStart: reset ? new Date() : old.windowStart };
        store.set(key, item);
        return [item];
      },
    }),
    trackingThrottle: {
      findUnique: async ({where}: {where: {key:string}}) => store.get(where.key) ?? null,
    },
  } as unknown as Database;
  return { limiter: new TrackingThrottleService(db), store };
}
function retryAfter(error: unknown) {
  assert.ok(error instanceof ApiProblem, "Expected API status error");
  assert.equal(error.getStatus(),429);
  const response = error.getResponse() as {code:string;details:{retryAfterSeconds:number}};
  assert.equal(response.code,"RATE_LIMITED");
  assert.ok(response.details.retryAfterSeconds > 0 && response.details.retryAfterSeconds <= 900);
  return response.details.retryAfterSeconds;
}
test("successful tracking requests do not consume five invalid-code attempts", async () => {
  const { limiter } = harness();
  for (let i=0; i<12; i++) {
    await limiter.registerLookup("198.51.100.4","VG-TEST12345678");
    await limiter.ensureNotBlocked("198.51.100.4","VG-TEST12345678");
  }
  for(let i=0; i<5; i++) await limiter.registerFailure("198.51.100.4","VG-TEST12345678");
  await assert.rejects(limiter.ensureNotBlocked("198.51.100.4","VG-TEST12345678"), e => !!retryAfter(e));
  await assert.rejects(limiter.registerFailure("198.51.100.4","VG-TEST12345678"), e => !!retryAfter(e));
  // A different device/IP does not inherit this user's pair lock.
  await limiter.registerLookup("203.0.113.20","VG-TEST12345678");
  await limiter.ensureNotBlocked("203.0.113.20","VG-TEST12345678");
});
test("public lookups have independent upper bound against enumeration", async () => {
  const { limiter } = harness();
  for(let i=0; i<60; i++) await limiter.registerLookup("198.51.100.11","VG-TEST12345678");
  await assert.rejects(limiter.registerLookup("198.51.100.11","VG-TEST12345678"), e => !!retryAfter(e));
});
test("reset countdown comes from stored windowStart and expires after fifteen minutes", async () => {
  const { limiter, store } = harness();
  for(let i=0; i<5; i++) await limiter.registerFailure("198.51.100.10","VG-TEST12345678");
  for (const row of store.values()) row.windowStart = new Date(Date.now() - 12 * 60_000);
  await assert.rejects(limiter.ensureNotBlocked("198.51.100.10","VG-TEST12345678"), e => {
    const secs = retryAfter(e);
    assert.ok(secs >= 175 && secs <= 181, String(secs));
    return true;
  });
  for(const row of store.values()) row.windowStart = new Date(Date.now() - 15 * 60_000 - 1000);
  await limiter.ensureNotBlocked("198.51.100.10","VG-TEST12345678");
  await limiter.registerFailure("198.51.100.10","VG-TEST12345678");
});
