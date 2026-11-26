import test from "node:test";
import assert from "node:assert/strict";
import { isHostedRecoveryCandidate, isVerifiedHostedRecovery, type HostedRecoveryAttempt } from "../src/payments/hosted-payment-recovery";
import type { PaymentProviderObservation } from "../src/payments/payment-provider";
import { PaymentReconciliationService } from "../src/payments/payment-reconciliation.service";
import type { Database } from "../src/database/database";
import type { ApiConfig } from "../src/config";
import type { PaymentProviderRegistry } from "../src/payments/payment-provider.registry";
import type { PaymentOutcomeService } from "../src/payments/payment-outcome.service";

const attempt: HostedRecoveryAttempt = {
  provider: "hubtel", method: "hosted_checkout", status: "pending", initiationState: "accepted",
  settlementState: "unsettled", merchantReference: "fixture-reference", providerRef: null, amountMinor: 100, currency: "GHS",
};
const paid: PaymentProviderObservation = {
  providerId: "hubtel", merchantReference: attempt.merchantReference,
  providerReference: "fixture-provider-transaction", state: "succeeded", amountMinor: 100, currency: "GHS",
};
test("hosted recovery only permits independently matched terminal paid proof", () => {
  assert.equal(isHostedRecoveryCandidate(attempt), true);
  assert.equal(isVerifiedHostedRecovery(attempt, paid), true);
  for (const patch of [
    {state:"pending" as const}, {state:"unknown" as const}, {state:"failed" as const}, {state:"expired" as const},
    {merchantReference:"unrelated"}, {providerReference:undefined}, {providerReference:" "},
    {amountMinor:99}, {amountMinor:undefined}, {currency:undefined}, {providerId:"other"},
  ]) assert.equal(isVerifiedHostedRecovery(attempt,{...paid,...patch}),false);
  for (const patch of [
    {method:"mobile_money"}, {status:"succeeded"}, {settlementState:"exception"},
    {initiationState:"uncertain"}, {providerRef:"different"}, {currency:"USD"}, {amountMinor:0},
  ]) assert.equal(isVerifiedHostedRecovery({...attempt,...patch},paid),false);
});

function fixture(observation: PaymentProviderObservation | Error, stale = false) {
  const snapshot = {...attempt, id:"attempt-id", orderId:"order-id", version:1};
  let evidence = 0, writes = 0, lookups = 0;
  const tx = {
    $queryRaw: async () => [],
    paymentAttempt: {
      findUnique: async () => stale ? {...snapshot,version:2,status:"succeeded"} : snapshot,
      update: async () => { writes++; throw Error("unexpected update"); },
    },
    order: { update: async () => { writes++; throw Error("unexpected update"); } },
    paymentReconciliation: { create: async () => { evidence++; } },
  };
  const db = {
    paymentAttempt:{findUnique:async () => snapshot},
    $transaction: async (fn: (value:typeof tx)=>Promise<unknown>) => fn(tx),
  };
  const registry = { requireConfigured:() => ({id:"hubtel",lookup:async () => {
    lookups++; if(observation instanceof Error)throw observation; return observation;
  }}) };
  const outcomes = { apply: async () => { writes++; throw Error("unexpected outcome"); } };
  const service = new PaymentReconciliationService(db as unknown as Database,
    {payments:{requestTimeoutMs:1000}} as ApiConfig, registry as unknown as PaymentProviderRegistry,
    outcomes as unknown as PaymentOutcomeService);
  return {service, counts:() => ({evidence,writes,lookups})};
}

test("unknown, pending and mismatched observations defer with evidence and no state mutations", async () => {
  for (const observation of [new Error("timeout"),{...paid,state:"pending" as const},{...paid,amountMinor:99}]) {
    const f=fixture(observation);
    assert.equal((await f.service.reconcile("attempt-id","worker","worker","request-id")).result,"deferred");
    assert.deepEqual(f.counts(),{evidence:1,writes:0,lookups:1});
  }
});

test("stale worker snapshot cannot overwrite a webhook-confirmed payment",async () => {
  const f=fixture(paid,true);
  assert.equal((await f.service.reconcile("attempt-id","worker","worker","request-id")).result,"deferred");
  assert.deepEqual(f.counts(),{evidence:0,writes:0,lookups:1});
});
