/**
 * Returns & refunds engine — first-class workflows for online and
 * counter orders. Guarantees:
 * - cumulative returned quantities never exceed the original eligible balance
 * - cumulative refunds never exceed the original paid amount
 * - only an approved saleable disposition makes returned stock purchasable again
 * - a refund request/approval is not a completed money transfer
 */

import type { Order, OrderLine, Refund, ReturnLine, ReturnRequest } from "@/types/domain";
import { addQty, cmpQty, subQty } from "@/lib/quantity";
import { nextId, nowIso } from "@/lib/id";
import type { VgStore } from "../store";
import { OpError, audit, orderEvent, mustOrder } from "./orders";
import { consumeNothing } from "./inventory-helpers";

export interface ReturnLineInput {
  orderLineId: string;
  quantity: string;
  reason: string;
}

export interface CreateReturnInput {
  orderId: string;
  lines: ReturnLineInput[];
  requestedBy: "customer" | "staff";
  customerId?: string;
  evidenceNote?: string;
}

/** Cumulative returned quantity per order line (from non-rejected returns). */
function returnedSoFar(store: VgStore, orderLineId: string): string {
  let sum = "0";
  for (const rl of store.returnLines) {
    const req = store.returnRequests.find((r) => r.id === rl.returnId);
    if (rl.orderLineId === orderLineId && req && req.status !== "rejected") {
      sum = addQty(sum, rl.quantity);
    }
  }
  return sum;
}

export function eligibleReturnLines(store: VgStore, order: Order): {
  line: OrderLine; quantity: string; returnedSoFar: string; eligible: string; unitRefundMinor: number;
}[] {
  return order.lines
    .map((lid) => store.orderLines.find((l) => l.id === lid)!)
    .filter(Boolean)
    .filter((l) => !l.substitutionOfLineId)
    .map((line) => {
      const already = returnedSoFar(store, line.id);
      const eligible = subQty(line.quantity, already);
      const unitRefundMinor = line.unitPriceMinor;
      return { line, quantity: line.quantity, returnedSoFar: already, eligible, unitRefundMinor };
    });
}

/** Cumulative committed amount per return: succeeded refunds plus unresolved attempts. */
function committedRefundMinor(store: VgStore, returnId: string): number {
  return store.refunds
    .filter((r) => r.returnId === returnId)
    .reduce((a, r) => a + r.amountMinor, 0);
}

/** Approved refundable amount for a return: approved line amounts, falling back to requested. */
function approvedRefundableMinor(store: VgStore, ret: ReturnRequest): number {
  return ret.lines
    .map((id) => store.returnLines.find((l) => l.id === id)!)
    .reduce((a, l) => a + (l.approvedRefundMinor ?? l.requestedRefundMinor), 0);
}

export function createReturn(store: VgStore, input: CreateReturnInput): ReturnRequest {
  const order = mustOrder(store, input.orderId);
  if (!["delivered", "collected"].includes(order.fulfilmentStatus)) {
    throw new OpError("VALIDATION_FAILED", "Returns are only possible after delivery or collection.");
  }
  if (!input.lines.length) throw new OpError("VALIDATION_FAILED", "Select at least one line to return.");
  const eligible = eligibleReturnLines(store, order);

  // Aggregate duplicate order-line references BEFORE validating: the cumulative
  // requested quantity must respect the remaining eligible balance for that line.
  const requested = new Map<string, string>();
  for (const l of input.lines) {
    requested.set(l.orderLineId, addQty(requested.get(l.orderLineId) ?? "0", l.quantity));
  }

  // Validate the WHOLE request before mutating returns, stock or sequences.
  for (const l of input.lines) {
    const match = eligible.find((e) => e.line.id === l.orderLineId);
    if (!match) throw new OpError("VALIDATION_FAILED", "Order line is not eligible for return.");
    if (cmpQty(l.quantity, "0") <= 0) throw new OpError("VALIDATION_FAILED", "Return quantity must be positive.");
    const total = requested.get(l.orderLineId)!;
    if (cmpQty(total, match.eligible) > 0) {
      throw new OpError(
        "REFUND_LIMIT_EXCEEDED",
        `Only ${match.eligible} × ${match.line.productName} (${match.line.variantName}) remain eligible for return (this request asks for ${total}).`
      );
    }
    if (!l.reason?.trim()) throw new OpError("VALIDATION_FAILED", "A reason is required for each returned line.");
  }

  const requestLines: ReturnLine[] = [];
  for (const l of input.lines) {
    const match = eligible.find((e) => e.line.id === l.orderLineId)!;
    requestLines.push({
      id: nextId("rl"),
      returnId: "", // set below
      orderLineId: l.orderLineId,
      quantity: l.quantity,
      reason: l.reason,
      requestedRefundMinor: match.unitRefundMinor * Number(l.quantity),
    });
  }

  const ret: ReturnRequest = {
    id: nextId("ret"),
    reference: `RTN-${store.sequences.rtn}`,
    orderId: order.id,
    channel: order.channel,
    customerId: order.customerId,
    requestedBy: input.requestedBy,
    lines: [],
    status: "requested",
    evidenceNote: input.evidenceNote,
    createdAt: nowIso(),
  };
  store.sequences.rtn += 1;
  for (const rl of requestLines) {
    rl.returnId = ret.id;
    store.returnLines.push(rl);
    ret.lines.push(rl.id);
  }
  store.returnRequests.unshift(ret);
  orderEvent(order, input.requestedBy === "staff" ? "staff" : "customer", `Return ${ret.reference} requested`);
  audit(store, input.requestedBy === "staff" ? input.requestedBy : input.customerId ?? "customer", "return.requested", "ReturnRequest", ret.id);
  return ret;
}

/* ------------------------------------------------------------------ */
/* Decisions & inspection                                              */
/* ------------------------------------------------------------------ */

export function decideReturn(store: VgStore, returnId: string, decision: "approve" | "reject", actor: string, note: string): ReturnRequest {
  const ret = mustReturn(store, returnId);
  if (ret.status !== "requested") throw new OpError("VALIDATION_FAILED", `Return is already ${ret.status}.`);
  if (!note.trim()) throw new OpError("VALIDATION_FAILED", "A decision note is required.");
  ret.status = decision === "approve" ? "approved" : "rejected";
  const order = mustOrder(store, ret.orderId);
  if (decision === "approve") {
    for (const rl of ret.lines.map((id) => store.returnLines.find((l) => l.id === id)!)) {
      rl.approvedRefundMinor = rl.requestedRefundMinor;
    }
    orderEvent(order, actor, `Return ${ret.reference} approved`, { note });
  } else {
    orderEvent(order, actor, `Return ${ret.reference} rejected`, { note });
  }
  audit(store, actor, `return.${decision === "approve" ? "approved" : "rejected"}`, "ReturnRequest", ret.id, { reason: note });
  return ret;
}

export function receiveReturn(store: VgStore, returnId: string, actor: string): ReturnRequest {
  const ret = mustReturn(store, returnId);
  if (ret.status !== "approved") throw new OpError("VALIDATION_FAILED", "Only approved returns can be received.");
  ret.status = "received";
  ret.receivedAt = nowIso();
  audit(store, actor, "return.received", "ReturnRequest", ret.id);
  return ret;
}

export type DispositionKind = "restock_saleable" | "damaged_unsaleable" | "quarantine_pending" | "not_returned";

/** Expiry carried from the original sale's lot allocations, so restocked groceries keep their date. */
function originalLotExpiry(store: VgStore, rl: ReturnLine): { expiryDate?: string; lotNumbers: string[] } {
  const line = store.orderLines.find((l) => l.id === rl.orderLineId);
  const lots = (line?.allocations ?? [])
    .map((a) => store.lots.find((x) => x.id === a.lotId))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const dates = lots.map((l) => l.expiryDate).filter((d): d is string => Boolean(d)).sort();
  return { expiryDate: dates[dates.length - 1], lotNumbers: lots.map((l) => l.lotNumber) };
}

/** Remove a lot created by a previous disposition and record the reversal honestly. */
function reverseDispositionLot(store: VgStore, ret: ReturnRequest, lotId: string, actor: string): void {
  const lot = store.lots.find((l) => l.id === lotId);
  if (!lot) return;
  store.lots = store.lots.filter((l) => l.id !== lotId);
  store.movements.push({
    id: nextId("mov"),
    variantId: lot.variantId,
    locationId: lot.locationId,
    lotId: lot.id,
    delta: `-${lot.quantity}`,
    resultingQty: "0",
    reason: "adjustment",
    reference: ret.id,
    actorId: actor,
    note: `Disposition change on ${ret.reference}: previous stock effect reversed`,
    at: nowIso(),
  });
}

export function inspectReturn(
  store: VgStore,
  returnId: string,
  disposition: DispositionKind,
  actor: string,
  note: string
): ReturnRequest {
  const ret = mustReturn(store, returnId);
  if (ret.status === "resolved") {
    throw new OpError("VALIDATION_FAILED", "This return is already resolved; its refund has completed.");
  }
  if (!note.trim()) throw new OpError("VALIDATION_FAILED", "An inspection note is required.");
  const prior = ret.disposition;

  if (ret.status === "inspected" && prior) {
    // The stock disposition is a once-only event per return.
    if (prior.kind === disposition) {
      return ret; // idempotent retry: return the recorded result, no second stock effect
    }
    // A disposition change must reconcile the previous stock effect, not add another copy.
    if (prior.lotId) reverseDispositionLot(store, ret, prior.lotId, actor);
  } else if (ret.status !== "received") {
    throw new OpError("VALIDATION_FAILED", "Return must be received before inspection.");
  }

  let createdLotId: string | undefined;
  if (disposition === "restock_saleable") {
    // returned goods enter a properly recorded new lot — saleable again,
    // carrying the expiry information of the original sale's lots
    for (const rl of ret.lines.map((id) => store.returnLines.find((l) => l.id === id)!)) {
      const line = store.orderLines.find((l) => l.id === rl.orderLineId)!;
      const origin = originalLotExpiry(store, rl);
      const lot = {
        id: nextId("lot"),
        variantId: line.variantId,
        locationId: "loc_store",
        lotNumber: `L-RET-${ret.reference}`,
        kind: "regular" as const,
        quantity: rl.quantity,
        receivedAt: nowIso(),
        expiryDate: origin.expiryDate,
        isQuarantined: false,
        notes: `Restocked from return ${ret.reference}${origin.lotNumbers.length ? ` (original lots: ${origin.lotNumbers.join(", ")})` : ""}`,
      };
      store.lots.push(lot);
      createdLotId = lot.id;
      store.movements.push({
        id: nextId("mov"),
        variantId: line.variantId,
        locationId: "loc_store",
        lotId: lot.id,
        delta: `+${rl.quantity}`,
        resultingQty: rl.quantity,
        reason: "return_restock",
        reference: ret.id,
        actorId: actor,
        note,
        at: nowIso(),
      });
    }
  } else if (disposition === "quarantine_pending") {
    for (const rl of ret.lines.map((id) => store.returnLines.find((l) => l.id === id)!)) {
      const line = store.orderLines.find((l) => l.id === rl.orderLineId)!;
      const lot = {
        id: nextId("lot"),
        variantId: line.variantId,
        locationId: "loc_quarantine",
        lotNumber: `L-QUA-${ret.reference}`,
        kind: "returns_quarantine" as const,
        quantity: rl.quantity,
        receivedAt: nowIso(),
        isQuarantined: true,
        notes: `Quarantined from return ${ret.reference}`,
      };
      store.lots.push(lot);
      createdLotId = lot.id;
    }
  } else if (disposition === "damaged_unsaleable") {
    for (const rl of ret.lines.map((id) => store.returnLines.find((l) => l.id === id)!)) {
      const line = store.orderLines.find((l) => l.id === rl.orderLineId)!;
      const lot = {
        id: nextId("lot"),
        variantId: line.variantId,
        locationId: "loc_backroom",
        lotNumber: `L-DMG-${ret.reference}`,
        kind: "damaged" as const,
        quantity: rl.quantity,
        receivedAt: nowIso(),
        isQuarantined: false,
        notes: `Unsaleable from return ${ret.reference}`,
      };
      store.lots.push(lot);
      createdLotId = lot.id;
    }
  }
  // "not_returned" never touches physical stock

  ret.status = "inspected";
  ret.inspectedAt = nowIso();
  ret.disposition = { kind: disposition, lotId: createdLotId, note, by: actor, at: nowIso() };
  audit(store, actor, "return.inspected", "ReturnRequest", ret.id, { reason: note, after: disposition });
  return ret;
}

/* ------------------------------------------------------------------ */
/* Refunds                                                             */
/* ------------------------------------------------------------------ */

export function refundedSoFar(store: VgStore, orderId: string): number {
  return store.refunds
    .filter((r) => r.orderId === orderId && r.status === "succeeded")
    .reduce((a, r) => a + r.amountMinor, 0);
}

export function refundPreview(store: VgStore, orderId: string): {
  paidMinor: number; refundedMinor: number; refundableMinor: number;
} {
  const order = mustOrder(store, orderId);
  const paid = ["succeeded", "partially_refunded", "refunded"].includes(order.paymentStatus) ? order.totalMinor : 0;
  const refunded = refundedSoFar(store, orderId);
  return { paidMinor: paid, refundedMinor: refunded, refundableMinor: Math.max(0, paid - refunded) };
}

export function requestRefund(store: VgStore, returnId: string, actor: string, method: Refund["method"]): Refund {
  const ret = mustReturn(store, returnId);
  if (!["approved", "received", "inspected", "resolved"].includes(ret.status)) {
    throw new OpError("VALIDATION_FAILED", "Refunds require an approved return.");
  }
  const existingUnresolved = store.refunds.find(
    (r) => r.returnId === returnId && ["requested", "awaiting_approval", "processing", "requires_review", "failed"].includes(r.status)
  );
  if (existingUnresolved) {
    throw new OpError("VALIDATION_FAILED", "A refund for this return is already in progress — retry or resolve that attempt instead of requesting another.");
  }
  // Per-return cap: amounts already refunded plus committed attempts must not
  // exceed the approved refundable amount for this return.
  const approvedMinor = approvedRefundableMinor(store, ret);
  const committedMinor = committedRefundMinor(store, returnId);
  if (committedMinor >= approvedMinor) {
    throw new OpError("REFUND_LIMIT_EXCEEDED", "This return has already been refunded in full; no further refund can be requested.");
  }
  const amount = approvedMinor - committedMinor;
  // Order-wide paid balance cap (excluding amounts already committed to this return's refunds).
  const preview = refundPreview(store, ret.orderId);
  const otherCommitted = store.refunds
    .filter((r) => r.orderId === ret.orderId && r.returnId !== returnId && r.status !== "succeeded" && r.status !== "failed")
    .reduce((a, r) => a + r.amountMinor, 0);
  if (amount > preview.refundableMinor - otherCommitted) {
    throw new OpError("REFUND_LIMIT_EXCEEDED", `Refund of ₵${(amount / 100).toFixed(2)} exceeds the refundable balance of ₵${(preview.refundableMinor / 100).toFixed(2)}.`);
  }
  const refund: Refund = {
    id: nextId("ref"),
    returnId,
    orderId: ret.orderId,
    amountMinor: amount,
    status: "awaiting_approval",
    method,
    reason: `Refund for return ${ret.reference}`,
    requestedBy: actor,
    retryCount: 0,
    createdAt: nowIso(),
  };
  store.refunds.unshift(refund);
  audit(store, actor, "refund.requested", "Refund", refund.id, { after: `${amount}` });
  return refund;
}

export function approveRefund(store: VgStore, refundId: string, actor: string): Refund {
  const refund = mustRefund(store, refundId);
  if (refund.status !== "awaiting_approval") throw new OpError("VALIDATION_FAILED", "Refund is not awaiting approval.");
  if (refund.method === "manual_recording") {
    // manual refunds stay clearly identified and require review
    refund.status = "requires_review";
    refund.approvedBy = actor;
    audit(store, actor, "refund.manual_recorded", "Refund", refund.id, { reason: "Manual recording requires finance sign-off" });
    return refund;
  }
  refund.status = "processing";
  refund.approvedBy = actor;
  audit(store, actor, "refund.approved", "Refund", refund.id, { before: "awaiting_approval", after: "processing" });
  return refund;
}

export function executeRefund(store: VgStore, refundId: string, actor: string): Refund {
  const refund = mustRefund(store, refundId);
  if (refund.status !== "processing") throw new OpError("VALIDATION_FAILED", "Refund must be approved and processing before execution.");
  // Revalidate the remaining refundable balance immediately before the transfer —
  // an approval is not a guarantee that the balance is still available at execution time.
  const order = store.orders.find((o) => o.id === refund.orderId);
  if (order) {
    const refundedSoFarExcludingSelf = store.refunds
      .filter((r) => r.orderId === order.id && r.id !== refund.id && r.status === "succeeded")
      .reduce((a, r) => a + r.amountMinor, 0);
    if (refundedSoFarExcludingSelf + refund.amountMinor > order.totalMinor) {
      throw new OpError("REFUND_LIMIT_EXCEEDED", `Refund of ₵${(refund.amountMinor / 100).toFixed(2)} now exceeds the remaining refundable balance of ₵${((order.totalMinor - refundedSoFarExcludingSelf) / 100).toFixed(2)} on this order.`);
    }
  }
  refund.retryCount += 1;
  // simulate a retryable provider failure on the first attempt
  if (refund.retryCount === 1 && refund.providerTransferState !== "succeeded") {
    refund.providerTransferState = "failed";
    refund.status = "failed";
    audit(store, actor, "refund.execution_failed", "Refund", refund.id, { reason: "Provider timeout (demo) — retryable" });
    return refund;
  }
  refund.providerTransferState = "succeeded";
  refund.providerRef = `HT-DEMO-RF-${9000 + Math.floor(Math.random() * 900)}`;
  refund.status = "succeeded";
  refund.resolvedAt = nowIso();

  if (order) {
    const paid = order.totalMinor;
    const refunded = refundedSoFar(store, order.id);
    order.paymentStatus = refunded >= paid ? "refunded" : "partially_refunded";
    orderEvent(order, actor, `Refund of ₵${(refund.amountMinor / 100).toFixed(2)} completed`, {
      toStatus: order.paymentStatus,
    });
  }
  if (refund.returnId) {
    const ret = store.returnRequests.find((r) => r.id === refund.returnId);
    if (ret && ret.status !== "resolved") ret.status = "resolved";
  }
  audit(store, actor, "refund.succeeded", "Refund", refund.id, { after: refund.providerRef });
  return refund;
}

export function retryRefund(store: VgStore, refundId: string, actor: string): Refund {
  const refund = mustRefund(store, refundId);
  if (refund.status !== "failed") throw new OpError("VALIDATION_FAILED", "Only failed refunds can be retried.");
  refund.status = "processing";
  audit(store, actor, "refund.retry", "Refund", refund.id, { reason: `retry #${refund.retryCount + 1}` });
  return refund;
}

export function mustReturn(store: VgStore, returnId: string): ReturnRequest {
  const ret = store.returnRequests.find((r) => r.id === returnId || r.reference === returnId);
  if (!ret) throw new OpError("VALIDATION_FAILED", "Return request not found.");
  return ret;
}

export function mustRefund(store: VgStore, refundId: string): Refund {
  const refund = store.refunds.find((r) => r.id === refundId);
  if (!refund) throw new OpError("VALIDATION_FAILED", "Refund not found.");
  return refund;
}

export { consumeNothing };
