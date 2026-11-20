import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApiConfig } from "../src/config";
import type { Database } from "../src/database/database";
import { HubtelPaymentRecoveryService, HUBTEL_MIN_RECOVERY_AGE_SECONDS, HUBTEL_RECOVERY_BATCH_LIMIT, hubtelRecoveryCutoff } from "../src/payments/hubtel-payment-recovery.service";
import type { PaymentReconciliationService } from "../src/payments/payment-reconciliation.service";

const clock = new Date("2026-11-20T15:00:00Z");
const hosted = {
  payments: { providerId: "hubtel", enabledMethods: ["hosted_checkout"], reconcileAfterSeconds: 120 },
  hubtelPayment: { onlineCheckout: { merchantAccountNumber: "TEST", initiateUrl: "https://example.test", statusUrl: "https://example.test" } },
} as unknown as ApiConfig;

function fakeService(options: { config?: ApiConfig; ids?: string[]; responses?: Array<"matched" | "exception" | "throws"> } = {}) {
  const calls: string[] = [];
  const queries: unknown[] = [];
  const db = {
    paymentAttempt: {
      findMany: async (query: unknown) => {
        queries.push(query);
        return (options.ids ?? ["attempt-a", "attempt-b"]).map((id) => ({ id }));
      },
    },
  } as unknown as Database;
  const reconciliation = {
    reconcile: async (id: string, trigger: string, actorId: string, requestId: string) => {
      assert.equal(trigger, "worker");
      assert.equal(actorId, "system:hubtel-recovery");
      assert.match(requestId, /^[0-9a-f-]{36}$/);
      calls.push(id);
      const state = (options.responses ?? [])[calls.length - 1] ?? "matched";
      if (state === "throws") throw new Error("Provider unavailable (simulated)");
      return { attemptId: id, result: state };
    },
  } as unknown as PaymentReconciliationService;
  return {
    service: new HubtelPaymentRecoveryService(db, options.config ?? hosted, reconciliation),
    calls,
    queries,
  };
}

test("Hubtel recovery always waits at least five minutes after checkout initiation", () => {
  assert.equal(HUBTEL_MIN_RECOVERY_AGE_SECONDS, 300);
  assert.equal(hubtelRecoveryCutoff(clock, 120).toISOString(), "2026-11-20T14:55:00.000Z");
  assert.equal(hubtelRecoveryCutoff(clock, 900).toISOString(), "2026-11-20T14:45:00.000Z");
  for (const invalid of [0, -1, 1.2, 86401, Number.NaN])
    assert.throws(() => hubtelRecoveryCutoff(clock, invalid));
});

test("default preview selects bounded, pending, unsettled hosted attempts without any provider request", async () => {
  const { service, calls, queries } = fakeService();
  const result = await service.run(false, clock);
  assert.deepEqual(result, { enabled: true, dryRun: true, eligible: 2, attempted: 0, matched: 0, exceptions: 0, errors: 0 });
  assert.deepEqual(calls, []);
  assert.equal(queries.length, 1);
  const query = queries[0] as { where: Record<string, unknown>; take: number; orderBy: unknown[] };
  assert.equal(query.take, HUBTEL_RECOVERY_BATCH_LIMIT);
  assert.equal(query.where.provider, "hubtel");
  assert.equal(query.where.method, "hosted_checkout");
  assert.deepEqual(query.where.status, { in: ["initiated", "pending"] });
  assert.equal(query.where.settlementState, "unsettled");
  assert.deepEqual(query.where.order, { paymentStatus: { in: ["pending", "unpaid"] } });
  assert.deepEqual(query.where.createdAt, { lte: new Date("2026-11-20T14:55:00Z") });
  assert.deepEqual(query.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
});

test("execution only invokes independent reconciliation, not any new checkout or refund", async () => {
  const { service, calls } = fakeService({ responses: ["matched", "exception"] });
  const report = await service.run(true, clock);
  assert.deepEqual(calls, ["attempt-a", "attempt-b"]);
  assert.deepEqual(report, { enabled: true, dryRun: false, eligible: 2, attempted: 2, matched: 1, exceptions: 1, errors: 0 });
});

test("unknown provider errors are counted, never misreported as successful settlement", async () => {
  const { service } = fakeService({ responses: ["throws", "matched"] });
  const report = await service.run(true, clock);
  assert.equal(report.attempted, 2);
  assert.equal(report.matched, 1);
  assert.equal(report.errors, 1);
});

test("disabled or Direct Request Money provider cannot be swept even on execution", async () => {
  for (const config of [
    { ...hosted, payments: null },
    { ...hosted, payments: { providerId: "paystack", enabledMethods: ["hosted_checkout"], reconcileAfterSeconds: 120 } },
    { ...hosted, payments: { providerId: "hubtel", enabledMethods: ["mobile_money"], reconcileAfterSeconds: 120 } },
    { ...hosted, hubtelPayment: null },
  ]) {
    const { service, queries, calls } = fakeService({ config: config as unknown as ApiConfig });
    const report = await service.run(true, clock);
    assert.equal(report.enabled, false);
    assert.equal(report.attempted, 0);
    assert.deepEqual(queries, []);
    assert.deepEqual(calls, []);
  }
});
