/// <reference types="bun-types" />
import { afterAll, beforeEach, expect, test } from "bun:test";
const originalTTL = process.env.NEXT_PUBLIC_CACHE_TTL_MS;
const originalPublic = process.env.NEXT_PUBLIC_API_BASE_URL;
process.env.NEXT_PUBLIC_CACHE_TTL_MS = "60000";
process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.fixture.invalid/api/v1";
const originalFetch = globalThis.fetch;
let calls = 0;
let fetchReply: () => Promise<Response> = async () => Response.json({ ok: true, data: { version: calls } });
globalThis.fetch = Object.assign(() => { calls++; return fetchReply(); }, { preconnect: originalFetch.preconnect });
const { resolveClientAdapter } = await import("../src/services/adapters/browser");
const adapter = resolveClientAdapter();
beforeEach(async () => {
  fetchReply = async () => Response.json({ ok: true, data: { version: calls } });
  await adapter.request({ op: "demo.reset", body: {}, skipValidation: true });
  calls = 0;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalTTL === undefined) delete process.env.NEXT_PUBLIC_CACHE_TTL_MS;
  else process.env.NEXT_PUBLIC_CACHE_TTL_MS = originalTTL;
  if (originalPublic === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalPublic;
});
test("distinct query values cannot collide in the client cache", async () => {
  const first = await adapter.request({ op: "catalog.list", query: { q: "tea&z=1" } });
  const second = await adapter.request({ op: "catalog.list", query: { q: "tea", z: "1" } });
  expect(first).not.toEqual(second);
  expect(calls).toBe(2);
});
test("a mutation invalidates a cached stock-dependent catalogue read", async () => {
  await adapter.request({ op: "catalog.list" });
  await adapter.request({ op: "catalog.list" });
  expect(calls).toBe(1);
  await adapter.request({ op: "admin.pos.complete", body: {}, skipValidation: true });
  expect(await adapter.request<{ version: number }>({ op: "catalog.list" })).toEqual({ version: 3 });
});
test("an older in-flight response cannot repopulate the cache after invalidation", async () => {
  let finish!: (response: Response) => void;
  fetchReply = () => new Promise<Response>(resolve => { finish = resolve; });
  const pending = adapter.request({ op: "catalog.list" });
  fetchReply = async () => Response.json({ ok: true, data: { version: 2 } });
  await adapter.request({ op: "admin.pos.complete", body: {}, skipValidation: true });
  finish(Response.json({ ok: true, data: { version: 1 } }));
  await pending;
  expect(await adapter.request<{ version: number }>({ op: "catalog.list" })).toEqual({ version: 2 });
  expect(calls).toBe(3);
});
test("an older overlapping read cannot overwrite the newer cached response", async () => {
  const finishReads: ((response: Response) => void)[] = [];
  fetchReply = () => new Promise<Response>(resolve => finishReads.push(resolve));
  const older = adapter.request({ op: "catalog.list" });
  const newer = adapter.request({ op: "catalog.list" });
  finishReads[1](Response.json({ ok: true, data: { version: 2 } })); await newer;
  finishReads[0](Response.json({ ok: true, data: { version: 1 } })); await older;
  expect(await adapter.request<{ version: number }>({ op: "catalog.list" })).toEqual({ version: 2 });
  expect(calls).toBe(2);
});

test.each([
  { op: "admin.ai.generate", read: "admin.ai.suggestions" },
  { op: "demo.reset", read: "catalog.list", idempotencyKey: "reset-header-key" },
])("a bodyless POST invalidates cached reads: $op", async ({ op, read, idempotencyKey }) => {
  await adapter.request({ op: read });
  await adapter.request({ op, idempotencyKey });
  expect(await adapter.request<{ version: number }>({ op: read })).toEqual({ version: 3 });
  expect(calls).toBe(3);
});
