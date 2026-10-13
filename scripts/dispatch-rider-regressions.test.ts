/// <reference types="bun-types" />
/**
 * Dispatch + Rider production-readiness regressions (2026-10-13).
 *
 * Domain rules under test (aligned with Fulfilment + Stock Handover
 * Authority #12):
 * 1.  rider pickup does not mutate stock
 * 2.  dispatch assignment does not mutate stock
 * 3.  COD delivery does not automatically mark payment succeeded
 * 4.  return-to-store does not restore available stock
 * 5.  busy rider is not assignable
 * 6.  assigned job belongs only to that rider
 * 7.  proof is required for delivery completion
 * 8.  failed delivery requires a reason
 * 9.  reschedule state renders correctly (data contract)
 * 10. no fake ETA/location appears in any projection
 * 11. API error leaves safe state (no partial mutation)
 * 12. double-submit protection (transitions reject repeats)
 * 13. backend allowedActions controls action visibility when supplied
 * 14. responsive usability is covered by scripts/responsive-sweep.mjs (DOM)
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { getStore, resetStore, type VgStore } from "../src/services/mock/store";
import { handleApi } from "../src/services/mock/router";
import { sellablePhysical } from "../src/services/mock/engine/availability";
import { markDispatched, mustOrder } from "../src/services/mock/engine/orders";

beforeEach(() => resetStore());

async function req(path: string, body?: Record<string, unknown>, query?: Record<string, string>) {
  const q = new URLSearchParams(query ?? {});
  const r = await handleApi({
    path,
    method: body !== undefined ? "POST" : "GET",
    query: q,
    body: body ?? {},
  });
  return r.json as { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } };
}

const okData = <T,>(r: Awaited<ReturnType<typeof req>>): T => (r as { ok: true; data: T }).data;

const firstLineVariant = (store: VgStore, orderId: string): string => {
  const order = mustOrder(store, orderId);
  const lineId = order.lines[0];
  return store.orderLines.find((l) => l.id === lineId)!.variantId;
};

describe("dispatch/rider domain corrections — stock boundary", () => {
  test("1. rider pickup does not mutate stock (consumed exactly once at handover)", async () => {
    const store = getStore();
    // ord_1015 is the canonical handed-over awaiting-assignment order
    const order = mustOrder(store, "ord_1015");
    expect(order.stockConsumedAt).toBeTruthy(); // consumed at the handover
    const variantId = firstLineVariant(store, "ord_1015");
    const before = sellablePhysical(store, variantId);

    // assign → accept → pickup
    await req("admin.dispatch.assign", { orderId: "ord_1015", riderId: "rdr_abena", actor: "stf_dela" });
    await req("rider.action", { action: "accept", riderId: "rdr_abena", jobId: store.deliveryJobs.find((j) => j.orderId === "ord_1015")!.id });
    const pickup = await req("rider.action", { action: "pickup", riderId: "rdr_abena", jobId: store.deliveryJobs.find((j) => j.orderId === "ord_1015")!.id });
    expect(pickup.ok).toBe(true);
    expect(sellablePhysical(store, variantId)).toBe(before); // custody only
  });

  test("2. dispatch assignment does not mutate stock and never rewrites fulfilment status", async () => {
    const store = getStore();
    const variantId = firstLineVariant(store, "ord_1015");
    const before = sellablePhysical(store, variantId);
    const r = await req("admin.dispatch.assign", { orderId: "ord_1015", riderId: "rdr_kofi", actor: "stf_dela" });
    expect(r.ok).toBe(true);
    const order = mustOrder(store, "ord_1015");
    expect(order.fulfilmentStatus).toBe("dispatched"); // assignment is NOT the handover
    expect(order.stockConsumedAt).toBeTruthy();
    expect(sellablePhysical(store, variantId)).toBe(before);
  });

  test("assignment before handover is rejected (packed orders are not assignable)", async () => {
    // ord_1017 is packed, NOT yet handed over
    const r = await req("admin.dispatch.assign", { orderId: "ord_1017", riderId: "rdr_abena", actor: "stf_dela" });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: { message: string } }).error.message).toContain("handover");
  });

  test("the fulfilment handover is the single stock-consumption event", async () => {
    const store = getStore();
    const variantId = firstLineVariant(store, "ord_1017");
    const line = store.orderLines.find((l) => l.variantId === variantId && l.orderId === "ord_1017")!;
    const before = sellablePhysical(store, variantId);
    markDispatched(store, "ord_1017", "stf_dela");
    const order = mustOrder(store, "ord_1017");
    expect(order.fulfilmentStatus).toBe("dispatched");
    expect(order.stockConsumedAt).toBeTruthy();
    expect(Number(sellablePhysical(store, variantId))).toBe(Number(before) - Number(line.quantity));
    // a repeat handover is an ignored no-op — never a second deduction
    markDispatched(store, "ord_1017", "stf_dela");
    expect(order.fulfilmentStatus).toBe("dispatched");
    expect(Number(sellablePhysical(store, variantId))).toBe(Number(before) - Number(line.quantity));
  });

  test("3. COD delivery never marks payment succeeded and records no collection state", async () => {
    const store = getStore();
    const job = store.deliveryJobs.find((j) => j.id === "job_5001")!; // COD, out for delivery
    const order = mustOrder(store, job.orderId);
    expect(order.paymentMethod).toBe("cash_on_delivery");
    const r = await req("rider.action", {
      action: "deliver", riderId: "rdr_yaw", jobId: "job_5001",
      proofMethod: "pin", proofDetail: "2468",
    });
    expect(r.ok).toBe(true);
    expect(order.fulfilmentStatus).toBe("delivered");
    expect(order.paymentStatus).toBe("unpaid"); // the future COD authority owns payment
    expect(job.cashToCollectMinor).toBeGreaterThan(0); // context stays visible
  });

  test("4. return-to-store does not restore sellable stock", async () => {
    const store = getStore();
    // job_5002 is rescheduled after failure; ord_1008 was consumed at handover
    const variantId = firstLineVariant(store, "ord_1008");
    const before = sellablePhysical(store, variantId);
    const r = await req("admin.dispatch.job.action", {
      action: "return_to_store", jobId: "job_5002", note: "customer unreachable", actor: "stf_dela",
    });
    expect(r.ok).toBe(true);
    expect(store.deliveryJobs.find((j) => j.id === "job_5002")!.status).toBe("return_to_store");
    expect(sellablePhysical(store, variantId)).toBe(before); // goods await Returns inspection
  });

  test("5. busy rider is not assignable", async () => {
    const store = getStore();
    const busy = store.riders.find((r) => r.id === "rdr_yaw")!;
    expect(busy.activeJobId).toBeTruthy(); // busy, not merely off
    const r = await req("admin.dispatch.assign", { orderId: "ord_1015", riderId: "rdr_yaw", actor: "stf_dela" });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: { message: string } }).error.message).toContain("active delivery");
  });

  test("a busy rider stays busy (never presented as assignable)", async () => {
    const store = getStore();
    const r = await req("admin.riders");
    const rows = okData<{ id: string; isAvailable: boolean; activeJobId?: string; unavailableReason?: string }[]>(r);
    const yaw = rows.find((x) => x.id === "rdr_yaw")!;
    expect(yaw.isAvailable).toBe(false);
    expect(yaw.activeJobId).toBeTruthy();
    expect(yaw.unavailableReason).toContain("active delivery");
  });
});

describe("dispatch/rider ownership + safety", () => {
  test("6. assigned job belongs only to that rider (actions + reads)", async () => {
    // job_5001 belongs to rdr_yaw; another rider must be FORBIDDEN
    const act = await req("rider.action", { action: "out", riderId: "rdr_kwabena", jobId: "job_5001" });
    expect(act.ok).toBe(false);
    expect((act as { ok: false; error: { code: string } }).error.code).toBe("FORBIDDEN");
    const read = await req("rider.action", { action: "note", riderId: "rdr_kwabena", jobId: "job_5001", note: "hi" });
    expect(read.ok).toBe(false);
    expect((read as { ok: false; error: { code: string } }).error.code).toBe("FORBIDDEN");
    const view = await req("rider.job", undefined, { jobId: "job_5001", riderId: "rdr_kwabena" });
    expect(view.ok).toBe(false);
    expect((view as { ok: false; error: { code: string } }).error.code).toBe("FORBIDDEN");
  });

  test("7. proof is required for delivery completion", async () => {
    const store = getStore();
    const r = await req("rider.action", {
      action: "deliver", riderId: "rdr_yaw", jobId: "job_5001",
      proofMethod: "pin", proofDetail: "   ",
    });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: { message: string } }).error.message).toContain("Proof");
    expect(store.deliveryJobs.find((j) => j.id === "job_5001")!.status).toBe("out_for_delivery");
  });

  test("8. failed delivery requires a reason", async () => {
    const store = getStore();
    const r = await req("rider.action", { action: "fail", riderId: "rdr_yaw", jobId: "job_5001", reason: "" });
    expect(r.ok).toBe(false);
    expect(store.deliveryJobs.find((j) => j.id === "job_5001")!.status).toBe("out_for_delivery");
  });

  test("11. API error leaves safe state — a rejected deliver mutates nothing", async () => {
    const store = getStore();
    const order = mustOrder(store, "ord_1003");
    const statusBefore = store.deliveryJobs.find((j) => j.id === "job_5001")!.status;
    await req("rider.action", { action: "deliver", riderId: "rdr_yaw", jobId: "job_5001", proofMethod: "pin", proofDetail: "" });
    expect(store.deliveryJobs.find((j) => j.id === "job_5001")!.status).toBe(statusBefore);
    expect(store.deliveryJobs.find((j) => j.id === "job_5001")!.proof).toBeUndefined();
    expect(order.fulfilmentStatus).toBe("dispatched");
  });

  test("12. double-submit protection — identical repeats are no-ops; different proof is a conflict", async () => {
    const store = getStore();
    // deliver once
    const first = await req("rider.action", { action: "deliver", riderId: "rdr_yaw", jobId: "job_5001", proofMethod: "pin", proofDetail: "2468" });
    expect(first.ok).toBe(true);
    const job = store.deliveryJobs.find((j) => j.id === "job_5001")!;
    const eventsAfterFirst = job.events.length;
    const proofAt = job.proof!.at;
    // identical repeat (network retry): idempotent no-op — no new events, no proof rewrite
    const second = await req("rider.action", { action: "deliver", riderId: "rdr_yaw", jobId: "job_5001", proofMethod: "pin", proofDetail: "2468" });
    expect(second.ok).toBe(true);
    expect(job.status).toBe("delivered");
    expect(job.events.length).toBe(eventsAfterFirst);
    expect(job.proof!.at).toBe(proofAt);
    // different proof on a delivered job: rejected — recorded proof is never overwritten
    const conflict = await req("rider.action", { action: "deliver", riderId: "rdr_yaw", jobId: "job_5001", proofMethod: "pin", proofDetail: "9999" });
    expect(conflict.ok).toBe(false);
    expect((conflict as { ok: false; error: { code: string } }).error.code).toBe("CONFLICT");
    expect(job.proof!.detail).toBe("2468");
    // double assignment also rejects
    await req("admin.dispatch.assign", { orderId: "ord_1015", riderId: "rdr_abena", actor: "stf_dela" });
    const again = await req("admin.dispatch.assign", { orderId: "ord_1015", riderId: "rdr_kofi", actor: "stf_dela" });
    expect(again.ok).toBe(false);
  });
});

describe("dispatch/rider projections — honest data contract", () => {
  test("9. reschedule state renders correctly (data + allowedActions)", async () => {
    const store = getStore();
    // fail then reschedule a job through the real flow
    await req("rider.action", { action: "fail", riderId: "rdr_yaw", jobId: "job_5001", reason: "Customer unavailable — not at address" });
    await req("admin.dispatch.job.action", { action: "reschedule", jobId: "job_5001", when: "tomorrow 16:00–18:00", actor: "stf_dela" });
    const q = okData<{
      jobs: { id: string; status: string; failureReason?: string; rescheduledFor?: string; allowedActions?: string[] }[];
    }>(await req("admin.dispatch.queue"));
    const job = q.jobs.find((j) => j.id === "job_5001")!;
    expect(job.status).toBe("rescheduled");
    expect(job.rescheduledFor).toContain("16:00");
    expect(job.failureReason).toContain("Customer unavailable");
    expect(job.allowedActions).toEqual(expect.arrayContaining(["reassign", "reschedule", "return_to_store"]));
    expect(job.allowedActions).not.toContain("unassign");
    // order delivery status mirrors the job
    expect(mustOrder(store, "ord_1003").deliveryStatus).toBe("rescheduled");
  });

  test("10. no fake ETA / GPS / tracking fields appear in any projection", async () => {
    const jobView = okData<Record<string, unknown>>(await req("rider.job", undefined, { jobId: "job_5001", riderId: "rdr_yaw" }));
    for (const key of Object.keys(jobView)) {
      expect(key.toLowerCase()).not.toMatch(/^(eta|lat|lng|latitude|longitude|gpscoords|distancem|speed|heading)$/);
    }
    const queue = okData<{ jobs: Record<string, unknown>[]; riders: Record<string, unknown>[]; providers: { id: string; status: string }[] }>(await req("admin.dispatch.queue"));
    for (const row of [...queue.jobs, ...queue.riders]) {
      for (const key of Object.keys(row)) {
        expect(key.toLowerCase()).not.toMatch(/^(eta|lat|lng|latitude|longitude|gpscoords|distancem|speed|heading)$/);
      }
    }
    // every non-inhouse provider stays honestly not_connected
    for (const p of queue.providers.filter((p) => p.id !== "prv_inhouse")) {
      expect(p.status).toBe("not_connected");
    }
    // rider location is consent-based demo only, never asserted as live
    const jobs = okData<{ rider: { lastLocationLabel?: string } | null }>(await req("rider.jobs", undefined, { riderId: "rdr_yaw" }));
    expect(jobs.rider?.lastLocationLabel ?? "").toContain("demo");
  });

  test("13. backend allowedActions controls action visibility when supplied", async () => {
    const store = getStore();
    const q = okData<{
      ready: { reference: string; allowedActions?: string[]; blockers?: string[]; handedOverAt?: string; stockConsumedAt?: string }[];
      jobs: { id: string; status: string; allowedActions?: string[]; blockers?: string[] }[];
    }>(await req("admin.dispatch.queue"));
    // ready rows carry assign + handover provenance
    const ready = q.ready.find((r) => r.reference === "VG-5H7C3V")!;
    expect(ready.allowedActions).toEqual(["assign"]);
    expect(ready.handedOverAt).toBeTruthy();
    expect(ready.stockConsumedAt).toBeTruthy();
    expect(ready.blockers).toEqual([]);
    // out_for_delivery job only allows return_to_store
    const outJob = q.jobs.find((j) => j.id === "job_5001")!;
    expect(outJob.allowedActions).toEqual(["return_to_store"]);
    // delivered job is terminal
    const done = q.jobs.find((j) => j.id === "job_5003")!;
    expect(done.allowedActions).toEqual([]);
    expect(done.blockers).toContain("terminal_status");
    // a payment-pending dispatched order is blocked from assignment
    const order = store.orders.find((o) => o.id === "ord_1002")!;
    order.fulfilmentStatus = "dispatched";
    order.stockConsumedAt = new Date().toISOString();
    const q2 = okData<{ ready: { reference: string; blockers?: string[]; allowedActions?: string[] }[] }>(await req("admin.dispatch.queue"));
    const blocked = q2.ready.find((r) => r.reference === "VG-3P7K2D");
    expect(blocked).toBeDefined();
    expect(blocked!.blockers!.length).toBeGreaterThan(0);
    expect(blocked!.allowedActions).toEqual([]);
  });

  test("rider jobs response carries honest COD context, never a remittance ledger", async () => {
    const r = await req("rider.jobs", undefined, { riderId: "rdr_yaw" });
    const data = okData<{ codCash: { jobsWithCash: number; totalDueLabel: string; note: string }; remittance?: unknown }>(r);
    expect(data.codCash).toBeDefined();
    expect(data.codCash.jobsWithCash).toBeGreaterThan(0);
    expect(data.codCash.note).toContain("not yet connected");
    expect((data as Record<string, unknown>).remittance).toBeUndefined();
  });

  test("rider history exposes COD-due context without collected/remitted states", async () => {
    const rows = okData<Record<string, unknown>[]>(await req("rider.history", undefined, { riderId: "rdr_yaw" }));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.cashCollected).toBeUndefined();
      expect(row.remitted).toBeUndefined();
      // COD amounts appear only as due-on-delivery context, never as collection state
      expect(row.cashToCollectMinor === undefined || (row.cashToCollectMinor as number) > 0).toBe(true);
    }
  });

  test("unassign returns an assigned job to the queue and frees the rider", async () => {
    const store = getStore();
    await req("admin.dispatch.assign", { orderId: "ord_1015", riderId: "rdr_abena", actor: "stf_dela" });
    const jobId = store.deliveryJobs.find((j) => j.orderId === "ord_1015")!.id;
    const r = await req("admin.dispatch.job.action", { action: "unassign", jobId, note: "rider unavailable", actor: "stf_dela" });
    expect(r.ok).toBe(true);
    const job = store.deliveryJobs.find((j) => j.id === jobId)!;
    expect(job.status).toBe("unassigned");
    expect(job.riderId).toBeUndefined();
    expect(store.riders.find((x) => x.id === "rdr_abena")!.isAvailable).toBe(true);
    // order stays handed-over — unassignment never reverses the stock event
    expect(mustOrder(store, "ord_1015").fulfilmentStatus).toBe("dispatched");
    expect(mustOrder(store, "ord_1015").stockConsumedAt).toBeTruthy();
  });

  test("reassign moves an active job to a new rider in one action", async () => {
    const store = getStore();
    await req("admin.dispatch.assign", { orderId: "ord_1015", riderId: "rdr_abena", actor: "stf_dela" });
    const jobId = store.deliveryJobs.find((j) => j.orderId === "ord_1015")!.id;
    const r = await req("admin.dispatch.job.action", { action: "reassign", jobId, riderId: "rdr_kofi", actor: "stf_dela" });
    expect(r.ok).toBe(true);
    const job = store.deliveryJobs.find((j) => j.id === jobId)!;
    expect(job.riderId).toBe("rdr_kofi");
    expect(job.status).toBe("assigned");
    expect(store.riders.find((x) => x.id === "rdr_abena")!.isAvailable).toBe(true);
    expect(store.riders.find((x) => x.id === "rdr_kofi")!.activeJobId).toBe(jobId);
  });

  test("rider availability cannot change while a job is active", async () => {
    const r = await req("admin.riders.toggle", { riderId: "rdr_yaw", available: false, actor: "stf_dela" });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: { message: string } }).error.message).toContain("active job");
  });
});
