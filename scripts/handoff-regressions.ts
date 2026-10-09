/**
 * Handoff regression suite — the seven domain defects from the independent
 * review plus the staff returns-list endpoint, as executable assertions.
 * Run: bun scripts/handoff-regressions.ts
 *
 * Each scenario uses a fresh seeded store and the repository's actual engine
 * functions / router. Exit code 0 = all regressions pass.
 */

import { getStore, resetStore } from "../src/services/mock/store";
import { handleApi } from "../src/services/mock/router";
import { resolveReviewOrder, consumeOrderStock, createOnlineOrder } from "../src/services/mock/engine/orders";
import { availability, sellablePhysical } from "../src/services/mock/engine/availability";
import { createReturn, decideReturn, receiveReturn, inspectReturn, eligibleReturnLines, requestRefund, approveRefund, executeRefund, retryRefund, refundedSoFar } from "../src/services/mock/engine/returns";
import { completeSale } from "../src/services/mock/engine/pos";
import { addQty } from "../src/lib/quantity";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`FAIL: ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function fresh() {
  resetStore();
  return getStore();
}

function expectThrow(fn: () => unknown): { thrown: boolean; code?: string; message?: string } {
  try {
    fn();
    return { thrown: false };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { thrown: true, code: err.code, message: err.message };
  }
}

/* 1. Cancellation review must not claim an unexecuted refund */
{
  const s = fresh();
  const order = resolveReviewOrder(s, "ord_1013", "stf_ama", "cancel_refund", "Regression run");
  const linked = s.refunds.filter((r) => r.orderId === order.id);
  const succeeded = linked.filter((r) => r.status === "succeeded");
  assert(
    "1a. cancel-with-refund no longer marks the payment refunded before money moves",
    order.paymentStatus === "refund_pending",
    `paymentStatus=${order.paymentStatus}`
  );
  assert(
    "1b. a linked, executable refund request is recorded (no physical return needed)",
    linked.length === 1 && linked[0].status === "awaiting_approval" && linked[0].amountMinor === order.totalMinor,
    `refund=${linked[0]?.status} ₵${linked[0]?.amountMinor}`
  );
  assert("1c. zero completed refunds at cancellation time", succeeded.length === 0);
  // the recorded path is executable: approve → execute flips the payment to refunded
  approveRefund(s, linked[0].id, "stf_serwaa");
  executeRefund(s, linked[0].id, "stf_serwaa"); // first attempt: demo provider failure
  retryRefund(s, linked[0].id, "stf_serwaa");
  executeRefund(s, linked[0].id, "stf_serwaa");
  assert(
    "1d. executing the linked refund then (and only then) marks the payment refunded",
    order.paymentStatus === "refunded",
    `paymentStatus=${order.paymentStatus}`
  );
}

/* 2. Repeating inspection must not increase restocked quantity twice */
{
  const s = fresh();
  decideReturn(s, "ret_2002", "approve", "stf_ama", "Regression run");
  receiveReturn(s, "ret_2002", "stf_ama");
  const ret = s.returnRequests.find((r) => r.id === "ret_2002")!;
  const rl = s.returnLines.find((l) => l.id === ret.lines[0])!;
  const line = s.orderLines.find((l) => l.id === rl.orderLineId)!;
  const before = sellablePhysical(s, line.variantId);
  inspectReturn(s, ret.id, "restock_saleable", "stf_ama", "Regression run");
  const afterFirst = sellablePhysical(s, line.variantId);
  const firstLotId = ret.disposition?.lotId;
  const replayed = inspectReturn(s, ret.id, "restock_saleable", "stf_ama", "Regression run (retry)");
  const afterRepeat = sellablePhysical(s, line.variantId);
  assert(
    "2a. first saleable inspection restocks exactly once",
    addQty(before, rl.quantity) === afterFirst,
    `${before} → ${afterFirst}`
  );
  assert(
    "2b. repeated inspection with the same disposition returns the recorded result without new stock",
    afterRepeat === afterFirst && replayed.disposition?.lotId === firstLotId,
    `after repeat=${afterRepeat}`
  );
  // disposition change reconciles the previous stock effect instead of adding a copy
  inspectReturn(s, ret.id, "damaged_unsaleable", "stf_ama", "Reclassified after recheck");
  const afterReclass = sellablePhysical(s, line.variantId);
  assert(
    "2c. a disposition change reverses the prior restock (no cumulative copies)",
    afterReclass === before,
    `after reclassify=${afterReclass} (original ${before})`
  );
  assert(
    "2d. the reversal is recorded as a movement, not silently dropped",
    s.movements.some((m) => m.reference === ret.id && m.reason === "adjustment" && m.note?.includes("reversed")),
    "reversal movement present"
  );
}

/* 3. Duplicate lines in one return must respect the cumulative quantity limit */
{
  const s = fresh();
  const order = s.orders.find((o) => o.id === "ord_1014")!;
  const eligible = eligibleReturnLines(s, order)[0];
  const dup = expectThrow(() =>
    createReturn(s, {
      orderId: order.id,
      requestedBy: "staff",
      lines: [1, 2].map(() => ({ orderLineId: eligible.line.id, quantity: eligible.eligible, reason: "Regression run" })),
    })
  );
  assert(
    "3a. duplicate order-line references in one request are rejected",
    dup.thrown && dup.code === "REFUND_LIMIT_EXCEEDED",
    `code=${dup.code}`
  );
  assert(
    "3b. eligibility is unchanged after the rejected request (validated before mutation)",
    eligibleReturnLines(s, order)[0].eligible === eligible.eligible,
    `eligible=${eligibleReturnLines(s, order)[0].eligible}`
  );
}

/* 4. One return must not be refunded twice */
{
  const s = fresh();
  const ret = decideReturn(s, "ret_2002", "approve", "stf_ama", "Regression run");
  const first = s.refunds.find((r) => r.returnId === ret.id)!;
  approveRefund(s, first.id, "stf_serwaa");
  executeRefund(s, first.id, "stf_serwaa");
  retryRefund(s, first.id, "stf_serwaa");
  executeRefund(s, first.id, "stf_serwaa");
  const cumulative = refundedSoFar(s, ret.orderId);
  const second = expectThrow(() => requestRefund(s, ret.id, "stf_serwaa", "mobile_money"));
  assert(
    "4a. a second refund request on a fully refunded return is rejected",
    second.thrown && second.code === "REFUND_LIMIT_EXCEEDED",
    `code=${second.code}`
  );
  assert(
    "4b. cumulative refunded amount is unchanged by the rejected request",
    refundedSoFar(s, ret.orderId) === cumulative && cumulative === first.amountMinor,
    `cumulative=${cumulative}`
  );
}

/* 5. Stock handover must fail when its reservation was already released */
{
  const s = fresh();
  const o = s.orders.find((x) => x.id === "ord_1011")!;
  const holds = s.reservations.filter((r) => r.orderId === o.id);
  for (const r of holds) {
    r.releasedAt = new Date().toISOString();
    r.releasedReason = "expired";
  }
  const lotsBefore = s.lots.map((l) => l.quantity).join("|");
  const outcome = expectThrow(() => consumeOrderStock(s, o, "stf_ama"));
  assert(
    "5a. consumption is rejected when reservations no longer cover the order",
    outcome.thrown && outcome.code === "RESERVATION_LOST",
    `code=${outcome.code}`
  );
  assert(
    "5b. no consumption timestamp is recorded and physical stock is untouched",
    !o.stockConsumedAt && s.lots.map((l) => l.quantity).join("|") === lotsBefore
  );
}

/* 6. Quantity validation must reject invalid counter sales */
{
  const s = fresh();
  const before = sellablePhysical(s, "var_tof_1");
  const negative = expectThrow(() =>
    completeSale(s, {
      sessionId: "cash_02",
      cashierId: "stf_adjoa",
      lines: [{ variantId: "var_tof_1", quantity: "-3" }],
      method: "cash_counter",
      cashReceivedMinor: 0,
      idempotencyKey: "reg-negative-quantity",
    })
  );
  assert("6a. negative quantities are rejected", negative.thrown && negative.code === "VALIDATION_FAILED", `code=${negative.code}`);
  assert("6b. physical stock unchanged by the rejected sale", sellablePhysical(s, "var_tof_1") === before);

  const badPrecision = expectThrow(() =>
    completeSale(s, {
      sessionId: "cash_02",
      cashierId: "stf_adjoa",
      lines: [{ variantId: "var_tof_1", quantity: "1.2345" }],
      method: "cash_counter",
      cashReceivedMinor: 500,
      idempotencyKey: "reg-bad-precision",
    })
  );
  assert("6c. quantities with more than three decimal places are rejected", badPrecision.thrown, `code=${badPrecision.code}`);

  const badMethod = expectThrow(() =>
    completeSale(s, {
      sessionId: "cash_02",
      cashierId: "stf_adjoa",
      lines: [{ variantId: "var_tof_1", quantity: "1" }],
      method: "cash_on_delivery" as never,
      cashReceivedMinor: undefined,
      idempotencyKey: "reg-bad-method",
    })
  );
  assert("6d. unsupported counter payment methods are rejected", badMethod.thrown, `code=${badMethod.code}`);

  const onlineNegative = expectThrow(() =>
    createOnlineOrder(s, {
      lines: [{ variantId: "var_tof_1", quantity: "-1" }],
      customerName: "Regression",
      customerPhone: "+233200000001",
      fulfilment: "collection",
      paymentMethod: "cash_counter",
      idempotencyKey: "reg-online-negative",
    })
  );
  assert("6e. online checkout applies the same quantity rules", onlineNegative.thrown, `code=${onlineNegative.code}`);
}

/* 7. Repeated online checkout must return the original order without a second hold */
{
  const s = fresh();
  const input = {
    lines: [{ variantId: "var_tof_1", quantity: "1" }],
    customerName: "Regression demo",
    customerPhone: "+233200000001",
    fulfilment: "collection" as const,
    paymentMethod: "cash_counter" as const,
    idempotencyKey: "reg-checkout-replay",
  };
  const before = availability(s, "var_tof_1").reserved;
  const first = createOnlineOrder(s, input);
  const afterFirst = availability(s, "var_tof_1").reserved;
  const second = createOnlineOrder(s, input);
  const afterRepeat = availability(s, "var_tof_1").reserved;
  assert(
    "7a. retrying with the same key replays the original order",
    first.order.id === second.order.id,
    `sameOrder=${first.order.id === second.order.id}`
  );
  assert(
    "7b. the replay creates no second reservation",
    afterFirst === afterRepeat && addQty(before, "1") === afterFirst,
    `reserved ${before} → ${afterFirst} → ${afterRepeat}`
  );
  const conflict = expectThrow(() =>
    createOnlineOrder(s, {
      ...input,
      lines: [{ variantId: "var_tof_1", quantity: "2" }],
    })
  );
  assert(
    "7c. reusing the key with different input fails with a clear conflict",
    conflict.thrown && conflict.code === "IDEMPOTENCY_CONFLICT",
    `code=${conflict.code}`
  );
}

/* 8. Staff returns endpoint serves its list without internal errors */
{
  fresh();
  const result = await handleApi({ path: "admin.returns", method: "GET", query: new URLSearchParams(), body: {} });
  const json = result.json as { ok: boolean; data?: unknown[]; error?: { code: string; message: string } };
  assert(
    "8a. admin.returns responds 200 with the full list",
    result.status === 200 && json.ok === true && Array.isArray(json.data) && json.data.length >= 1,
    `rows=${Array.isArray(json.data) ? json.data.length : 0}`
  );
  const row = (json.data?.[0] ?? {}) as Record<string, unknown>;
  assert(
    "8b. each row carries orderId and orderReference for links",
    typeof row.orderId === "string" && typeof row.reference === "string",
    `orderId=${row.orderId}`
  );
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed${failed ? " — " + failures.join("; ") : ""}`);
process.exit(failed === 0 ? 0 : 1);
