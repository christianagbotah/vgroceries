/**
 * Orders engine — reservations, order creation, permitted status
 * transitions, payment attempts, the single stock-depletion event,
 * and cancellation. Enforced in the mock service; the production
 * backend must re-enforce all of it server-side (docs/API_CONTRACTS.md).
 */

import type {
  Address,
  AuditEvent,
  FulfilmentStatus,
  Order,
  OrderLine,
  PaymentAttempt,
  PaymentMethod,
  PaymentStatus,
  Reservation,
} from "@/types/domain";
import { addQty, cmpQty, subQty } from "@/lib/quantity";
import { nextId, nowIso, orderReference, verificationCode } from "@/lib/id";
import { getStore, nextSeq, type VgStore } from "../store";
import { availability, checkAvailability, fefoLots, sweepExpiredReservations } from "./availability";
import { consumeLots } from "./inventory";

export class OpError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function audit(
  store: VgStore,
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  extra?: Partial<AuditEvent>
): void {
  const staff = store.staff.find((s) => s.id === actor);
  store.audit.unshift({
    id: nextId("aud"),
    at: nowIso(),
    actorId: actor,
    actorName: staff?.name ?? actor,
    action,
    entity,
    entityId,
    ...extra,
  });
}

export function orderEvent(order: Order, actor: string, action: string, extra?: { fromStatus?: string; toStatus?: string; note?: string }): void {
  order.events.push({ at: nowIso(), actor, action, ...extra });
}

/* ------------------------------------------------------------------ */
/* Reservations                                                        */
/* ------------------------------------------------------------------ */

export const RESERVATION_TTL_MINUTES = 30; // configurable
export const ORDER_HOLD_HOURS = 20; // confirmed orders hold stock until depletion

export function tryReserve(
  store: VgStore,
  lines: { variantId: string; quantity: string }[],
  orderId: string,
  channel: "online" | "pos",
  ttlMinutes: number = RESERVATION_TTL_MINUTES
): Reservation[] {
  const check = checkAvailability(store, lines);
  if (!check.ok) {
    throw new OpError("OUT_OF_STOCK", "Some items are no longer available in the requested quantity.", check.conflicts);
  }
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const created: Reservation[] = [];
  for (const l of lines) {
    const r: Reservation = {
      id: nextId("res"),
      variantId: l.variantId,
      orderId,
      quantity: l.quantity,
      channel,
      createdAt: nowIso(),
      expiresAt,
    };
    store.reservations.push(r);
    created.push(r);
  }
  return created;
}

export function releaseOrderReservations(store: VgStore, orderId: string, reason: "expired" | "cancelled" | "checkout_abandoned"): void {
  for (const r of store.reservations) {
    if (r.orderId === orderId && !r.consumedAt && !r.releasedAt) {
      r.releasedAt = nowIso();
      r.releasedReason = reason;
    }
  }
}

/** The single documented stock-depletion event. Idempotent by design. */
export function consumeOrderStock(store: VgStore, order: Order, actor: string): { consumed: boolean } {
  if (order.stockConsumedAt) return { consumed: false };
  const reservations = store.reservations.filter((r) => r.orderId === order.id && !r.releasedAt);
  for (const r of reservations) {
    // consume FEFO across eligible lots for the reserved quantity
    consumeLots(store, r.variantId, r.quantity, order.id, actor, "sale");
    r.consumedAt = nowIso();
  }
  order.stockConsumedAt = nowIso();
  return { consumed: true };
}

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

export interface QuoteLineInput { variantId: string; quantity: string }

export interface QuoteResult {
  ok: boolean;
  lines: {
    variantId: string; productId: string; productName: string; variantName: string;
    unit: string; quantity: string; unitPriceMinor: number; lineTotalMinor: number;
    available: string; availableNow: boolean;
  }[];
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  minOrderMinor: number;
  meetsMinimum: boolean;
  conflicts: ReturnType<typeof checkAvailability>["conflicts"];
}

export function quoteCart(store: VgStore, lines: QuoteLineInput[], zoneId?: string): QuoteResult {
  const out: QuoteResult["lines"] = [];
  let subtotal = 0;
  for (const l of lines) {
    const variant = store.variants.find((v) => v.id === l.variantId);
    if (!variant) throw new OpError("VALIDATION_FAILED", `Unknown variant ${l.variantId}`);
    const product = store.products.find((p) => p.id === variant.productId)!;
    const avail = availability(store, variant.id);
    out.push({
      variantId: variant.id, productId: product.id, productName: product.name, variantName: variant.name,
      unit: variant.unit, quantity: l.quantity, unitPriceMinor: variant.priceMinor,
      lineTotalMinor: variant.priceMinor * Number(l.quantity),
      available: avail.availableToSell, availableNow: avail.isAvailable,
    });
    subtotal += variant.priceMinor * Number(l.quantity);
  }
  const zone = zoneId ? store.zones.find((z) => z.id === zoneId) : undefined;
  const deliveryFeeMinor = zone?.feeMinor ?? 0;
  const check = checkAvailability(store, lines);
  return {
    ok: check.ok && (!zone || subtotal >= zone.minimumOrderMinor),
    lines: out, subtotalMinor: subtotal, deliveryFeeMinor, totalMinor: subtotal + deliveryFeeMinor,
    minOrderMinor: zone?.minimumOrderMinor ?? 0, meetsMinimum: !zone || subtotal >= zone.minimumOrderMinor,
    conflicts: check.conflicts,
  };
}

export interface CheckoutInput {
  lines: QuoteLineInput[];
  channel?: "online";
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerId?: string;
  addressId?: string;
  guestAddress?: Omit<Address, "id">;
  fulfilment: "delivery" | "collection";
  zoneId?: string;
  slotId?: string;
  paymentMethod: PaymentMethod;
  note?: string;
  idempotencyKey: string;
}

export function createOnlineOrder(store: VgStore, input: CheckoutInput): { order: Order; paymentRequired: boolean } {
  sweepExpiredReservations(store);
  if (!input.lines.length) throw new OpError("VALIDATION_FAILED", "Cart is empty.");
  if (!input.customerName.trim()) throw new OpError("VALIDATION_FAILED", "A contact name is required.");
  if (!/^\+233\d{9}$/.test(input.customerPhone.replace(/[\s-]/g, ""))) {
    throw new OpError("VALIDATION_FAILED", "Phone must be a valid +233 Ghana number.");
  }

  // revalidate availability and price at checkout (mock service acts as backend)
  const zone = input.fulfilment === "delivery" ? store.zones.find((z) => z.id === input.zoneId) : undefined;
  if (input.fulfilment === "delivery") {
    if (!zone || !zone.isActive) throw new OpError("DELIVERY_ZONE_UNSUPPORTED", "Delivery is not available to the selected zone.");
    const quote = quoteCart(store, input.lines, zone.id);
    if (!quote.meetsMinimum) throw new OpError("VALIDATION_FAILED", `Minimum order for ${zone.name} is ₵${(zone.minimumOrderMinor / 100).toFixed(2)}.`);
    if (input.slotId) {
      const slot = store.slots.find((s) => s.id === input.slotId);
      if (!slot || slot.zoneId !== zone.id) throw new OpError("VALIDATION_FAILED", "Invalid delivery slot.");
      if (slot.booked >= slot.capacity) throw new OpError("VALIDATION_FAILED", "Selected delivery slot is full.");
    }
  }

  // address resolution
  let addressId = input.addressId;
  if (input.fulfilment === "delivery") {
    if (!addressId) {
      if (!input.guestAddress) throw new OpError("VALIDATION_FAILED", "A delivery address is required.");
      const addr: Address = { id: nextId("addr"), ...input.guestAddress, zoneId: zone?.id };
      store.addresses.push(addr);
      addressId = addr.id;
    }
  }

  // reserve the whole order atomically (or throw line-level conflicts)
  const order: Order = {
    id: nextId("ord"),
    reference: orderReference(),
    channel: "online",
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    addressId,
    fulfilment: input.fulfilment,
    zoneId: zone?.id,
    slotId: input.slotId,
    slotLabel: input.slotId ? slotLabel(store, input.slotId) : input.fulfilment === "collection" ? "Collect in store" : undefined,
    lines: [],
    subtotalMinor: 0,
    discountMinor: 0,
    deliveryFeeMinor: zone?.feeMinor ?? 0,
    totalMinor: 0,
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentMethod === "cash_counter" || input.paymentMethod === "cash_on_delivery" ? "unpaid" : "pending",
    fulfilmentStatus: "awaiting_confirmation",
    deliveryStatus: "unassigned",
    notes: input.note ? [{ at: nowIso(), by: "customer", text: input.note, internalOnly: false }] : [],
    events: [],
    createdAt: nowIso(),
    verificationCode: verificationCode(),
  };
  store.orders.push(order);

  try {
    tryReserve(store, input.lines, order.id, "online", RESERVATION_TTL_MINUTES);
  } catch (err) {
    store.orders.pop(); // no stray order without holds
    throw err;
  }

  const orderLines: OrderLine[] = input.lines.map((l) => {
    const variant = store.variants.find((v) => v.id === l.variantId)!;
    const product = store.products.find((p) => p.id === variant.productId)!;
    return {
      id: nextId("oln"),
      orderId: order.id,
      variantId: variant.id,
      productId: product.id,
      productName: product.name,
      variantName: variant.name,
      unit: variant.unit,
      quantity: l.quantity,
      unitPriceMinor: variant.priceMinor,
      lineTotalMinor: variant.priceMinor * Number(l.quantity),
      allocations: [],
    };
  });
  for (const ol of orderLines) store.orderLines.push(ol);
  order.lines = orderLines.map((l) => l.id);
  order.subtotalMinor = orderLines.reduce((a, l) => a + l.lineTotalMinor, 0);
  order.totalMinor = order.subtotalMinor - order.discountMinor + order.deliveryFeeMinor;

  if (input.slotId) {
    const slot = store.slots.find((s) => s.id === input.slotId);
    if (slot) slot.booked += 1;
  }

  orderEvent(order, "customer", "Order placed; stock reserved", { toStatus: "awaiting_confirmation" });

  // payment attempt for electronic methods
  const paymentRequired = ["mobile_money", "card_hosted", "bank_transfer"].includes(input.paymentMethod);
  if (paymentRequired) {
    const attempt: PaymentAttempt = {
      id: nextId("pay"),
      orderId: order.id,
      method: input.paymentMethod,
      amountMinor: order.totalMinor,
      status: "initiated",
      idempotencyKey: input.idempotencyKey,
      callbackCount: 0,
      settlementState: "unsettled",
      createdAt: nowIso(),
    };
    store.paymentAttempts.push(attempt);
    order.paymentStatus = "pending";
    orderEvent(order, "system", `Payment initiated (${methodLabel(input.paymentMethod)})`, { toStatus: "pending" });
  }
  audit(store, input.customerId ?? "customer", "order.created", "Order", order.id);
  return { order, paymentRequired };
}

function slotLabel(store: VgStore, slotId: string): string | undefined {
  const slot = store.slots.find((s) => s.id === slotId);
  return slot ? `${slot.window} (${slot.date})` : undefined;
}

export function methodLabel(m: PaymentMethod): string {
  return {
    mobile_money: "Mobile Money",
    card_hosted: "hosted card checkout",
    bank_transfer: "bank transfer",
    cash_counter: "cash at counter",
    cash_on_delivery: "cash on delivery",
  }[m];
}

/* ------------------------------------------------------------------ */
/* Payment outcomes (provider callback simulation)                     */
/* ------------------------------------------------------------------ */

export type CallbackOutcome = "succeeded" | "failed" | "pending";

export function paymentCallback(
  store: VgStore,
  orderId: string,
  outcome: CallbackOutcome
): { order: Order; duplicate: boolean } {
  const order = store.orders.find((o) => o.id === orderId || o.reference === orderId);
  if (!order) throw new OpError("VALIDATION_FAILED", "Order not found.");
  const attempt = [...store.paymentAttempts].reverse().find((a) => a.orderId === order.id);
  if (!attempt) throw new OpError("VALIDATION_FAILED", "No payment attempt for this order.");
  attempt.callbackCount += 1;

  // A browser redirect or repeated callback cannot mark an order paid:
  // only an unconfirmed outcome transitions the attempt.
  const alreadyResolved = attempt.status === "succeeded" || attempt.status === "failed";
  if (alreadyResolved) {
    orderEvent(order, "system", `Duplicate provider callback received (${attempt.callbackCount}); no state change`);
    return { order, duplicate: true };
  }

  if (store.demoFlags.forcePaymentFailure && outcome === "succeeded") {
    outcome = "failed";
  }

  if (outcome === "succeeded") {
    attempt.status = "succeeded";
    attempt.resolvedAt = nowIso();
    attempt.providerRef = `HT-DEMO-${90000 + Math.floor(Math.random() * 900)}`;
    attempt.settlementState = "unsettled";

    // late payment: reservation may have expired
    const holds = store.reservations.filter((r) => r.orderId === order.id && !r.releasedAt && !r.consumedAt);
    const anyExpiredHold = store.reservations.some((r) => r.orderId === order.id && r.releasedReason === "expired");
    if (!holds.length && anyExpiredHold && !order.stockConsumedAt) {
      // recheck stock: can we re-reserve everything?
      const lines = order.lines.map((lid) => store.orderLines.find((l) => l.id === lid)!);
      const check = checkAvailability(store, lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })));
      if (check.ok) {
        tryReserve(store, lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), order.id, "online", ORDER_HOLD_HOURS * 60);
        order.paymentStatus = "succeeded";
        orderEvent(order, "system", "Late payment succeeded; stock re-reserved after recheck", { toStatus: "succeeded" });
      } else {
        order.paymentStatus = "requires_review";
        attempt.settlementState = "exception";
        attempt.note = "Late success after reservation expiry; stock recheck failed.";
        orderEvent(order, "system", "Late payment succeeded but stock is unavailable; routed to staff review", { toStatus: "requires_review" });
        order.notes.push({ at: nowIso(), by: "system", text: "Payment received after the reservation expired and items are no longer available. Staff review required — offer alternatives, or cancel and refund.", internalOnly: false });
      }
      audit(store, "system", "payment.requires_review", "Order", order.id, { reason: "Late payment after reservation expiry" });
    } else {
      if (order.paymentStatus !== "refunded" && order.paymentStatus !== "partially_refunded") {
        order.paymentStatus = "succeeded";
      }
      orderEvent(order, "system", "Provider confirmed payment", { toStatus: "succeeded" });
    }
    audit(store, "system", "payment.succeeded", "PaymentAttempt", attempt.id);
  } else if (outcome === "failed") {
    attempt.status = "failed";
    attempt.resolvedAt = nowIso();
    attempt.failureReason = "Provider declined (demo)";
    if (order.paymentStatus === "pending" || order.paymentStatus === "unpaid") {
      order.paymentStatus = "failed";
    }
    orderEvent(order, "system", "Payment failed at provider", { toStatus: "failed" });
    audit(store, "system", "payment.failed", "PaymentAttempt", attempt.id);
  } else {
    orderEvent(order, "system", `Provider callback received (${attempt.callbackCount}); outcome still pending`);
  }
  return { order, duplicate: false };
}

/* ------------------------------------------------------------------ */
/* Staff order transitions                                             */
/* ------------------------------------------------------------------ */

const FULFIL_NEXT: Partial<Record<FulfilmentStatus, FulfilmentStatus[]>> = {
  awaiting_confirmation: ["confirmed", "cancelled"],
  confirmed: ["picking", "cancelled"],
  picking: ["packed", "cancelled"],
  packed: ["dispatched", "ready_for_collection", "cancelled"],
  dispatched: ["delivered"],
  ready_for_collection: ["collected"],
};

function requireTransition(order: Order, to: FulfilmentStatus): void {
  if (order.fulfilmentStatus === to) return; // idempotent
  const allowed = FULFIL_NEXT[order.fulfilmentStatus] ?? [];
  if (!allowed.includes(to)) {
    throw new OpError("VALIDATION_FAILED", `Cannot move order from ${order.fulfilmentStatus} to ${to}.`);
  }
}

export function confirmOrder(store: VgStore, orderId: string, actor: string, note?: string): Order {
  const order = mustOrder(store, orderId);
  requireTransition(order, "confirmed");
  // COD and cash-at-counter may be confirmed while payment remains unpaid
  const payableNow = ["mobile_money", "card_hosted", "bank_transfer"].includes(order.paymentMethod);
  if (payableNow && !["succeeded", "partially_refunded", "refunded"].includes(order.paymentStatus)) {
    throw new OpError("PAYMENT_PENDING", "Electronic payment is not confirmed yet for this order.");
  }
  order.fulfilmentStatus = "confirmed";
  // extend holds to the fulfilment window
  for (const r of store.reservations) {
    if (r.orderId === order.id && !r.consumedAt && !r.releasedAt) {
      r.expiresAt = new Date(Date.now() + ORDER_HOLD_HOURS * 3600_000).toISOString();
    }
  }
  orderEvent(order, actor, "Order confirmed", { fromStatus: "awaiting_confirmation", toStatus: "confirmed" });
  if (note) addOrderNote(store, orderId, actor, note, true);
  audit(store, actor, "order.confirmed", "Order", order.id);
  return order;
}

export function startPicking(store: VgStore, orderId: string, actor: string): Order {
  const order = mustOrder(store, orderId);
  requireTransition(order, "picking");
  order.fulfilmentStatus = "picking";
  // record FEFO allocations for the picker
  for (const lid of order.lines) {
    const line = store.orderLines.find((l) => l.id === lid)!;
    const lots = fefoLots(store, line.variantId);
    let remaining = line.quantity;
    line.allocations = [];
    for (const lot of lots) {
      if (cmpQty(remaining, "0") <= 0) break;
      const take = cmpQty(lot.quantity, remaining) >= 0 ? remaining : lot.quantity;
      line.allocations.push({ lotId: lot.id, quantity: take });
      remaining = subQty(remaining, take);
    }
  }
  orderEvent(order, actor, "Picking started", { fromStatus: "confirmed", toStatus: "picking" });
  audit(store, actor, "order.picking_started", "Order", order.id);
  return order;
}

export function markPacked(store: VgStore, orderId: string, actor: string, note?: string): Order {
  const order = mustOrder(store, orderId);
  requireTransition(order, "packed");
  order.fulfilmentStatus = "packed";
  orderEvent(order, actor, "Packed", { fromStatus: "picking", toStatus: "packed" });
  if (note) addOrderNote(store, orderId, actor, note, true);
  audit(store, actor, "order.packed", "Order", order.id);
  return order;
}

export function markReadyForCollection(store: VgStore, orderId: string, actor: string): Order {
  const order = mustOrder(store, orderId);
  requireTransition(order, "ready_for_collection");
  order.fulfilmentStatus = "ready_for_collection";
  orderEvent(order, actor, "Packed and ready for collection", { fromStatus: "packed", toStatus: "ready_for_collection" });
  audit(store, actor, "order.ready_for_collection", "Order", order.id);
  return order;
}

export function markCollected(store: VgStore, orderId: string, actor: string): Order {
  const order = mustOrder(store, orderId);
  requireTransition(order, "collected");
  if (order.paymentMethod === "cash_counter" && order.paymentStatus === "unpaid") {
    order.paymentStatus = "succeeded";
    orderEvent(order, actor, "Cash received at counter on collection", { toStatus: "succeeded" });
  }
  // completed handover consumes physical stock and reservation together
  const { consumed } = consumeOrderStock(store, order, actor);
  order.fulfilmentStatus = "collected";
  orderEvent(order, actor, "Collected by customer", { fromStatus: "ready_for_collection", toStatus: "collected" });
  if (!consumed) orderEvent(order, actor, "Repeat collect action ignored; stock was already consumed once");
  audit(store, actor, "order.collected", "Order", order.id);
  return order;
}

export function markDispatched(store: VgStore, orderId: string, actor: string): Order {
  const order = mustOrder(store, orderId);
  requireTransition(order, "dispatched");
  order.fulfilmentStatus = "dispatched";
  order.deliveryStatus = "assigned";
  orderEvent(order, actor, "Dispatched", { fromStatus: "packed", toStatus: "dispatched" });
  audit(store, actor, "order.dispatched", "Order", order.id);
  return order;
}

export function markDelivered(store: VgStore, orderId: string, actor: string, proofNote?: string): Order {
  const order = mustOrder(store, orderId);
  if (order.fulfilmentStatus === "delivered") return order;
  if (order.fulfilmentStatus !== "dispatched") {
    throw new OpError("VALIDATION_FAILED", "Only dispatched orders can be delivered.");
  }
  order.fulfilmentStatus = "delivered";
  order.deliveryStatus = "delivered";
  orderEvent(order, actor, "Delivered" + (proofNote ? ` — ${proofNote}` : ""), { fromStatus: "dispatched", toStatus: "delivered" });
  audit(store, actor, "order.delivered", "Order", order.id);
  return order;
}

export function cancelOrder(store: VgStore, orderId: string, actor: string, reason: string): Order {
  const order = mustOrder(store, orderId);
  if (["delivered", "collected", "dispatched"].includes(order.fulfilmentStatus) || order.stockConsumedAt) {
    throw new OpError(
      "VALIDATION_FAILED",
      "Goods have already left the store. Use the returns workflow — a cancellation would create a phantom stock change."
    );
  }
  requireTransition(order, "cancelled");
  order.fulfilmentStatus = "cancelled";
  releaseOrderReservations(store, order.id, "cancelled");
  orderEvent(order, actor, "Order cancelled", { toStatus: "cancelled", note: reason });
  order.notes.push({ at: nowIso(), by: actor, text: `Cancelled: ${reason}`, internalOnly: false });
  if (order.slotId) {
    const slot = store.slots.find((s) => s.id === order.slotId);
    if (slot && slot.booked > 0) slot.booked -= 1;
  }
  audit(store, actor, "order.cancelled", "Order", order.id, { reason });
  return order;
}

export function addOrderNote(store: VgStore, orderId: string, actor: string, text: string, internalOnly: boolean): Order {
  const order = mustOrder(store, orderId);
  order.notes.push({ at: nowIso(), by: actor, text, internalOnly });
  return order;
}

/** Substitution: replace a line's variant after permission; price recalculated through the service. */
export function substituteLine(
  store: VgStore,
  orderId: string,
  lineId: string,
  newVariantId: string,
  actor: string,
  permissionNote: string
): Order {
  const order = mustOrder(store, orderId);
  if (!["confirmed", "picking"].includes(order.fulfilmentStatus)) {
    throw new OpError("VALIDATION_FAILED", "Substitutions are only possible while the order is confirmed or picking.");
  }
  const line = store.orderLines.find((l) => l.id === lineId);
  if (!line) throw new OpError("VALIDATION_FAILED", "Order line not found.");
  const variant = store.variants.find((v) => v.id === newVariantId);
  if (!variant) throw new OpError("VALIDATION_FAILED", "Replacement variant not found.");
  const avail = availability(store, variant.id);
  if (cmpQty(line.quantity, avail.availableToSell) > 0) {
    throw new OpError("OUT_OF_STOCK", "Replacement is not available in the needed quantity.");
  }
  // release old hold, reserve the replacement quantity
  const oldHold = store.reservations.find((r) => r.orderId === order.id && r.variantId === line.variantId && !r.releasedAt && !r.consumedAt);
  if (oldHold) {
    oldHold.releasedAt = nowIso();
    oldHold.releasedReason = "cancelled";
  }
  tryReserve(store, [{ variantId: variant.id, quantity: line.quantity }], order.id, "online", ORDER_HOLD_HOURS * 60);

  const replacementLine: OrderLine = {
    id: nextId("oln"),
    orderId: order.id,
    variantId: variant.id,
    productId: variant.productId,
    productName: store.products.find((p) => p.id === variant.productId)!.name,
    variantName: variant.name,
    unit: variant.unit,
    quantity: line.quantity,
    unitPriceMinor: variant.priceMinor,
    lineTotalMinor: variant.priceMinor * Number(line.quantity),
    allocations: [],
    substitutionOfLineId: line.id,
    note: `Substitute for ${line.productName} (${line.variantName})`,
  };
  store.orderLines.push(replacementLine);
  // remove the original line from the order's line list, keep it for history
  order.lines = order.lines.filter((l) => l !== line.id).concat(replacementLine.id);
  line.note = "Substituted — see replacement line";

  // recalc totals through the service
  const lines = order.lines.map((lid) => store.orderLines.find((l) => l.id === lid)!);
  order.subtotalMinor = lines.reduce((a, l) => a + l.lineTotalMinor, 0);
  order.totalMinor = order.subtotalMinor - order.discountMinor + order.deliveryFeeMinor;
  orderEvent(order, actor, `Substituted ${line.productName} with ${replacementLine.productName}`, { note: permissionNote });
  order.notes.push({ at: nowIso(), by: actor, text: `Substitution: ${replacementLine.productName} (${replacementLine.variantName}) replaces ${line.productName} (${line.variantName}). Customer permission: ${permissionNote}`, internalOnly: false });
  audit(store, actor, "order.line_substituted", "OrderLine", line.id, { reason: permissionNote, before: line.variantName, after: variant.name });
  return order;
}

/** Resolve a requires_review order: staff either accepts (re-reserve) or cancels and refunds. */
export function resolveReviewOrder(store: VgStore, orderId: string, actor: string, decision: "fulfil" | "cancel_refund", reason: string): Order {
  const order = mustOrder(store, orderId);
  if (order.paymentStatus !== "requires_review") {
    throw new OpError("VALIDATION_FAILED", "This order is not awaiting review.");
  }
  if (decision === "fulfil") {
    const lines = order.lines.map((lid) => store.orderLines.find((l) => l.id === lid)!);
    const check = checkAvailability(store, lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })));
    if (!check.ok) throw new OpError("OUT_OF_STOCK", "Stock is still unavailable; cancel and refund instead.", check.conflicts);
    tryReserve(store, lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), order.id, "online", ORDER_HOLD_HOURS * 60);
    order.paymentStatus = "succeeded";
    orderEvent(order, actor, "Review resolved: stock re-reserved, order continues", { toStatus: "succeeded" });
  } else {
    releaseOrderReservations(store, order.id, "cancelled");
    order.fulfilmentStatus = "cancelled";
    order.paymentStatus = "refunded";
    orderEvent(order, actor, "Review resolved: cancelled; refund to be processed", { toStatus: "cancelled" });
    order.notes.push({ at: nowIso(), by: actor, text: `Cancelled after review: ${reason}. Refund ₵${(order.totalMinor / 100).toFixed(2)} to be processed via the refunds workflow.`, internalOnly: false });
  }
  audit(store, actor, "order.review_resolved", "Order", order.id, { reason, before: "requires_review", after: decision });
  return order;
}

export function mustOrder(store: VgStore, orderIdOrRef: string): Order {
  const order = store.orders.find((o) => o.id === orderIdOrRef || o.reference === orderIdOrRef);
  if (!order) throw new OpError("VALIDATION_FAILED", "Order not found.");
  return order;
}

export function orderLinesOf(store: VgStore, order: Order): OrderLine[] {
  return order.lines.map((lid) => store.orderLines.find((l) => l.id === lid)!).filter(Boolean);
}

export function paymentStatusOf(store: VgStore, order: Order): PaymentAttempt[] {
  return store.paymentAttempts.filter((a) => a.orderId === order.id);
}

export type { PaymentStatus };
