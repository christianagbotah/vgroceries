/**
 * Mock service router — the versioned API boundary.
 *
 * Every page talks to these operations through src/services/client.ts.
 * A real backend implements the same operation contracts and the client
 * adapter switches without page rewrites (docs/API_CONTRACTS.md).
 *
 * These are PROPOSED application contracts, not claims about any
 * third-party endpoint. Development-only, single process.
 */

import { getStore, resetStore, type VgStore } from "./store";
import { OpError, audit } from "./engine/orders";
import { availability, checkAvailability, isProductPurchasable, sweepExpiredReservations } from "./engine/availability";
import {
  addOrderNote,
  cancelOrder,
  confirmOrder,
  createOnlineOrder,
  markCollected,
  markDelivered,
  markDispatched,
  markPacked,
  markReadyForCollection,
  mustOrder,
  orderLinesOf,
  paymentCallback,
  quoteCart,
  resolveReviewOrder,
  startPicking,
  substituteLine,
  tryReserve,
} from "./engine/orders";
import {
  closeSession,
  completeSale,
  expectedCash,
  holdSale,
  lookupReceipt,
  openSession,
  cashMovement,
  releaseDraft,
  resumeDraft,
} from "./engine/pos";
import {
  closeStocktake,
  decideAdjustment,
  disposeLot,
  expiryOverview,
  openStocktake,
  receiveGoods,
  recordCounts,
  requestAdjustment,
  setLotQuarantine,
} from "./engine/inventory";
import {
  assignJob,
  mustJob,
  pendingRemittance,
  remitCash,
  rescheduleJob,
  returnToStore,
  riderAccept,
  riderDeliver,
  riderFail,
  riderHistory,
  riderJobs,
  riderOut,
  riderPickup,
} from "./engine/delivery";
import {
  approveRefund,
  createReturn,
  decideReturn,
  eligibleReturnLines,
  executeRefund,
  inspectReturn,
  receiveReturn,
  refundPreview,
  requestRefund,
  retryRefund,
} from "./engine/returns";
import {
  budgetBasket,
  businessQuestion,
  refreshExceptionFlags,
  refreshStaffSuggestions,
  reviewSuggestion,
  shoppingAssistant,
} from "./engine/ai";
import { buildReports, dashboardSummary } from "./engine/reports";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { nextId, nowIso, orderReference } from "@/lib/id";

export interface ApiRequest {
  path: string; // e.g. "catalog/product"
  method: "GET" | "POST";
  query: URLSearchParams;
  body: Record<string, unknown>;
}

export interface ApiResult {
  status: number;
  json: unknown;
}

function ok(data: unknown): ApiResult {
  return { status: 200, json: { ok: true, data } };
}

function err(e: unknown): ApiResult {
  if (e instanceof OpError) {
    const status = e.code === "FORBIDDEN" ? 403 : e.code === "VALIDATION_FAILED" ? 400 : e.code === "OUT_OF_STOCK" ? 409 : 400;
    return { status, json: { ok: false, error: { code: e.code, message: e.message, details: e.details ?? null } } };
  }
  const code = (e as { code?: string })?.code ?? "INTERNAL";
  return { status: 500, json: { ok: false, error: { code, message: (e as Error)?.message ?? "Unexpected error" } } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Public view helpers                                                 */
/* ------------------------------------------------------------------ */

export function publicOrder(store: VgStore, orderId: string) {
  const order = mustOrder(store, orderId);
  const lines = orderLinesOf(store, order);
  const job = store.deliveryJobs.find((j) => j.orderId === order.id);
  const returns = store.returnRequests.filter((r) => r.orderId === order.id);
  return {
    id: order.id,
    reference: order.reference,
    channel: order.channel,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    fulfilment: order.fulfilment,
    slotLabel: order.slotLabel,
    createdAt: order.createdAt,
    createdAtLabel: formatDateTime(order.createdAt),
    subtotalMinor: order.subtotalMinor,
    discountMinor: order.discountMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    totalMinor: order.totalMinor,
    totalLabel: formatMoney(order.totalMinor),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    deliveryStatus: order.deliveryStatus,
    paymentAttempts: store.paymentAttempts
      .filter((a) => a.orderId === order.id)
      .map((a) => ({ id: a.id, method: a.method, status: a.status, amountMinor: a.amountMinor, amountLabel: formatMoney(a.amountMinor), callbackCount: a.callbackCount, providerRef: a.providerRef, settlementState: a.settlementState, failureReason: a.failureReason, note: a.note, createdAt: a.createdAt })),
    lines: lines.map((l) => ({
      id: l.id, productName: l.productName, variantName: l.variantName, unit: l.unit,
      quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, unitPriceLabel: formatMoney(l.unitPriceMinor),
      lineTotalMinor: l.lineTotalMinor, lineTotalLabel: formatMoney(l.lineTotalMinor),
      allocations: l.allocations, note: l.note, substitutionOfLineId: l.substitutionOfLineId,
      productId: l.productId, variantId: l.variantId,
    })),
    notes: order.notes.filter((n) => !n.internalOnly),
    events: order.events.map((e) => ({ ...e, atLabel: formatDateTime(e.at) })),
    job: job
      ? {
          id: job.id, status: job.status, riderName: store.riders.find((r) => r.id === job.riderId)?.name,
          proof: job.proof, failureReason: job.failureReason, rescheduledFor: job.rescheduledFor,
          cashToCollectMinor: job.cashToCollectMinor, cashToCollectLabel: job.cashToCollectMinor ? formatMoney(job.cashToCollectMinor) : undefined,
          cashCollectedAt: job.cashCollectedAt, remittedAt: job.remittedAt,
        }
      : undefined,
    returns: returns.map((r) => ({ id: r.id, reference: r.reference, status: r.status, createdAt: r.createdAt })),
    posReceiptNo: order.posReceiptNo,
    stockConsumedAt: order.stockConsumedAt,
    verificationCode: order.verificationCode,
  };
}

export function catalogEntry(store: VgStore, productId: string) {
  const p = store.products.find((x) => x.id === productId)!;
  const cat = store.categories.find((c) => c.id === p.categoryId);
  const variants = p.variants
    .map((vid) => {
      const v = store.variants.find((x) => x.id === vid)!;
      const a = availability(store, vid);
      return {
        id: v.id, name: v.name, unit: v.unit, unitSize: v.unitSize, priceMinor: v.priceMinor,
        priceLabel: formatMoney(v.priceMinor),
        compareAtPriceMinor: v.compareAtPriceMinor,
        compareAtLabel: v.compareAtPriceMinor ? formatMoney(v.compareAtPriceMinor) : undefined,
        barcode: v.barcode, purchaseUnit: v.purchaseUnit,
        availableToSell: a.availableToSell, isAvailable: a.isAvailable, safetyStock: v.safetyStock,
      };
    });
  return {
    id: p.id, slug: p.slug, name: p.name, categoryId: p.categoryId,
    categoryName: cat?.name, categorySlug: cat?.slug, tint: cat?.tint,
    shortDescription: p.shortDescription, description: p.description, tags: p.tags,
    image: `/products/${p.slug}.svg`,
    variants,
    anyAvailable: variants.some((v) => v.isAvailable),
    minPriceMinor: Math.min(...variants.map((v) => v.priceMinor)),
    minPriceLabel: formatMoney(Math.min(...variants.map((v) => v.priceMinor))),
  };
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export async function handleApi(req: ApiRequest): Promise<ApiResult> {
  try {
    const store = getStore();
    const { path, query, body } = req;
    const b = (k: string) => (body?.[k] as string | undefined) ?? "";
    const n = (k: string, fallback = 0) => (typeof body?.[k] === "number" ? (body[k] as number) : Number(body?.[k] ?? fallback) || fallback);
    const q = (k: string) => query.get(k) ?? "";

    // demo simulation flags: latency, offline, forced payment failure
    if (store.demoFlags.offlineMode && !path.startsWith("demo.")) {
      return { status: 503, json: { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Demo offline mode is ON — operations report the real failure honestly." } } };
    }
    if (store.demoFlags.latencyMs > 0) {
      await sleep(Math.min(store.demoFlags.latencyMs, 4000));
    }

    switch (path) {
      /* ---------------- Catalogue ---------------- */
      case "catalog.categories": {
        return ok(store.categories
          .filter((c) => c.isActive)
          .map((c) => {
            const count = store.products.filter((p) => p.categoryId === c.id && isProductPurchasable(store, p.id)).length;
            return { id: c.id, slug: c.slug, name: c.name, description: c.description, tint: c.tint, availableProducts: count };
          })
          .sort((a, b2) => a.name.localeCompare(b2.name)));
      }
      case "catalog.list": {
        sweepExpiredReservations(store);
        const search = q("query").toLowerCase();
        const category = q("category");
        const sort = q("sort") || "popular";
        const page = Math.max(1, Number(q("page") || 1));
        const perPage = Math.min(48, Number(q("perPage") || 12));
        let items = store.products.filter((p) => p.isPublished && isProductPurchasable(store, p.id));
        if (category) items = items.filter((p) => p.categoryId === category);
        if (search) {
          items = items.filter((p) =>
            `${p.name} ${p.shortDescription} ${p.tags.join(" ")}`.toLowerCase().includes(search)
          );
        }
        const salesCount = new Map<string, number>();
        for (const o of store.orders) {
          if (o.fulfilmentStatus === "cancelled") continue;
          for (const lid of o.lines) {
            const l = store.orderLines.find((x) => x.id === lid);
            if (l) salesCount.set(l.productId, (salesCount.get(l.productId) ?? 0) + Number(l.quantity));
          }
        }
        if (sort === "price-asc") items.sort((a, b2) => catalogEntry(store, a.id).minPriceMinor - catalogEntry(store, b2.id).minPriceMinor);
        else if (sort === "price-desc") items.sort((a, b2) => catalogEntry(store, b2.id).minPriceMinor - catalogEntry(store, a.id).minPriceMinor);
        else if (sort === "name") items.sort((a, b2) => a.name.localeCompare(b2.name));
        else items.sort((a, b2) => (salesCount.get(b2.id) ?? 0) - (salesCount.get(a.id) ?? 0));
        const total = items.length;
        const paged = items.slice((page - 1) * perPage, page * perPage);
        return ok({ items: paged.map((p) => catalogEntry(store, p.id)), total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) });
      }
      case "catalog.product": {
        sweepExpiredReservations(store);
        const slug = q("slug");
        const p = store.products.find((x) => x.slug === slug);
        if (!p) return err(new OpError("VALIDATION_FAILED", "Product not found."));
        const entry = catalogEntry(store, p.id);
        const related = store.products
          .filter((x) => x.categoryId === p.categoryId && x.id !== p.id && isProductPurchasable(store, x.id))
          .slice(0, 4)
          .map((x) => catalogEntry(store, x.id));
        return ok({ product: entry, related, purchasable: entry.anyAvailable });
      }

      case "catalog.by-variants": {
        sweepExpiredReservations(store);
        const variantIds = (body.variantIds ?? []) as string[];
        const out = [];
        for (const vid of variantIds) {
          const v = store.variants.find((x) => x.id === vid);
          if (!v) continue;
          const p = store.products.find((x) => x.id === v.productId);
          if (p) out.push(catalogEntry(store, p.id));
        }
        return ok(out);
      }

      /* ---------------- Checkout ---------------- */
      case "checkout.quote": {
        sweepExpiredReservations(store);
        const lines = (body.lines ?? []) as { variantId: string; quantity: string }[];
        return ok(quoteCart(store, lines, (body.zoneId as string) || undefined));
      }
      case "checkout.complete": {
        sweepExpiredReservations(store);
        const result = createOnlineOrder(store, {
          lines: (body.lines ?? []) as { variantId: string; quantity: string }[],
          customerName: b("customerName"),
          customerPhone: b("customerPhone"),
          customerEmail: b("customerEmail") || undefined,
          customerId: b("customerId") || undefined,
          addressId: b("addressId") || undefined,
          guestAddress: (body.guestAddress as never) || undefined,
          fulfilment: (b("fulfilment") as "delivery" | "collection") || "delivery",
          zoneId: b("zoneId") || undefined,
          slotId: b("slotId") || undefined,
          paymentMethod: b("paymentMethod") as never,
          note: b("note") || undefined,
          idempotencyKey: b("idempotencyKey") || nextId("idem"),
        });
        return ok({ orderId: result.order.id, reference: result.order.reference, verificationCode: result.order.verificationCode, paymentRequired: result.paymentRequired });
      }
      case "checkout.payment-outcome": {
        const outcome = b("outcome") as "succeeded" | "failed" | "pending";
        const r = paymentCallback(store, b("orderId"), outcome);
        return ok({ duplicate: r.duplicate, paymentStatus: r.order.paymentStatus });
      }
      case "checkout.status":
      case "orders.detail": {
        sweepExpiredReservations(store);
        return ok(publicOrder(store, q("orderId") || b("orderId")));
      }
      case "orders.track": {
        sweepExpiredReservations(store);
        const reference = (body.reference || query.get("reference") || "").trim().toUpperCase();
        const code = (body.code || query.get("code") || "").trim().toUpperCase();
        const order = store.orders.find((o) => o.reference === reference);
        if (!order || !order.verificationCode || order.verificationCode.toUpperCase() !== code) {
          throw new OpError("VALIDATION_FAILED", "We could not match that order reference and code. Check both and try again.");
        }
        return ok(publicOrder(store, order.id));
      }

      /* ---------------- Delivery config (public) ---------------- */
      case "checkout.zones": {
        return ok(store.zones.filter((z) => z.isActive && store.settings.deliveryEnabled));
      }
      case "checkout.slots": {
        const zoneId = q("zoneId");
        const slots = store.slots.filter((s) => s.zoneId === zoneId && s.booked < s.capacity).slice(0, 9);
        return ok(slots);
      }

      /* ---------------- Customer account (demo) ---------------- */
      case "account.summary": {
        const customer = store.customers.find((c) => c.id === q("customerId")) ?? store.customers[0];
        const orders = store.orders.filter((o) => o.customerId === customer.id);
        const returns = store.returnRequests.filter((r) => r.customerId === customer.id);
        return ok({
          customer,
          addresses: store.addresses.filter((a) => a.customerId === customer.id),
          ordersCount: orders.length,
          openOrders: orders.filter((o) => !["delivered", "collected", "cancelled"].includes(o.fulfilmentStatus)).length,
          returnsCount: returns.length,
          recentOrders: orders.slice(-5).reverse().map((o) => ({ id: o.id, reference: o.reference, totalMinor: o.totalMinor, totalLabel: formatMoney(o.totalMinor), fulfilmentStatus: o.fulfilmentStatus, paymentStatus: o.paymentStatus, createdAt: o.createdAt, createdAtLabel: formatDateTime(o.createdAt) })),
        });
      }
      case "account.orders": {
        const customer = store.customers.find((c) => c.id === q("customerId")) ?? store.customers[0];
        const orders = store.orders
          .filter((o) => o.customerId === customer.id)
          .sort((a, b2) => (a.createdAt < b2.createdAt ? 1 : -1))
          .map((o) => ({ id: o.id, reference: o.reference, totalMinor: o.totalMinor, totalLabel: formatMoney(o.totalMinor), fulfilmentStatus: o.fulfilmentStatus, paymentStatus: o.paymentStatus, fulfilment: o.fulfilment, createdAt: o.createdAt, createdAtLabel: formatDateTime(o.createdAt), lineCount: o.lines.length }));
        return ok(orders);
      }
      case "account.cancel": {
        const order = cancelOrder(store, b("orderId"), "customer", b("reason") || "Customer request");
        return ok({ fulfilmentStatus: order.fulfilmentStatus });
      }
      case "account.return-lines": {
        const order = mustOrder(store, b("orderId"));
        return ok(eligibleReturnLines(store, order).map((e) => ({
          lineId: e.line.id, productName: e.line.productName, variantName: e.line.variantName,
          quantity: e.line.quantity, returnedSoFar: e.returnedSoFar, eligible: e.eligible,
          unitPriceMinor: e.line.unitPriceMinor, unitPriceLabel: formatMoney(e.line.unitPriceMinor),
          maxRefundMinor: e.unitRefundMinor * Number(e.eligible), maxRefundLabel: formatMoney(e.unitRefundMinor * Number(e.eligible)),
        })));
      }
      case "account.create-return": {
        const ret = createReturn(store, {
          orderId: b("orderId"),
          lines: (body.lines ?? []) as { orderLineId: string; quantity: string; reason: string }[],
          requestedBy: "customer",
          customerId: b("customerId") || undefined,
          evidenceNote: b("evidenceNote") || undefined,
        });
        return ok({ returnId: ret.id, reference: ret.reference, status: ret.status });
      }
      case "account.returns": {
        const customer = store.customers.find((c) => c.id === q("customerId")) ?? store.customers[0];
        const list = store.returnRequests
          .filter((r) => r.customerId === customer.id)
          .map((r) => {
            const lines = r.lines.map((id) => store.returnLines.find((l) => l.id === id)!);
            return {
              id: r.id, reference: r.reference, orderId: r.orderId, orderReference: store.orders.find((o) => o.id === r.orderId)?.reference,
              status: r.status, createdAt: r.createdAt, createdAtLabel: formatDateTime(r.createdAt),
              lines: lines.map((l) => ({ productName: store.orderLines.find((x) => x.id === l.orderLineId)?.productName ?? "", quantity: l.quantity, reason: l.reason, refundMinor: l.approvedRefundMinor ?? l.requestedRefundMinor, refundLabel: formatMoney(l.approvedRefundMinor ?? l.requestedRefundMinor) })),
              refund: store.refunds.find((f) => f.returnId === r.id),
            };
          });
        return ok(list);
      }
      case "returns.detail": {
        const ret = store.returnRequests.find((r) => r.id === q("returnId") || r.reference === q("returnId"));
        if (!ret) throw new OpError("VALIDATION_FAILED", "Return not found.");
        const lines = ret.lines.map((id) => store.returnLines.find((l) => l.id === id)!);
        const refunds = store.refunds.filter((f) => f.returnId === ret.id);
        return ok({
          id: ret.id, reference: ret.reference, orderId: ret.orderId, orderReference: store.orders.find((o) => o.id === ret.orderId)?.reference,
          status: ret.status, requestedBy: ret.requestedBy, evidenceNote: ret.evidenceNote,
          createdAt: ret.createdAt, createdAtLabel: formatDateTime(ret.createdAt),
          receivedAt: ret.receivedAt, inspectedAt: ret.inspectedAt, disposition: ret.disposition,
          lines: lines.map((l) => ({
            id: l.id, productName: store.orderLines.find((x) => x.id === l.orderLineId)?.productName ?? "",
            variantName: store.orderLines.find((x) => x.id === l.orderLineId)?.variantName ?? "",
            quantity: l.quantity, reason: l.reason,
            requestedRefundMinor: l.requestedRefundMinor, requestedRefundLabel: formatMoney(l.requestedRefundMinor),
            approvedRefundMinor: l.approvedRefundMinor, approvedRefundLabel: l.approvedRefundMinor !== undefined ? formatMoney(l.approvedRefundMinor) : undefined,
          })),
          refunds: refunds.map((f) => ({ ...f, amountLabel: formatMoney(f.amountMinor) })),
        });
      }

      /* ---------------- AI (customer-facing) ---------------- */
      case "ai.assistant": {
        return ok(shoppingAssistant(store, b("question")));
      }
      case "ai.budget-basket": {
        return ok(budgetBasket(store, n("budgetMinor", 0)));
      }

      /* ---------------- Staff: dashboard & orders ---------------- */
      case "admin.dashboard": {
        sweepExpiredReservations(store);
        return ok(dashboardSummary(store));
      }
      case "admin.orders": {
        sweepExpiredReservations(store);
        const channel = q("channel");
        const status = q("status");
        const payment = q("payment");
        const search = q("q").toLowerCase();
        let orders = store.orders.slice();
        if (channel) orders = orders.filter((o) => o.channel === channel);
        if (status) orders = orders.filter((o) => o.fulfilmentStatus === status);
        if (payment) orders = orders.filter((o) => o.paymentStatus === payment);
        if (search) {
          orders = orders.filter((o) =>
            `${o.reference} ${o.customerName} ${o.customerPhone}`.toLowerCase().includes(search)
          );
        }
        orders.sort((a, b2) => (a.createdAt < b2.createdAt ? 1 : -1));
        return ok(orders.map((o) => ({
          id: o.id, reference: o.reference, channel: o.channel, customerName: o.customerName, customerPhone: o.customerPhone,
          fulfilment: o.fulfilment, totalMinor: o.totalMinor, totalLabel: formatMoney(o.totalMinor),
          paymentStatus: o.paymentStatus, fulfilmentStatus: o.fulfilmentStatus, deliveryStatus: o.deliveryStatus,
          lineCount: o.lines.length, createdAt: o.createdAt, createdAtLabel: formatDateTime(o.createdAt), posReceiptNo: o.posReceiptNo,
        })));
      }
      case "admin.order": {
        sweepExpiredReservations(store);
        const view = publicOrder(store, q("orderId"));
        const order = mustOrder(store, q("orderId"));
        const internal = {
          address: store.addresses.find((a) => a.id === order.addressId),
          zone: store.zones.find((z) => z.id === order.zoneId),
          customerId: order.customerId,
          customerNotes: order.notes,
          reservations: store.reservations.filter((r) => r.orderId === order.id).map((r) => ({
            id: r.id, variantId: r.variantId, quantity: r.quantity, expiresAt: r.expiresAt,
            consumedAt: r.consumedAt, releasedAt: r.releasedAt, releasedReason: r.releasedReason,
          })),
          suggestions: store.variants
            .filter((v) => v.id !== order.lines[0] && v.productId === store.variants.find((x) => x.id === order.lines[0])?.productId)
            .slice(0, 4)
            .map((v) => ({ id: v.id, name: v.name, priceMinor: v.priceMinor, priceLabel: formatMoney(v.priceMinor), availableToSell: availability(store, v.id).availableToSell })),
          refunds: store.refunds.filter((f) => f.orderId === order.id).map((f) => ({ ...f, amountLabel: formatMoney(f.amountMinor) })),
        };
        return ok({ order: view, internal });
      }
      case "admin.order.action": {
        const action = b("action");
        const orderId = b("orderId");
        const actor = b("actor") || "stf_ama";
        const order = mustOrder(store, orderId);
        switch (action) {
          case "confirm": confirmOrder(store, orderId, actor, b("note") || undefined); break;
          case "picking": startPicking(store, orderId, actor); break;
          case "packed": markPacked(store, orderId, actor, b("note") || undefined); break;
          case "ready_for_collection": markReadyForCollection(store, orderId, actor); break;
          case "collect": markCollected(store, orderId, actor); break;
          case "dispatch": markDispatched(store, orderId, actor); break;
          case "deliver": markDelivered(store, orderId, actor, b("note") || undefined); break;
          case "cancel": cancelOrder(store, orderId, actor, b("reason") || "No reason given"); break;
          case "note": addOrderNote(store, orderId, actor, b("note"), body.internalOnly === true); break;
          case "substitute": substituteLine(store, orderId, b("lineId"), b("newVariantId"), actor, b("permissionNote") || "Customer agreed by phone"); break;
          case "resolve_review": resolveReviewOrder(store, orderId, actor, b("decision") as "fulfil" | "cancel_refund", b("reason")); break;
          default: throw new OpError("VALIDATION_FAILED", `Unknown order action ${action}`);
        }
        void order;
        return ok(publicOrder(store, orderId));
      }

      /* ---------------- Staff: fulfilment ---------------- */
      case "admin.fulfilment": {
        sweepExpiredReservations(store);
        const buildQueue = (statuses: string[]) =>
          store.orders
            .filter((o) => statuses.includes(o.fulfilmentStatus))
            .sort((a, b2) => (a.createdAt < b2.createdAt ? -1 : 1))
            .map((o) => ({
              id: o.id, reference: o.reference, customerName: o.customerName, channel: o.channel,
              fulfilment: o.fulfilment, slotLabel: o.slotLabel, totalLabel: formatMoney(o.totalMinor),
              paymentStatus: o.paymentStatus, fulfilmentStatus: o.fulfilmentStatus,
              lines: orderLinesOf(store, o).map((l) => ({
                id: l.id, productName: l.productName, variantName: l.variantName, unit: l.unit,
                quantity: l.quantity, note: l.note,
                allocations: l.allocations.map((a) => {
                  const lot = store.lots.find((x) => x.id === a.lotId);
                  return { lotId: a.lotId, lotNumber: lot?.lotNumber ?? "?", quantity: a.quantity, expiry: lot?.expiryDate };
                }),
                availableToSell: availability(store, l.variantId).availableToSell,
              })),
            }));
        return ok({
          confirm: store.orders.filter((o) => o.fulfilmentStatus === "awaiting_confirmation" && o.channel === "online").map((o) => ({ id: o.id, reference: o.reference, customerName: o.customerName, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, fulfilment: o.fulfilment, totalLabel: formatMoney(o.totalMinor), createdAt: o.createdAt, createdAtLabel: formatDateTime(o.createdAt), lineCount: o.lines.length })),
          pick: buildQueue(["confirmed", "picking"]),
          pack: buildQueue(["picking"]),
          dispatch: store.orders.filter((o) => o.fulfilmentStatus === "packed" && o.fulfilment === "delivery").map((o) => ({ id: o.id, reference: o.reference, zone: store.zones.find((z) => z.id === o.zoneId)?.name, totalLabel: formatMoney(o.totalMinor), paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, lineCount: o.lines.length })),
          collection: store.orders.filter((o) => o.fulfilmentStatus === "ready_for_collection" || (o.fulfilment === "collection" && ["awaiting_confirmation", "confirmed", "picking", "packed"].includes(o.fulfilmentStatus))).map((o) => ({ id: o.id, reference: o.reference, customerName: o.customerName, fulfilmentStatus: o.fulfilmentStatus, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, totalLabel: formatMoney(o.totalMinor), lineCount: o.lines.length })),
        });
      }

      /* ---------------- Staff: POS ---------------- */
      case "admin.pos.search": {
        sweepExpiredReservations(store);
        const search = q("q").toLowerCase();
        let variants = store.variants.filter((v) => v.isActive);
        if (search) {
          variants = variants.filter((v) => {
            const p = store.products.find((x) => x.id === v.productId);
            return `${p?.name ?? ""} ${v.name} ${v.barcode ?? ""}`.toLowerCase().includes(search);
          });
        }
        return ok(variants.slice(0, 24).map((v) => {
          const p = store.products.find((x) => x.id === v.productId)!;
          const a = availability(store, v.id);
          return {
            variantId: v.id, productId: p.id, productName: p.name, variantName: v.name,
            unit: v.unit, priceMinor: v.priceMinor, priceLabel: formatMoney(v.priceMinor),
            barcode: v.barcode, image: `/products/${p.slug}.svg`,
            availableToSell: a.availableToSell, isAvailable: a.isAvailable,
          };
        }));
      }
      case "admin.pos.complete": {
        const result = completeSale(store, {
          sessionId: b("sessionId"),
          cashierId: b("cashierId") || "stf_adjoa",
          lines: (body.lines ?? []) as { variantId: string; quantity: string }[],
          method: b("method") as never,
          discountMinor: n("discountMinor", 0),
          customerName: b("customerName") || undefined,
          customerPhone: b("customerPhone") || undefined,
          cashReceivedMinor: body.cashReceivedMinor !== undefined ? n("cashReceivedMinor", 0) : undefined,
          idempotencyKey: b("idempotencyKey") || nextId("idem"),
        });
        return ok({
          orderId: result.order.id, reference: result.order.reference, receiptNo: result.receiptNo,
          totalMinor: result.order.totalMinor, totalLabel: formatMoney(result.order.totalMinor),
          changeMinor: result.changeMinor, changeLabel: formatMoney(result.changeMinor),
          lines: result.order.lines.map((lid) => {
            const l = store.orderLines.find((x) => x.id === lid)!;
            return { productName: l.productName, variantName: l.variantName, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, lineTotalMinor: l.lineTotalMinor };
          }),
          businessName: store.settings.businessName, at: nowIso(),
        });
      }
      case "admin.pos.hold": {
        const draft = holdSale(store, {
          sessionId: b("sessionId"),
          cashierId: b("cashierId") || "stf_adjoa",
          label: b("label"),
          lines: (body.lines ?? []) as { variantId: string; quantity: string }[],
        });
        return ok({ draftId: draft.id, label: draft.label, expiresAt: draft.expiresAt });
      }
      case "admin.pos.drafts": {
        const sessionId = q("sessionId");
        const drafts = store.heldDrafts.filter((d) => d.sessionId === sessionId && d.expiresAt > nowIso());
        return ok(drafts.map((d) => ({
          id: d.id, label: d.label, createdAt: d.createdAt, createdAtLabel: formatDateTime(d.createdAt),
          expiresAt: d.expiresAt, lineCount: d.lines.length,
          totalMinor: d.lines.reduce((a, l) => a + l.unitPriceMinor * Number(l.quantity), 0),
          lines: d.lines,
        })));
      }
      case "admin.pos.resume": {
        return ok(resumeDraft(store, b("draftId")));
      }
      case "admin.pos.release-draft": {
        releaseDraft(store, b("draftId"));
        return ok({ released: true });
      }
      case "admin.pos.receipt-lookup": {
        const key = q("receiptNo") || b("receiptNo");
        const found = lookupReceipt(store, key);
        if (!found) throw new OpError("VALIDATION_FAILED", "No transaction found for that receipt number.");
        return ok({
          receiptNo: found.txn.receiptNo, at: found.txn.at, atLabel: formatDateTime(found.txn.at),
          method: found.txn.method, totalMinor: found.txn.totalMinor, totalLabel: formatMoney(found.txn.totalMinor),
          cashierName: found.txn.cashierName, orderId: found.order.id, orderReference: found.order.reference,
          lines: found.lines.map((l) => ({ id: l.id, productName: l.productName, variantName: l.variantName, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, unitTotal: l.lineTotalMinor })),
          returnable: eligibleReturnLines(store, found.order).map((e) => ({
            lineId: e.line.id, productName: e.line.productName, variantName: e.line.variantName,
            eligible: e.eligible, unitPriceMinor: e.line.unitPriceMinor,
          })),
        });
      }

      /* ---------------- Staff: cashier sessions ---------------- */
      case "admin.sessions": {
        const sessions = store.cashierSessions.map((s) => {
          const expected = s.status === "open" ? expectedCash(store, s) : s.expectedCashMinor ?? 0;
          return {
            id: s.id, cashierName: s.cashierName, openedAt: s.openedAt, openedAtLabel: formatDateTime(s.openedAt),
            closedAt: s.closedAt, closedAtLabel: s.closedAt ? formatDateTime(s.closedAt) : undefined,
            status: s.status, openingFloatMinor: s.openingFloatMinor, openingFloatLabel: formatMoney(s.openingFloatMinor),
            expectedMinor: expected, expectedLabel: formatMoney(expected),
            countedCashMinor: s.countedCashMinor, countedLabel: s.countedCashMinor !== undefined ? formatMoney(s.countedCashMinor) : undefined,
            differenceMinor: s.differenceMinor, differenceLabel: s.differenceMinor !== undefined ? formatMoney(s.differenceMinor) : undefined,
            closeNote: s.closeNote,
            movements: s.movements.map((m) => ({ ...m, amountLabel: formatMoney(m.amountMinor), atLabel: formatDateTime(m.at) })),
            cashSales: store.orders.filter((o) => o.posSessionId === s.id && o.paymentMethod === "cash_counter").length,
          };
        });
        return ok(sessions);
      }
      case "admin.sessions.open": {
        const session = openSession(store, b("cashierId") || "stf_adjoa", n("openingFloatMinor", 0));
        return ok({ sessionId: session.id });
      }
      case "admin.sessions.movement": {
        const s = cashMovement(store, b("sessionId"), b("kind") as never, n("amountMinor", 0), b("note"), b("actor") || "stf_adjoa");
        return ok({ movements: s.movements.length });
      }
      case "admin.sessions.close": {
        const s = closeSession(store, b("sessionId"), n("countedCashMinor", 0), b("note"), b("actor") || "stf_adjoa");
        return ok({ differenceMinor: s.differenceMinor, differenceLabel: s.differenceMinor !== undefined ? formatMoney(s.differenceMinor) : undefined });
      }

      /* ---------------- Staff: inventory ---------------- */
      case "admin.inventory.overview": {
        sweepExpiredReservations(store);
        const rows = store.variants.map((v) => {
          const a = availability(store, v.id);
          const p = store.products.find((x) => x.id === v.productId)!;
          const movements = store.movements.filter((m) => m.variantId === v.id);
          return {
            variantId: v.id, productId: p.id, productName: p.name, variantName: v.name, unit: v.unit,
            sellablePhysical: a.sellablePhysical, reserved: a.reserved, safetyStock: a.safetyStock,
            availableToSell: a.availableToSell, isAvailable: a.isAvailable,
            nextExpiry: a.nextExpiry, lotCount: a.lots.length,
            lastMovementAt: movements[0]?.at, lastMovement: movements[0]?.reason,
            image: `/products/${p.slug}.svg`,
          };
        });
        const search = q("q").toLowerCase();
        const filter = q("filter");
        let filtered = rows;
        if (search) filtered = filtered.filter((r) => `${r.productName} ${r.variantName}`.toLowerCase().includes(search));
        if (filter === "low") filtered = filtered.filter((r) => Number(r.availableToSell) > 0 && Number(r.availableToSell) <= 3);
        if (filter === "zero") filtered = filtered.filter((r) => Number(r.availableToSell) === 0);
        if (filter === "reserved") filtered = filtered.filter((r) => Number(r.reserved) > 0);
        return ok({ rows: filtered, total: rows.length });
      }
      case "admin.inventory.receipts": {
        return ok(store.goodsReceipts.map((g) => ({
          id: g.id, supplierName: store.suppliers.find((s) => s.id === g.supplierId)?.name,
          poRef: store.purchaseOrders.find((p) => p.id === g.purchaseOrderId)?.reference,
          lines: g.lines.map((l) => ({
            productName: store.products.find((p) => p.id === store.variants.find((v) => v.id === l.variantId)?.productId)?.name,
            variantName: store.variants.find((v) => v.id === l.variantId)?.name,
            lotNumber: l.lotNumber, quantity: l.quantity, expiryDate: l.expiryDate,
          })),
          receivedAt: g.receivedAt, receivedAtLabel: formatDateTime(g.receivedAt),
          receivedBy: store.staff.find((s) => s.id === g.receivedBy)?.name, note: g.note,
        })));
      }
      case "admin.inventory.receive": {
        const receipt = receiveGoods(store, {
          supplierId: b("supplierId"),
          purchaseOrderId: b("purchaseOrderId") || undefined,
          lines: (body.lines ?? []) as { variantId: string; lotNumber: string; quantity: string; expiryDate?: string }[],
          note: b("note") || undefined,
          actor: b("actor") || "stf_nana",
        });
        return ok({ receiptId: receipt.id });
      }
      case "admin.inventory.adjustments": {
        return ok(store.adjustments.map((a) => {
          const v = store.variants.find((x) => x.id === a.variantId);
          const p = v ? store.products.find((x) => x.id === v.productId) : undefined;
          return {
            id: a.id, productName: p?.name ?? "", variantName: v?.name ?? "", lotNumber: store.lots.find((l) => l.id === a.lotId)?.lotNumber,
            delta: a.delta, reason: a.reason, note: a.note, status: a.status,
            requestedBy: store.staff.find((s) => s.id === a.requestedBy)?.name, approvedBy: store.staff.find((s) => s.id === a.approvedBy)?.name,
            at: a.at, atLabel: formatDateTime(a.at),
          };
        }));
      }
      case "admin.inventory.adjustments.create": {
        const adj = requestAdjustment(store, {
          variantId: b("variantId"), lotId: b("lotId"), delta: b("delta"),
          reason: b("reason"), note: b("note") || undefined, actor: b("actor") || "stf_nana",
        });
        return ok({ adjustmentId: adj.id, status: adj.status });
      }
      case "admin.inventory.adjustments.decide": {
        const adj = decideAdjustment(store, b("adjustmentId"), b("decision") as "approve" | "reject", b("actor") || "stf_kojo");
        return ok({ status: adj.status });
      }
      case "admin.inventory.lots": {
        const variantId = q("variantId");
        const rows = store.lots
          .filter((l) => !variantId || l.variantId === variantId)
          .map((l) => {
            const v = store.variants.find((x) => x.id === l.variantId);
            const p = v ? store.products.find((x) => x.id === v.productId) : undefined;
            const expired = !!l.expiryDate && l.expiryDate <= nowIso();
            return {
              id: l.id, productName: p?.name ?? "", variantName: v?.name ?? "", lotNumber: l.lotNumber,
              quantity: l.quantity, kind: l.kind, isQuarantined: l.isQuarantined, expired,
              expiryDate: l.expiryDate, location: store.locations.find((x) => x.id === l.locationId)?.name,
              supplierName: store.suppliers.find((s) => s.id === l.supplierId)?.name, notes: l.notes,
              variantId: l.variantId,
            };
          });
        return ok(rows);
      }
      case "admin.inventory.lot.quarantine": {
        setLotQuarantine(store, b("lotId"), body.quarantine !== false, b("actor") || "stf_nana", b("note"));
        return ok({ done: true });
      }
      case "admin.inventory.lot.dispose": {
        disposeLot(store, b("lotId"), b("actor") || "stf_nana", b("reason"));
        return ok({ done: true });
      }
      case "admin.inventory.expiry": {
        const overview = expiryOverview(store);
        const map = (l: { lotNumber: string; variantId: string; quantity: string; expiryDate?: string; notes?: string; id: string }) => {
          const v = store.variants.find((x) => x.id === l.variantId);
          const p = v ? store.products.find((x) => x.id === v.productId) : undefined;
          return {
            id: l.id, productName: p?.name ?? "", variantName: v?.name ?? "", lotNumber: l.lotNumber,
            quantity: l.quantity, expiryDate: l.expiryDate, notes: l.notes, variantId: l.variantId,
          };
        };
        return ok({
          expired: overview.expired.map(map),
          soon: overview.soon.map((x) => ({ ...map(x.lot), daysLeft: x.daysLeft })),
          quarantined: overview.quarantined.map(map),
          damaged: overview.damaged.map(map),
        });
      }
      case "admin.inventory.stocktakes": {
        return ok(store.stocktakes.map((s) => ({
          id: s.id, reference: s.reference, status: s.status, openedAt: s.openedAt, openedAtLabel: formatDateTime(s.openedAt),
          closedAt: s.closedAt, openedBy: store.staff.find((x) => x.id === s.openedBy)?.name,
          lines: s.lines.map((l) => {
            const v = store.variants.find((x) => x.id === l.variantId);
            const p = v ? store.products.find((x) => x.id === v.productId) : undefined;
            return { variantId: l.variantId, productName: p?.name ?? "", variantName: v?.name ?? "", expectedQty: l.expectedQty, countedQty: l.countedQty, variance: l.variance, status: l.status };
          }),
        })));
      }
      case "admin.inventory.stocktakes.open": {
        const stk = openStocktake(store, b("locationId") || "loc_store", (body.variantIds ?? []) as string[], b("actor") || "stf_nana");
        return ok({ stocktakeId: stk.id, reference: stk.reference });
      }
      case "admin.inventory.stocktakes.count": {
        const stk = recordCounts(store, b("stocktakeId"), (body.counts ?? {}) as Record<string, string>, b("actor") || "stf_nana");
        return ok({ status: stk.status });
      }
      case "admin.inventory.stocktakes.close": {
        const stk = closeStocktake(store, b("stocktakeId"), body.applyCorrections === true, b("actor") || "stf_nana");
        return ok({ status: stk.status });
      }

      /* ---------------- Staff: catalogue & purchasing ---------------- */
      case "admin.products": {
        const rows = store.products.map((p) => {
          const cat = store.categories.find((c) => c.id === p.categoryId);
          const variants = p.variants.map((vid) => {
            const v = store.variants.find((x) => x.id === vid)!;
            const a = availability(store, vid);
            return { id: v.id, name: v.name, priceMinor: v.priceMinor, priceLabel: formatMoney(v.priceMinor), barcode: v.barcode, unit: v.unit, availableToSell: a.availableToSell, isAvailable: a.isAvailable, purchaseUnit: v.purchaseUnit, safetyStock: v.safetyStock, isActive: v.isActive };
          });
          return {
            id: p.id, name: p.name, slug: p.slug, categoryName: cat?.name, categoryId: p.categoryId,
            isPublished: p.isPublished, shortDescription: p.shortDescription, image: `/products/${p.slug}.svg`,
            variants, anyAvailable: variants.some((v) => v.isAvailable),
          };
        });
        const search = q("q").toLowerCase();
        const filtered = search ? rows.filter((r) => r.name.toLowerCase().includes(search)) : rows;
        return ok(filtered);
      }
      case "admin.product": {
        const p = store.products.find((x) => x.id === q("productId") || x.slug === q("productId"));
        if (!p) throw new OpError("VALIDATION_FAILED", "Product not found.");
        const cat = store.categories.find((c) => c.id === p.categoryId);
        const lots = store.lots.filter((l) => p.variants.includes(l.variantId));
        const movements = store.movements.filter((m) => p.variants.includes(m.variantId)).slice(0, 20);
        return ok({
          id: p.id, name: p.name, slug: p.slug, description: p.description, shortDescription: p.shortDescription,
          tags: p.tags, isPublished: p.isPublished, categoryName: cat?.name, categoryId: p.categoryId,
          image: `/products/${p.slug}.svg`,
          variants: p.variants.map((vid) => {
            const v = store.variants.find((x) => x.id === vid)!;
            const a = availability(store, vid);
            return {
              id: v.id, name: v.name, unit: v.unit, unitSize: v.unitSize, priceMinor: v.priceMinor,
              priceLabel: formatMoney(v.priceMinor), compareAtPriceMinor: v.compareAtPriceMinor,
              barcode: v.barcode, purchaseUnit: v.purchaseUnit, safetyStock: v.safetyStock, isActive: v.isActive,
              availability: a, lots: a.lots,
            };
          }),
          lots, movements: movements.map((m) => ({ ...m, atLabel: formatDateTime(m.at) })),
        });
      }
      case "admin.product.update": {
        const p = store.products.find((x) => x.id === b("productId"));
        if (!p) throw new OpError("VALIDATION_FAILED", "Product not found.");
        const actor = b("actor") || "stf_ama";
        if (typeof body.isPublished === "boolean") {
          const before = p.isPublished;
          p.isPublished = body.isPublished;
          p.updatedAt = nowIso();
          audit(store, actor, "catalog.publication_changed", "Product", p.id, { before: `${before}`, after: `${p.isPublished}` });
        }
        if (typeof body.description === "string" && body.description.trim()) {
          p.description = body.description.trim();
        }
        if (typeof body.shortDescription === "string" && body.shortDescription.trim()) {
          p.shortDescription = body.shortDescription.trim();
        }
        return ok({ done: true });
      }
      case "admin.variant.update": {
        const v = store.variants.find((x) => x.id === b("variantId"));
        if (!v) throw new OpError("VALIDATION_FAILED", "Variant not found.");
        const actor = b("actor") || "stf_ama";
        if (typeof body.priceMinor === "number") {
          if (body.priceMinor <= 0) throw new OpError("VALIDATION_FAILED", "Price must be positive.");
          const before = v.priceMinor;
          v.priceMinor = Math.round(body.priceMinor as number);
          audit(store, actor, "catalog.price_change", "ProductVariant", v.id, { before: `${before}`, after: `${v.priceMinor}`, reason: b("reason") || undefined });
        }
        if (typeof body.safetyStock === "string" && /^\d+(\.\d+)?$/.test(body.safetyStock)) {
          v.safetyStock = body.safetyStock;
        }
        return ok({ done: true });
      }
      case "admin.categories": {
        return ok(store.categories.map((c) => ({
          id: c.id, slug: c.slug, name: c.name, description: c.description, isActive: c.isActive, sortOrder: c.sortOrder,
          productCount: store.products.filter((p) => p.categoryId === c.id).length,
          availableCount: store.products.filter((p) => p.categoryId === c.id && isProductPurchasable(store, p.id)).length,
        })));
      }
      case "admin.categories.update": {
        const c = store.categories.find((x) => x.id === b("categoryId"));
        if (!c) throw new OpError("VALIDATION_FAILED", "Category not found.");
        if (typeof body.name === "string" && body.name.trim()) c.name = body.name.trim();
        if (typeof body.description === "string" && body.description.trim()) c.description = body.description.trim();
        if (typeof body.isActive === "boolean") c.isActive = body.isActive;
        audit(store, b("actor") || "stf_ama", "catalog.category_updated", "Category", c.id);
        return ok({ done: true });
      }
      case "admin.suppliers": {
        return ok(store.suppliers.map((s) => ({
          ...s,
          poCount: store.purchaseOrders.filter((p) => p.supplierId === s.id).length,
          openPoCount: store.purchaseOrders.filter((p) => p.supplierId === s.id && ["draft", "sent", "partially_received"].includes(p.status)).length,
        })));
      }
      case "admin.purchases": {
        return ok(store.purchaseOrders.map((p) => {
          const supplier = store.suppliers.find((s) => s.id === p.supplierId);
          return {
            id: p.id, reference: p.reference, supplierName: supplier?.name, status: p.status,
            expectedAt: p.expectedAt, expectedLabel: p.expectedAt ? formatDateTime(p.expectedAt) : undefined,
            createdAt: p.createdAt, createdAtLabel: formatDateTime(p.createdAt), note: p.note,
            lines: p.lines.map((l) => {
              const v = store.variants.find((x) => x.id === l.variantId);
              const prod = v ? store.products.find((x) => x.id === v.productId) : undefined;
              return { productName: prod?.name ?? "", variantName: v?.name ?? "", quantity: l.quantity, unitCostMinor: l.unitCostMinor, unitCostLabel: formatMoney(l.unitCostMinor) };
            }),
          };
        }));
      }
      case "admin.purchases.create": {
        const supplierId = b("supplierId");
        if (!store.suppliers.some((s) => s.id === supplierId)) throw new OpError("VALIDATION_FAILED", "Unknown supplier.");
        const lines = (body.lines ?? []) as { variantId: string; quantity: string; unitCostMinor: number }[];
        if (!lines.length) throw new OpError("VALIDATION_FAILED", "Add at least one line.");
        const po = {
          id: nextId("po"),
          reference: `PO-${String(store.sequences.po).padStart(4, "0")}`,
          supplierId,
          status: "draft" as const,
          lines,
          expectedAt: b("expectedAt") || undefined,
          createdAt: nowIso(),
          note: b("note") || "Draft created from the replenishment assistant suggestion (reviewable).",
        };
        store.sequences.po += 1;
        store.purchaseOrders.unshift(po);
        audit(store, b("actor") || "stf_nana", "purchasing.po_created", "PurchaseOrder", po.id);
        return ok({ poId: po.id, reference: po.reference });
      }
      case "admin.purchases.send": {
        const po = store.purchaseOrders.find((x) => x.id === b("poId"));
        if (!po) throw new OpError("VALIDATION_FAILED", "Purchase order not found.");
        if (po.status !== "draft") throw new OpError("VALIDATION_FAILED", "Only drafts can be marked as sent.");
        po.status = "sent";
        audit(store, b("actor") || "stf_nana", "purchasing.po_sent", "PurchaseOrder", po.id);
        return ok({ status: po.status });
      }

      /* ---------------- Staff: dispatch & riders ---------------- */
      case "admin.dispatch.queue": {
        sweepExpiredReservations(store);
        const ready = store.orders
          .filter((o) => o.fulfilmentStatus === "packed" && o.fulfilment === "delivery")
          .map((o) => ({
            id: o.id, reference: o.reference, customerName: o.customerName, customerPhone: o.customerPhone,
            zone: store.zones.find((z) => z.id === o.zoneId)?.name, zoneId: o.zoneId,
            slotLabel: o.slotLabel, totalLabel: formatMoney(o.totalMinor),
            paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
            codAmountMinor: o.paymentMethod === "cash_on_delivery" ? o.totalMinor : 0,
            lineCount: o.lines.length,
          }));
        const jobs = store.deliveryJobs.map((j) => {
          const o = store.orders.find((x) => x.id === j.orderId);
          return {
            id: j.id, orderId: j.orderId, orderReference: o?.reference, customerName: o?.customerName,
            status: j.status, riderName: store.riders.find((r) => r.id === j.riderId)?.name,
            providerName: store.providers.find((p) => p.id === j.providerId)?.name,
            zone: store.zones.find((z) => z.id === j.zoneId)?.name,
            failureReason: j.failureReason, rescheduledFor: j.rescheduledFor,
            cashToCollectMinor: j.cashToCollectMinor, cashToCollectLabel: j.cashToCollectMinor ? formatMoney(j.cashToCollectMinor) : undefined,
            cashCollectedAt: j.cashCollectedAt, remittedAt: j.remittedAt,
            proof: j.proof, instructions: j.instructions,
            events: j.events.map((e) => ({ ...e, atLabel: formatDateTime(e.at) })),
          };
        });
        const riders = store.riders.map((r) => ({
          id: r.id, name: r.name, phone: r.phone, kind: r.kind, vehicle: r.vehicle,
          isAvailable: r.isAvailable, activeJobId: r.activeJobId, zones: r.zoneIds.map((z) => store.zones.find((x) => x.id === z)?.name),
          pendingRemittanceMinor: pendingRemittance(store, r.id).totalMinor,
          pendingRemittanceLabel: formatMoney(pendingRemittance(store, r.id).totalMinor),
        }));
        const providers = store.providers;
        return ok({ ready, jobs, riders, providers });
      }
      case "admin.dispatch.assign": {
        const job = assignJob(store, b("orderId"), {
          riderId: b("riderId") || undefined,
          providerId: b("providerId") || undefined,
          manual: body.manual === true,
        }, b("actor") || "stf_dela");
        return ok({ jobId: job.id, status: job.status });
      }
      case "admin.dispatch.job.action": {
        const action = b("action");
        const actor = b("actor") || "stf_dela";
        if (action === "reschedule") rescheduleJob(store, b("jobId"), b("when") || "next window", actor);
        else if (action === "return_to_store") returnToStore(store, b("jobId"), actor, b("note"));
        else if (action === "remit") remitCash(store, b("riderId"), n("amountMinor", 0), actor);
        else throw new OpError("VALIDATION_FAILED", `Unknown dispatch action ${action}`);
        return ok({ done: true });
      }
      case "admin.riders": {
        return ok(store.riders.map((r) => {
          const rem = pendingRemittance(store, r.id);
          return {
            id: r.id, name: r.name, phone: r.phone, kind: r.kind, vehicle: r.vehicle,
            zoneIds: r.zoneIds, zoneNames: r.zoneIds.map((z) => store.zones.find((x) => x.id === z)?.name).join(", "),
            isAvailable: r.isAvailable, activeJobId: r.activeJobId,
            activeJob: store.deliveryJobs.find((j) => j.id === r.activeJobId)?.id,
            lastLocationAt: r.lastLocationAt, lastLocationLabel: r.lastLocationLabel, isDemo: r.isDemo,
            pendingRemittanceMinor: rem.totalMinor, pendingRemittanceLabel: formatMoney(rem.totalMinor),
            completedJobs: riderHistory(store, r.id).length,
          };
        }));
      }
      case "admin.riders.toggle": {
        const r = store.riders.find((x) => x.id === b("riderId"));
        if (!r) throw new OpError("VALIDATION_FAILED", "Rider not found.");
        if (r.activeJobId) throw new OpError("VALIDATION_FAILED", "Rider has an active job and cannot be marked available.");
        r.isAvailable = body.available === true;
        audit(store, b("actor") || "stf_dela", "riders.availability_changed", "Rider", r.id, { after: `${r.isAvailable}` });
        return ok({ isAvailable: r.isAvailable });
      }
      case "admin.providers": {
        return ok(store.providers.map((p) => ({
          ...p,
          capabilitiesNote: p.capabilities.join(", "),
          isConfigured: p.status === "configured",
        })));
      }

      /* ---------------- Staff: returns, refunds, payments, customers ---------------- */
      case "admin.returns": {
        const list = store.returnRequests.map((r) => {
          const order = store.orders.find((o) => o.id === r.orderId);
          const lines = r.lines.map((id) => store.returnLines.find((l) => l.id === id)!);
          const preview = refundPreview(store, r.orderId);
          return {
            id: r.id, reference: r.reference, orderReference: order?.reference, channel: r.channel,
            customerName: order?.customerName, requestedBy: r.requestedBy, status: r.status,
            createdAt: r.createdAt, createdAtLabel: formatDateTime(r.createdAt),
            lines: lines.map((l) => ({
              productName: store.orderLines.find((x) => x.id === l.orderLineId)?.productName ?? "",
              variantName: store.orderLines.find((x) => x.id === l.orderLineId)?.variantName ?? "",
              quantity: l.quantity, reason: l.reason,
              refundMinor: l.approvedRefundMinor ?? l.requestedRefundMinor,
              refundLabel: formatMoney(l.approvedRefundMinor ?? l.requestedRefundMinor),
            })),
            disposition: r.disposition, evidenceNote: r.evidenceNote,
            refundStatus: store.refunds.find((f) => f.returnId === r.id)?.status,
          };
        });
        void preview;
        return ok(list);
      }
      case "admin.return.action": {
        const action = b("action");
        const actor = b("actor") || "stf_kojo";
        switch (action) {
          case "approve":
          case "reject":
            decideReturn(store, b("returnId"), action, actor, b("note")); break;
          case "receive":
            receiveReturn(store, b("returnId"), actor); break;
          case "inspect":
            inspectReturn(store, b("returnId"), b("disposition") as never, actor, b("note")); break;
          case "request_refund": {
            requestRefund(store, b("returnId"), actor, b("method") as never); break;
          }
          default:
            throw new OpError("VALIDATION_FAILED", `Unknown return action ${action}`);
        }
        return ok({ done: true });
      }
      case "admin.refunds": {
        return ok(store.refunds.map((f) => ({
          id: f.id, returnReference: store.returnRequests.find((r) => r.id === f.returnId)?.reference,
          orderReference: store.orders.find((o) => o.id === f.orderId)?.reference,
          amountMinor: f.amountMinor, amountLabel: formatMoney(f.amountMinor),
          status: f.status, method: f.method, reason: f.reason,
          requestedBy: f.requestedBy, approvedBy: f.approvedBy, providerRef: f.providerRef,
          providerTransferState: f.providerTransferState, retryCount: f.retryCount,
          createdAt: f.createdAt, createdAtLabel: formatDateTime(f.createdAt),
        })));
      }
      case "admin.refund.action": {
        const action = b("action");
        const actor = b("actor") || "stf_serwaa";
        if (action === "approve") approveRefund(store, b("refundId"), actor);
        else if (action === "execute") executeRefund(store, b("refundId"), actor);
        else if (action === "retry") retryRefund(store, b("refundId"), actor);
        else throw new OpError("VALIDATION_FAILED", `Unknown refund action ${action}`);
        return ok({ done: true });
      }
      case "admin.payments": {
        const list = store.paymentAttempts.map((a) => {
          const o = store.orders.find((x) => x.id === a.orderId);
          return {
            id: a.id, orderReference: o?.reference, channel: o?.channel, method: a.method,
            amountMinor: a.amountMinor, amountLabel: formatMoney(a.amountMinor),
            status: a.status, providerRef: a.providerRef, settlementState: a.settlementState,
            callbackCount: a.callbackCount, failureReason: a.failureReason, note: a.note,
            createdAt: a.createdAt, createdAtLabel: formatDateTime(a.createdAt),
            resolvedAt: a.resolvedAt, orderId: a.orderId, orderFulfilment: o?.fulfilmentStatus,
          };
        });
        return ok(list);
      }
      case "admin.customers": {
        return ok(store.customers.map((c) => {
          const orders = store.orders.filter((o) => o.customerId === c.id);
          const spend = orders.filter((o) => ["succeeded", "partially_refunded", "refunded"].includes(o.paymentStatus)).reduce((a, o) => a + o.totalMinor, 0);
          return {
            id: c.id, name: c.name, phone: c.phone, email: c.email, isDemo: c.isDemo,
            supportNotes: c.supportNotes, createdAt: c.createdAt,
            orderCount: orders.length, spendMinor: spend, spendLabel: formatMoney(spend),
            returnCount: store.returnRequests.filter((r) => r.customerId === c.id).length,
            addressCount: store.addresses.filter((a) => a.customerId === c.id).length,
          };
        }));
      }
      case "admin.customer": {
        const c = store.customers.find((x) => x.id === q("customerId"));
        if (!c) throw new OpError("VALIDATION_FAILED", "Customer not found.");
        const orders = store.orders.filter((o) => o.customerId === c.id).map((o) => ({
          id: o.id, reference: o.reference, totalLabel: formatMoney(o.totalMinor), channel: o.channel,
          fulfilmentStatus: o.fulfilmentStatus, paymentStatus: o.paymentStatus,
          createdAt: o.createdAt, createdAtLabel: formatDateTime(o.createdAt),
        }));
        const returns = store.returnRequests.filter((r) => r.customerId === c.id).map((r) => ({ id: r.id, reference: r.reference, status: r.status, createdAt: r.createdAt }));
        return ok({ customer: c, addresses: store.addresses.filter((a) => a.customerId === c.id), orders, returns });
      }

      /* ---------------- Staff: reports, AI, team, audit, settings ---------------- */
      case "admin.reports": {
        return ok(buildReports(store));
      }
      case "admin.ai.suggestions": {
        return ok(store.aiSuggestions.map((s) => ({ ...s, createdAtLabel: formatDateTime(s.createdAt) })));
      }
      case "admin.ai.generate": {
        const generated = [...refreshStaffSuggestions(store), ...refreshExceptionFlags(store)];
        // replace previous generated ones (keep seeded for stability)
        store.aiSuggestions = store.aiSuggestions.filter((s) => !s.id.startsWith("ai_gen"));
        for (const g of generated) g.id = `ai_gen_${g.id}`;
        store.aiSuggestions = [...generated, ...store.aiSuggestions];
        return ok({ generated: generated.length });
      }
      case "admin.ai.review": {
        const s = reviewSuggestion(store, b("suggestionId"), b("decision") as "reviewed" | "dismissed", b("actor") || "stf_ama");
        return ok({ status: s.status });
      }
      case "admin.ai.business-question": {
        return ok(businessQuestion(store, b("question")));
      }
      case "admin.team": {
        return ok(store.staff.map((s) => ({
          id: s.id, name: s.name, role: s.role, phone: s.phone, isDemo: s.isDemo,
          openSessions: store.cashierSessions.filter((x) => x.cashierId === s.id && x.status === "open").length,
        })));
      }
      case "admin.audit": {
        const events = store.audit.map((e) => ({ ...e, atLabel: formatDateTime(e.at) }));
        const search = q("q").toLowerCase();
        const filtered = search ? events.filter((e) => `${e.action} ${e.entity} ${e.entityId} ${e.actorName}`.toLowerCase().includes(search)) : events;
        return ok(filtered);
      }
      case "admin.settings": {
        return ok(store.settings);
      }
      case "admin.settings.update": {
        const s = store.settings;
        for (const key of ["deliveryEnabled", "collectionEnabled", "refundsRequireApproval", "codEnabled"] as const) {
          if (typeof body[key] === "boolean") (s as never as Record<string, unknown>)[key] = body[key];
        }
        if (typeof body.reservationTtlMinutes === "number" && body.reservationTtlMinutes >= 5) {
          s.reservationTtlMinutes = body.reservationTtlMinutes;
        }
        audit(store, b("actor") || "stf_ama", "settings.updated", "Settings", "settings", { after: JSON.stringify(s) });
        return ok(s);
      }

      /* ---------------- Rider workspace ---------------- */
      case "rider.login": {
        return ok(store.riders.map((r) => ({ id: r.id, name: r.name, kind: r.kind, vehicle: r.vehicle, isDemo: r.isDemo })));
      }
      case "rider.jobs": {
        const riderId = q("riderId");
        const jobs = riderJobs(store, riderId).map((j) => riderJobView(store, j));
        const remittance = pendingRemittance(store, riderId);
        const rider = store.riders.find((r) => r.id === riderId);
        return ok({
          jobs,
          rider: rider ? { id: rider.id, name: rider.name, phone: rider.phone, isAvailable: rider.isAvailable, lastLocationAt: rider.lastLocationAt, lastLocationLabel: rider.lastLocationLabel } : null,
          remittance: { ...remittance, totalLabel: formatMoney(remittance.totalMinor) },
        });
      }
      case "rider.job": {
        const job = mustJob(store, q("jobId"));
        return ok(riderJobView(store, job));
      }
      case "rider.action": {
        const action = b("action");
        const riderId = b("riderId");
        const jobId = b("jobId");
        switch (action) {
          case "accept": riderAccept(store, jobId, riderId); break;
          case "pickup": riderPickup(store, jobId, riderId); break;
          case "out": riderOut(store, jobId, riderId); break;
          case "deliver": {
            riderDeliver(store, {
              jobId, riderId,
              proof: { method: b("proofMethod") as never, detail: b("proofDetail") },
              cashCollected: body.cashCollected === true,
            });
            break;
          }
          case "fail": riderFail(store, jobId, riderId, b("reason")); break;
          case "note": {
            const job = mustJob(store, jobId);
            job.events.push({ at: nowIso(), actor: riderId, action: "Rider note", note: b("note") });
            break;
          }
          case "location": {
            const rider = store.riders.find((r) => r.id === riderId);
            if (rider) {
              rider.lastLocationAt = nowIso();
              rider.lastLocationLabel = b("label") || "Location shared (demo)";
            }
            return ok({ updated: true });
          }
          default:
            throw new OpError("VALIDATION_FAILED", `Unknown rider action ${action}`);
        }
        return ok(riderJobView(store, mustJob(store, jobId)));
      }
      case "rider.history": {
        const riderId = q("riderId");
        const history = riderHistory(store, riderId).map((j) => {
          const o = store.orders.find((x) => x.id === j.orderId);
          return {
            jobId: j.id, orderReference: o?.reference, status: j.status,
            deliveredAt: j.proof?.at ?? j.events[j.events.length - 1]?.at,
            deliveredAtLabel: j.proof ? formatDateTime(j.proof.at) : formatDateTime(j.events[j.events.length - 1]?.at ?? j.assignedAt ?? j.events[0]?.at ?? nowIso()),
            cashToCollectMinor: j.cashToCollectMinor, cashCollected: !!j.cashCollectedAt, remitted: !!j.remittedAt,
            proof: j.proof,
          };
        });
        return ok(history);
      }

      /* ---------------- Demo controls ---------------- */
      case "demo.reset": {
        resetStore();
        return ok({ reset: true, seededAt: getStore().seededAt });
      }
      case "demo.flags": {
        if (typeof body.latencyMs === "number") store.demoFlags.latencyMs = Math.max(0, Math.min(4000, body.latencyMs));
        if (typeof body.forcePaymentFailure === "boolean") store.demoFlags.forcePaymentFailure = body.forcePaymentFailure;
        if (typeof body.offlineMode === "boolean") store.demoFlags.offlineMode = body.offlineMode;
        return ok(store.demoFlags);
      }
      case "demo.scenario": {
        const scenario = b("scenario");
        switch (scenario) {
          case "expire_reservations": {
            const released = sweepExpiredReservations(store);
            return ok({ released });
          }
          case "reserve_last_unit": {
            // final-unit conflict: reserve the last frozen chicken online
            const check = checkAvailability(store, [{ variantId: "var_chk_pc", quantity: "1" }]);
            if (!check.ok) {
              return ok({ alreadyReserved: true, conflicts: check.conflicts });
            }
            const orderId = `ord_demo_${Date.now()}`;
            tryReserve(store, [{ variantId: "var_chk_pc", quantity: "1" }], orderId, "online", 30);
            return ok({ reserved: true, orderId, note: "Last Frozen Whole Chicken now reserved online — try adding it at the POS." });
          }
          case "duplicate_callback": {
            const order = store.orders.find((o) => o.paymentStatus === "pending");
            if (!order) return ok({ note: "No pending order to double-callback." });
            const r = paymentCallback(store, order.id, "pending");
            return ok({ duplicate: r.duplicate, callbackNote: "Extra callback delivered; state unchanged." });
          }
          case "payment_failure": {
            store.demoFlags.forcePaymentFailure = !store.demoFlags.forcePaymentFailure;
            return ok({ forcePaymentFailure: store.demoFlags.forcePaymentFailure });
          }
          case "seed_pending_payment": {
            const created = createOnlineOrder(store, {
              lines: [{ variantId: "var_cok_300", quantity: "2" }],
              customerName: "Demo Pending Customer",
              customerPhone: "+233240000099",
              fulfilment: "delivery",
              zoneId: "zone_c",
              paymentMethod: "mobile_money",
              idempotencyKey: `demo_pending_${Date.now()}`,
            });
            return ok({ orderId: created.order.id, reference: created.order.reference });
          }
          default:
            throw new OpError("VALIDATION_FAILED", `Unknown scenario ${scenario}`);
        }
      }

      default:
        return err(new OpError("VALIDATION_FAILED", `Unknown operation: ${path}`));
    }
  } catch (e) {
    return err(e);
  }
}

function riderJobView(store: VgStore, job: ReturnType<typeof mustJob>) {
  const order = store.orders.find((o) => o.id === job.orderId);
  const address = store.addresses.find((a) => a.id === job.addressId);
  const zone = store.zones.find((z) => z.id === job.zoneId);
  return {
    id: job.id, orderId: job.orderId, orderReference: order?.reference,
    status: job.status, zone: zone?.name,
    riderId: job.riderId, instructions: job.instructions,
    customerName: order?.customerName, customerPhone: order?.customerPhone,
    address: address
      ? {
          recipientName: address.recipientName, phone: address.phone,
          line1: `${address.street}, ${address.locality}`,
          landmark: address.landmark, ghanaPostGps: address.ghanaPostGps,
        }
      : order?.fulfilment === "collection"
        ? { recipientName: order.customerName, phone: order.customerPhone, line1: "Collect in store" }
        : undefined,
    items: order
      ? order.lines.map((lid) => {
          const l = store.orderLines.find((x) => x.id === lid);
          return l ? `${l.quantity} × ${l.productName} (${l.variantName})` : "";
        }).filter(Boolean)
      : [],
    cashToCollectMinor: job.cashToCollectMinor,
    cashToCollectLabel: job.cashToCollectMinor ? formatMoney(job.cashToCollectMinor) : undefined,
    cashCollectedAt: job.cashCollectedAt, remittedAt: job.remittedAt,
    proof: job.proof, failureReason: job.failureReason, rescheduledFor: job.rescheduledFor,
    events: job.events.map((e) => ({ ...e, atLabel: formatDateTime(e.at) })),
  };
}
