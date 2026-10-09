/**
 * POS engine — counter sales sharing the same inventory, reservation
 * and order services as the storefront. Completion is idempotent via
 * idempotency keys and the single stock-depletion guard.
 */

import type { CashierSession, HeldDraftSale, Order, OrderLine, PaymentMethod, PosTransaction } from "@/types/domain";
import { nextId, nowIso, receiptNumber } from "@/lib/id";
import { formatQty } from "@/lib/quantity";
import { getStore, nextSeq, type VgStore } from "../store";
import { checkAvailability } from "./availability";
import { audit, consumeOrderStock, orderEvent, tryReserve, validateMoneyMinor, validateSaleLines, OpError } from "./orders";

export interface PosLineInput { variantId: string; quantity: string }

export interface PosCompleteInput {
  sessionId: string;
  cashierId: string;
  lines: PosLineInput[];
  method: PaymentMethod; // cash_counter | mobile_money | card_hosted at the counter
  discountMinor?: number;
  customerName?: string;
  customerPhone?: string;
  cashReceivedMinor?: number; // for cash
  idempotencyKey: string;
}

const POS_METHODS: PaymentMethod[] = ["cash_counter", "mobile_money", "card_hosted"];

export function completeSale(store: VgStore, input: PosCompleteInput): { order: Order; receiptNo: string; changeMinor: number } {
  // idempotency: replaying the same key returns the original result
  const existing = store.posTransactions.find((t) => {
    const o = store.orders.find((x) => x.id === t.orderId);
    return o?.posReceiptNo === t.receiptNo && o?.id === input.idempotencyKey;
  });
  if (existing) {
    const order = store.orders.find((o) => o.id === existing.orderId)!;
    return { order, receiptNo: existing.receiptNo, changeMinor: 0 };
  }
  const prior = store.orders.find((o) => o.id === `pos_${input.idempotencyKey}`);
  if (prior) {
    return { order: prior, receiptNo: prior.posReceiptNo ?? "", changeMinor: 0 };
  }

  if (!input.lines.length) throw new OpError("VALIDATION_FAILED", "The sale cart is empty.");
  const session = store.cashierSessions.find((s) => s.id === input.sessionId && s.status === "open");
  if (!session) throw new OpError("VALIDATION_FAILED", "No open cashier session. Open a session first.");

  // input validation BEFORE any reservation or completion: positive quantities,
  // permitted precision, supported counter payment methods, money bounds.
  validateSaleLines(store, input.lines);
  if (!POS_METHODS.includes(input.method)) {
    throw new OpError("VALIDATION_FAILED", `Unsupported counter payment method "${input.method}".`);
  }
  if (input.discountMinor !== undefined) {
    validateMoneyMinor(input.discountMinor, "Discount", { min: 0 });
  }
  if (input.cashReceivedMinor !== undefined) {
    validateMoneyMinor(input.cashReceivedMinor, "Cash received", { min: 0 });
  }

  // revalidate availability before completing a counter sale
  const check = checkAvailability(store, input.lines);
  if (!check.ok) {
    throw new OpError("OUT_OF_STOCK", "Some items just became unavailable.", check.conflicts);
  }

  const orderId = `pos_${input.idempotencyKey}`;
  const order: Order = {
    id: orderId,
    reference: `POS-${input.idempotencyKey.slice(-6).toUpperCase()}`,
    channel: "pos",
    customerName: input.customerName?.trim() || "Walk-in customer",
    customerPhone: input.customerPhone ?? "",
    fulfilment: "collection",
    lines: [],
    subtotalMinor: 0,
    discountMinor: input.discountMinor ?? 0,
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: input.method,
    paymentStatus: "succeeded",
    fulfilmentStatus: "collected",
    deliveryStatus: "unassigned",
    notes: [],
    events: [],
    posSessionId: session.id,
    createdAt: nowIso(),
  };
  const lines: OrderLine[] = input.lines.map((l) => {
    const variant = store.variants.find((v) => v.id === l.variantId);
    if (!variant) throw new OpError("VALIDATION_FAILED", `Unknown variant ${l.variantId}`);
    const product = store.products.find((p) => p.id === variant.productId)!;
    return {
      id: nextId("oln"),
      orderId: order.id,
      variantId: variant.id,
      productId: product.id,
      productName: product.name,
      variantName: variant.name,
      unit: variant.unit,
      quantity: formatQty(l.quantity),
      unitPriceMinor: variant.priceMinor,
      lineTotalMinor: variant.priceMinor * Number(l.quantity),
      allocations: [],
    };
  });
  order.lines = lines.map((l) => l.id);
  order.subtotalMinor = lines.reduce((a, l) => a + l.lineTotalMinor, 0);
  order.totalMinor = Math.max(0, order.subtotalMinor - order.discountMinor);

  if (input.method === "cash_counter") {
    if (input.cashReceivedMinor === undefined || input.cashReceivedMinor < order.totalMinor) {
      throw new OpError("VALIDATION_FAILED", "Cash received is less than the total due.");
    }
  }
  if (order.discountMinor > order.subtotalMinor) {
    throw new OpError("VALIDATION_FAILED", "Discount cannot exceed the sale subtotal.");
  }

  store.orders.push(order);
  for (const l of lines) store.orderLines.push(l);

  try {
    // reserve + consume in one step: counter handover consumes stock and hold together
    tryReserve(store, input.lines, order.id, "pos", 1);
    consumeOrderStock(store, order, input.cashierId);
  } catch (err) {
    store.orders.pop();
    order.lines.forEach(() => store.orderLines.pop());
    throw err;
  }

  const receiptNo = receiptNumber(nextSeq(store, "receipt"));
  order.posReceiptNo = receiptNo;
  orderEvent(order, input.cashierId, `Counter sale completed (${methodShort(input.method)}); stock consumed`, { toStatus: "collected" });
  if (input.discountMinor && input.discountMinor > 0) {
    orderEvent(order, input.cashierId, `Line-item discount of ₵${(input.discountMinor / 100).toFixed(2)} applied`);
  }

  const txn: PosTransaction = {
    orderId: order.id,
    receiptNo,
    at: nowIso(),
    method: input.method,
    totalMinor: order.totalMinor,
    cashierName: session.cashierName,
  };
  store.posTransactions.unshift(txn);

  let changeMinor = 0;
  if (input.method === "cash_counter" && input.cashReceivedMinor !== undefined) {
    changeMinor = input.cashReceivedMinor - order.totalMinor;
    orderEvent(order, input.cashierId, `Cash received ₵${(input.cashReceivedMinor / 100).toFixed(2)}; change ₵${(changeMinor / 100).toFixed(2)}`);
  }
  audit(store, input.cashierId, "pos.sale_completed", "Order", order.id, { after: receiptNo });
  return { order, receiptNo, changeMinor };
}

function methodShort(m: PaymentMethod): string {
  return m === "cash_counter" ? "cash" : m === "mobile_money" ? "mobile money" : "card";
}

/* ------------------------------------------------------------------ */
/* Held drafts                                                         */
/* ------------------------------------------------------------------ */

export function holdSale(
  store: VgStore,
  input: { sessionId: string; cashierId: string; label: string; lines: PosLineInput[] }
): HeldDraftSale {
  const session = store.cashierSessions.find((s) => s.id === input.sessionId && s.status === "open");
  if (!session) throw new OpError("VALIDATION_FAILED", "No open cashier session.");
  if (!input.lines.length) throw new OpError("VALIDATION_FAILED", "Nothing to hold.");
  // held drafts reserve stock like any other sale — same input rules apply
  validateSaleLines(store, input.lines);
  // the draft's hold expires after 20 minutes
  const draftId = nextId("hld");
  const reservations = tryReserve(store, input.lines, `draft:${draftId}`, "pos", 20);
  const draft: HeldDraftSale = {
    id: draftId,
    sessionId: input.sessionId,
    cashierId: input.cashierId,
    label: input.label.trim() || `Held sale ${new Date().toLocaleTimeString("en-GB")}`,
    lines: input.lines.map((l) => {
      const variant = store.variants.find((v) => v.id === l.variantId)!;
      return { variantId: l.variantId, quantity: l.quantity, unitPriceMinor: variant.priceMinor };
    }),
    createdAt: nowIso(),
    reservationIds: reservations.map((r) => r.id),
    expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
  };
  store.heldDrafts.unshift(draft);
  return draft;
}

export function resumeDraft(store: VgStore, draftId: string): HeldDraftSale {
  const draft = store.heldDrafts.find((d) => d.id === draftId);
  if (!draft) throw new OpError("VALIDATION_FAILED", "Held sale not found.");
  if (draft.expiresAt <= nowIso()) {
    releaseDraft(store, draftId);
    throw new OpError("RESERVATION_EXPIRED", "This held sale's reservation expired; the stock hold was released.");
  }
  return draft;
}

export function releaseDraft(store: VgStore, draftId: string): void {
  const draft = store.heldDrafts.find((d) => d.id === draftId);
  if (!draft) return;
  for (const rid of draft.reservationIds) {
    const r = store.reservations.find((x) => x.id === rid);
    if (r && !r.consumedAt && !r.releasedAt) {
      r.releasedAt = nowIso();
      r.releasedReason = "cancelled";
    }
  }
  store.heldDrafts = store.heldDrafts.filter((d) => d.id !== draftId);
}

/* ------------------------------------------------------------------ */
/* Cashier sessions                                                    */
/* ------------------------------------------------------------------ */

export function openSession(store: VgStore, cashierId: string, openingFloatMinor: number): CashierSession {
  const cashier = store.staff.find((s) => s.id === cashierId);
  if (!cashier) throw new OpError("VALIDATION_FAILED", "Unknown cashier.");
  const open = store.cashierSessions.find((s) => s.cashierId === cashierId && s.status === "open");
  if (open) throw new OpError("VALIDATION_FAILED", "You already have an open session.");
  if (openingFloatMinor < 0) throw new OpError("VALIDATION_FAILED", "Opening float cannot be negative.");
  const session: CashierSession = {
    id: nextId("cash"),
    cashierId,
    cashierName: cashier.name,
    openedAt: nowIso(),
    openingFloatMinor,
    status: "open",
    movements: [],
  };
  store.cashierSessions.unshift(session);
  audit(store, cashierId, "cash.session_opened", "CashierSession", session.id, { after: `${openingFloatMinor}` });
  return session;
}

export function cashMovement(store: VgStore, sessionId: string, kind: "cash_in" | "cash_out" | "drop", amountMinor: number, note: string, actor: string): CashierSession {
  const session = store.cashierSessions.find((s) => s.id === sessionId);
  if (!session || session.status !== "open") throw new OpError("VALIDATION_FAILED", "Session is not open.");
  if (amountMinor <= 0) throw new OpError("VALIDATION_FAILED", "Amount must be positive.");
  session.movements.push({ at: nowIso(), kind, amountMinor, note });
  audit(store, actor, `cash.${kind}`, "CashierSession", session.id, { reason: note, after: `${amountMinor}` });
  return session;
}

export function expectedCash(store: VgStore, session: CashierSession): number {
  const cashSales = store.orders
    .filter((o) => o.posSessionId === session.id && o.paymentMethod === "cash_counter" && ["succeeded", "partially_refunded", "refunded"].includes(o.paymentStatus))
    .reduce((a, o) => a + o.totalMinor, 0);
  const movements = session.movements.reduce((a, m) => a + (m.kind === "cash_in" ? m.amountMinor : -m.amountMinor), 0);
  return session.openingFloatMinor + cashSales + movements;
}

export function closeSession(store: VgStore, sessionId: string, countedCashMinor: number, note: string, actor: string): CashierSession {
  const session = store.cashierSessions.find((s) => s.id === sessionId);
  if (!session || session.status !== "open") throw new OpError("VALIDATION_FAILED", "Session is not open.");
  const expected = expectedCash(store, session);
  session.status = "closed";
  session.closedAt = nowIso();
  session.expectedCashMinor = expected;
  session.countedCashMinor = countedCashMinor;
  session.differenceMinor = countedCashMinor - expected;
  session.closeNote = note;
  audit(store, actor, "cash.session_closed", "CashierSession", session.id, {
    reason: note,
    before: "open",
    after: `expected ${expected}, counted ${countedCashMinor}`,
  });
  return session;
}

export function lookupReceipt(store: VgStore, receiptNo: string): { order: Order; lines: OrderLine[]; txn: PosTransaction } | null {
  const txn = store.posTransactions.find((t) => t.receiptNo.toLowerCase() === receiptNo.trim().toLowerCase());
  if (!txn) return null;
  const order = store.orders.find((o) => o.id === txn.orderId);
  if (!order) return null;
  return { order, lines: order.lines.map((lid) => store.orderLines.find((l) => l.id === lid)!).filter(Boolean), txn };
}
