import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApiConfig } from "../src/config";
import { readConfig } from "../src/config";
import type { Database } from "../src/database/database";
import type { AuthRequest } from "../src/identity/identity.service";
import { ApiProblem } from "../src/http/errors";
import { PosCustomersService } from "../src/cashier-tills/pos-customers.service";
import { posCustomerSearchResultSchema } from "@variety/contracts";

const actor = (role = "cashier", id = "cashier-a"): AuthRequest => ({
  actor: { id, role, name: "Test Staff", locationIds: ["stale-branch"] },
}) as AuthRequest;

const config = (lookup = true, foundation = true) => ({
  posCustomerLookupEnabled: lookup,
  posTillFoundationEnabled: foundation,
}) as ApiConfig;

type Query = Record<string, any>;
function fixture(options: {
  grants?: string[];
  customers?: Array<{ id: string; name: string; phone: string }>;
  throttleCount?: number;
} = {}) {
  const calls = { grants: [] as Query[], customers: [] as Query[], throttle: [] as unknown[][] };
  const db = {
    userLocation: {
      findMany: async (query: Query) => {
        calls.grants.push(query);
        return (options.grants ?? ["branch-live"]).map((locationId) => ({ locationId }));
      },
    },
    $queryRaw: async (_template: TemplateStringsArray, ...values: unknown[]) => {
      calls.throttle.push(values);
      return [{ attempts: options.throttleCount ?? 1 }];
    },
    user: {
      findMany: async (query: Query) => {
        calls.customers.push(query);
        return options.customers ?? [
          { id: "customer-1", name: "Akosua Example", phone: "+233241234567" },
        ];
      },
    },
  } as unknown as Database;
  return { db, calls };
}

test("feature is default OFF and cannot be enabled without POS till foundation", async () => {
  const base = {
    DATABASE_URL: "postgresql://localhost/variety_foundation_test",
    WEB_ORIGINS: "http://localhost:3000",
    API_STOCK_LOCATION_ID: "branch-live",
  };
  assert.equal(readConfig(base).posCustomerLookupEnabled, false);
  assert.throws(
    () => readConfig({ ...base, POS_CUSTOMER_LOOKUP_ENABLED: "TRUE" }),
    /POS_CUSTOMER_LOOKUP_ENABLED must be true or false/,
  );
  assert.throws(
    () => readConfig({ ...base, POS_CUSTOMER_LOOKUP_ENABLED: "true" }),
    /POS_CUSTOMER_LOOKUP_ENABLED requires POS_TILL_FOUNDATION_ENABLED/,
  );
  assert.equal(readConfig({
    ...base, POS_TILL_FOUNDATION_ENABLED: "true", POS_CUSTOMER_LOOKUP_ENABLED: "true",
  }).posCustomerLookupEnabled, true);

  const { db, calls } = fixture();
  await assert.rejects(() => new PosCustomersService(db, config(false)).search(actor(), "Ak"),
    (err: unknown) => err instanceof ApiProblem && err.getStatus() === 404);
  await assert.rejects(() => new PosCustomersService(db, config(true, false)).search(actor(), "Ak"),
    (err: unknown) => err instanceof ApiProblem && err.getStatus() === 404);
  assert.equal(calls.grants.length + calls.throttle.length + calls.customers.length, 0);
});

test("customer, inventory and rider roles are denied without reading user data", async () => {
  const { db, calls } = fixture();
  const service = new PosCustomersService(db, config());
  for (const role of ["customer", "inventory_manager", "rider", "picker"]) {
    await assert.rejects(() => service.search(actor(role), "Ak"),
      (err: unknown) => err instanceof ApiProblem && err.getStatus() === 403);
  }
  assert.equal(calls.grants.length + calls.throttle.length + calls.customers.length, 0);
});

test("cashier must have current active branch grants, not actor snapshot", async () => {
  const { db, calls } = fixture({ grants: [] });
  await assert.rejects(() => new PosCustomersService(db, config()).search(actor(), "Ak"),
    (err: unknown) => err instanceof ApiProblem && err.getStatus() === 403);
  assert.equal(calls.grants.length, 1);
  assert.deepEqual(calls.grants[0].where, {
    userId: "cashier-a",
    user: { is: { role: "cashier", active: true } },
    location: { is: { active: true } },
  });
  assert.equal(calls.throttle.length, 0);
  assert.equal(calls.customers.length, 0);
  await assert.rejects(() => new PosCustomersService(db, config()).search(actor(), " "),
    (err: unknown) => err instanceof ApiProblem && err.getStatus() === 403);
});

test("cashier customer search is restricted to current POS-sale branch history", async () => {
  const { db, calls } = fixture({ grants: ["branch-1", "branch-2"] });
  const result = await new PosCustomersService(db, config()).search(actor(), "  Ak  ");
  assert.deepEqual(result, [
    { id: "customer-1", name: "Akosua Example", phoneLast4: "4567" },
  ]);
  assert.deepEqual(posCustomerSearchResultSchema.parse(result), result);
  assert.equal(calls.customers.length, 1);
  assert.deepEqual(calls.customers[0].where.posCustomerSales,
    { some: { locationId: { in: ["branch-1", "branch-2"] } } });
  assert.equal(calls.customers[0].where.role, "customer");
  assert.equal(calls.customers[0].where.active, true);
  assert.equal(calls.customers[0].where.OR[0].name.contains, "Ak");
  assert.deepEqual(calls.customers[0].select, { id: true, name: true, phone: true });
  assert.equal(calls.customers[0].take, 15);
  assert.ok(!("email" in result[0]));
  assert.ok(!("phone" in result[0]));
  assert.ok(!("passwordHash" in result[0]));
  assert.equal(calls.throttle.length, 1);
  assert.match(String(calls.throttle[0][0]), /^[a-f0-9]{64}$/);
});

test("administrator can search across branches but still receives only masked contact", async () => {
  const { db, calls } = fixture();
  const result = await new PosCustomersService(db, config()).search(actor("admin", "admin-a"), "Ak");
  assert.equal(result[0].phoneLast4, "4567");
  assert.equal(calls.grants.length, 0);
  assert.equal(calls.customers.length, 1);
  assert.equal(calls.customers[0].where.posCustomerSales, undefined);
});

test("invalid and absent query do not execute customer or throttle queries", async () => {
  const { db, calls } = fixture();
  const service = new PosCustomersService(db, config());
  for (const query of [undefined, ["Ak"], {}, 42, "A".repeat(81)]) {
    await assert.rejects(() => service.search(actor(), query),
      (err: unknown) => err instanceof ApiProblem && err.getStatus() === 400);
  }
  assert.deepEqual(await service.search(actor(), " "), []);
  assert.equal(calls.customers.length, 0);
  assert.equal(calls.throttle.length, 0);
});

test("durable actor throttle prevents repeated customer enumeration", async () => {
  const { db, calls } = fixture({ throttleCount: 121 });
  await assert.rejects(
    () => new PosCustomersService(db, config()).search(actor(), "Ak"),
    (err: unknown) => err instanceof ApiProblem && err.getStatus() === 429,
  );
  assert.equal(calls.throttle.length, 1);
  assert.equal(calls.customers.length, 0);
});

test("Zod boundary rejects accidentally enlarged or sensitive result shapes", () => {
  assert.equal(posCustomerSearchResultSchema.safeParse(
    [{ id: "x", name: "Test", phoneLast4: "1234", email: "test@example.invalid" }],
  ).success, false);
  assert.equal(posCustomerSearchResultSchema.safeParse(
    Array.from({ length: 16 }, (_, i) => ({ id: String(i), name: "Test", phoneLast4: "" })),
  ).success, false);
});
