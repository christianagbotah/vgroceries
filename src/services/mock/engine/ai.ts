/**
 * AI engine — deterministic, clearly labelled demo suggestions only.
 * No model is connected. Rules:
 * - AI never invents stock, prices, ingredients, coverage or payment outcomes.
 * - AI never executes sensitive changes; everything is a reviewable suggestion.
 * - Suggestions only reference goods that are actually available.
 * - Evidence and data period are always shown; no fabricated accuracy scores.
 */

import type { AISuggestion } from "@/types/domain";
import { nextId, nowIso } from "@/lib/id";
import { cmpQty } from "@/lib/quantity";
import type { VgStore } from "../store";
import { availability, isProductPurchasable } from "./availability";
import { formatMoney } from "@/lib/money";

/* ------------------------------------------------------------------ */
/* Shopping assistant (customer-facing)                                */
/* ------------------------------------------------------------------ */

export interface AssistantAnswer {
  answer: string;
  evidence: string[];
  suggestions: { productId: string; variantId: string; label: string; priceMinor: number; available: string }[];
}

export function shoppingAssistant(store: VgStore, question: string): AssistantAnswer {
  const q = question.toLowerCase().trim();
  if (!q) throw Object.assign(new Error("Ask a question about our catalogue."), { code: "VALIDATION_FAILED" });

  const words = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "for", "with", "have", "does", "you", "your", "what", "how", "much", "are", "any"].includes(w));

  const scored = store.products
    .filter((p) => p.isPublished)
    .map((p) => {
      const hay = `${p.name} ${p.shortDescription} ${p.tags.join(" ")}`.toLowerCase();
      let score = 0;
      for (const w of words) if (hay.includes(w)) score += hay.includes(p.name.toLowerCase()) ? 3 : 1;
      return { product: p, score };
    })
    .filter((x) => x.score > 0 && isProductPurchasable(store, x.product.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const suggestions = scored.flatMap(({ product }) => {
    const variants = product.variants
      .map((vid) => ({ variant: store.variants.find((v) => v.id === vid)!, avail: availability(store, vid) }))
      .filter((x) => x.avail.isAvailable);
    if (!variants.length) return [];
    return [{
      productId: product.id,
      variantId: variants[0].variant.id,
      label: `${product.name} — ${variants[0].variant.name}`,
      priceMinor: variants[0].variant.priceMinor,
      available: variants[0].avail.availableToSell,
    }];
  });

  if (!suggestions.length) {
    return {
      answer: "I could not find a matching item that is currently available to sell. Try a different wording, or browse the shop categories. This assistant is a deterministic demo — it only answers from the current catalogue and stock.",
      evidence: ["Catalogue search found no available match", "Demo assistant — no live AI connected"],
      suggestions: [],
    };
  }

  const evidence = suggestions.map((s) => `${s.label}: ${formatMoney(s.priceMinor)}, ${s.available} available to sell now`);
  return {
    answer: `From the current catalogue: ${suggestions.map((s) => `${s.label} at ${formatMoney(s.priceMinor)} (${s.available} available)`).join("; ")}. Prices and stock are read live from the demo catalogue. I cannot advise on ingredients or allergy suitability — please check the product label.`,
    evidence: [...evidence, "Answers use current stock only; unavailable goods are excluded"],
    suggestions,
  };
}

/* ------------------------------------------------------------------ */
/* Budget basket (customer-facing, reviewable)                         */
/* ------------------------------------------------------------------ */

export function budgetBasket(store: VgStore, budgetMinor: number): { items: AssistantAnswer["suggestions"]; totalMinor: number; note: string } {
  if (budgetMinor < 100) throw Object.assign(new Error("Enter a budget of at least ₵1.00."), { code: "VALIDATION_FAILED" });
  // greedy fill prioritising staples across categories
  const staples = ["rice", "gari", "tomato", "onion", "oil", "beans", "water", "eggs", "flour", "milk"];
  const pool = store.products
    .filter((p) => p.isPublished && isProductPurchasable(store, p.id))
    .map((p) => ({
      product: p,
      stapleRank: staples.findIndex((s) => p.tags.some((t) => t.includes(s))),
      variants: p.variants.map((vid) => ({ v: store.variants.find((x) => x.id === vid)!, a: availability(store, vid) })).filter((x) => x.a.isAvailable),
    }))
    .filter((x) => x.variants.length)
    .sort((a, b) => (a.stapleRank - b.stapleRank) || a.variants[0].v.priceMinor - b.variants[0].v.priceMinor);

  const items: AssistantAnswer["suggestions"] = [];
  let total = 0;
  for (const p of pool) {
    const v = p.variants[0];
    const qty = Math.max(1, Math.floor(budgetMinor * 0.25 / v.v.priceMinor));
    const cost = v.v.priceMinor * qty;
    if (total + cost <= budgetMinor && cmpQty(v.a.availableToSell, String(qty)) >= 0) {
      items.push({ productId: p.product.id, variantId: v.v.id, label: `${p.product.name} — ${v.v.name}`, priceMinor: v.v.priceMinor, available: v.a.availableToSell });
      total += cost;
    } else if (total + v.v.priceMinor <= budgetMinor) {
      items.push({ productId: p.product.id, variantId: v.v.id, label: `${p.product.name} — ${v.v.name}`, priceMinor: v.v.priceMinor, available: v.a.availableToSell });
      total += v.v.priceMinor;
    }
    if (items.length >= 8) break;
  }
  return {
    items,
    totalMinor: total,
    note: `Suggested basket: ${formatMoney(total)} of your ${formatMoney(budgetMinor)} budget. Review it and add what you want — nothing is added to your cart automatically. Suggestions use available stock only.`,
  };
}

/* ------------------------------------------------------------------ */
/* Staff-facing deterministic suggestions                              */
/* ------------------------------------------------------------------ */

export function refreshStaffSuggestions(store: VgStore): AISuggestion[] {
  const made: AISuggestion[] = [];
  const at = nowIso();
  const push = (s: Omit<AISuggestion, "id" | "createdAt" | "source" | "status" | "requiresRole">) => {
    made.push({ id: nextId("ai"), createdAt: at, source: "deterministic_demo", status: "suggested", requiresRole: defaultRoles(s.kind), ...s });
  };

  // replenishment: sellable+reserved vs recent sales velocity
  const salesLast7 = store.orders.filter((o) => ["succeeded", "partially_refunded", "refunded"].includes(o.paymentStatus) && o.createdAt > new Date(Date.now() - 7 * 86_400_000).toISOString());
  for (const v of store.variants) {
    const avail = availability(store, v.id);
    const sold = salesLast7
      .flatMap((o) => o.lines.map((lid) => store.orderLines.find((l) => l.id === lid)!).filter(Boolean))
      .filter((l) => l && l.variantId === v.id)
      .reduce((a, l) => a + Number(l.quantity), 0);
    if (sold >= 2 && Number(avail.availableToSell) <= Math.max(2, sold / 3)) {
      const product = store.products.find((p) => p.id === v.productId)!;
      push({
        kind: "replenishment",
        title: `${product.name} (${v.name}) may run out soon`,
        detail: `${avail.availableToSell} sellable units remain with ${sold} sold in the last 7 days. A purchase-order draft is suggested for review — nothing is ordered automatically.`,
        evidence: [`Available to sell: ${avail.availableToSell}`, `Sold in last 7 days: ${sold}`, `Purchase unit: ${v.purchaseUnit ? `1 ${v.purchaseUnit.altUnit} = ${v.purchaseUnit.factor} ${v.unit}` : v.unit}`],
        dataPeriod: "Last 7 days of orders (demo fixtures + live demo actions)",
      });
    }
  }

  // expiry
  for (const lot of store.lots) {
    if (!lot.expiryDate || lot.isQuarantined || lot.kind !== "regular" || lot.quantity === "0") continue;
    const days = Math.round((new Date(lot.expiryDate).getTime() - Date.now()) / 86_400_000);
    if (days <= 5 && days >= 0) {
      const v = store.variants.find((x) => x.id === lot.variantId)!;
      const product = store.products.find((p) => p.id === v.productId)!;
      push({
        kind: "expiry_promotion",
        title: `${product.name} lot ${lot.lotNumber} expires in ${days} day${days === 1 ? "" : "s"}`,
        detail: `${lot.quantity} ${v.unit}s in this lot are eligible for sale until ${lot.expiryDate.slice(0, 10)}. A reviewable promotion is suggested; nothing is published automatically.`,
        evidence: [`Lot ${lot.lotNumber}: ${lot.quantity} ${v.unit}s`, `Expiry ${lot.expiryDate.slice(0, 10)}`, `Current price ${formatMoney(v.priceMinor)}`],
        dataPeriod: "Current lot data (demo fixtures + live demo actions)",
      });
    }
  }

  // dispatch grouping
  const packed = store.orders.filter((o) => o.fulfilmentStatus === "packed" && o.fulfilment === "delivery");
  const byZone = new Map<string, typeof packed>();
  for (const o of packed) {
    const key = o.zoneId ?? "unknown";
    byZone.set(key, [...(byZone.get(key) ?? []), o]);
  }
  for (const [zoneId, orders] of byZone) {
    if (orders.length >= 2) {
      const zone = store.zones.find((z) => z.id === zoneId);
      const freeRiders = store.riders.filter((r) => r.isAvailable);
      push({
        kind: "dispatch_grouping",
        title: `${orders.length} packed orders fit one ${zone?.name ?? "zone"} run`,
        detail: `Orders ${orders.map((o) => o.reference).join(", ")} are packed for the same zone. ${freeRiders.length ? `Available riders: ${freeRiders.map((r) => r.name).join(", ")}.` : "No riders currently available — consider an external provider booking."} The dispatcher decides.`,
        evidence: orders.map((o) => `${o.reference}: ${o.lines.length} lines, ${formatMoney(o.totalMinor)}`),
        dataPeriod: "Today's fulfilment queue (live demo state)",
      });
    }
  }

  // ops explanation: unresolved payments
  const pending = store.paymentAttempts.filter((a) => a.status === "initiated" || a.status === "pending");
  for (const a of pending) {
    const order = store.orders.find((o) => o.id === a.orderId);
    if (!order) continue;
    push({
      kind: "operations_explanation",
      title: `Payment pending on ${order.reference}`,
      detail: `Attempt ${a.id} for ${formatMoney(a.amountMinor)} has ${a.callbackCount} callback(s) with no confirmed outcome. The order stays pending and the customer is not asked to pay twice. Wait for the provider's verified status.`,
      evidence: [`Attempt ${a.id}: ${a.status}, ${a.callbackCount} callbacks`, `Order placed ${order.createdAt.slice(0, 16).replace("T", " ")} UTC`],
      dataPeriod: "Live mock payment events",
    });
  }
  if (store.orders.some((o) => o.paymentStatus === "requires_review")) {
    push({
      kind: "operations_explanation",
      title: "Paid order awaiting staff review",
      detail: "An order was paid after its reservation expired. Stock was rechecked automatically; if unavailable it needs a human decision: offer alternatives, or cancel and refund.",
      evidence: store.orders.filter((o) => o.paymentStatus === "requires_review").map((o) => `${o.reference} — payment ${o.paymentStatus}`),
      dataPeriod: "Live mock order events",
    });
  }

  return made;
}

export function refreshExceptionFlags(store: VgStore): AISuggestion[] {
  const made: AISuggestion[] = [];
  // customers with 2+ returns in 8 days
  const byCustomer = new Map<string, number>();
  for (const r of store.returnRequests) {
    if (r.customerId && r.createdAt > new Date(Date.now() - 8 * 86_400_000).toISOString()) {
      byCustomer.set(r.customerId, (byCustomer.get(r.customerId) ?? 0) + 1);
    }
  }
  for (const [customerId, count] of byCustomer) {
    if (count >= 2) {
      const customer = store.customers.find((c) => c.id === customerId);
      made.push({
        id: nextId("ai"),
        createdAt: nowIso(),
        source: "deterministic_demo",
        status: "suggested",
        requiresRole: ["owner_admin", "operations_manager", "finance_reviewer"],
        kind: "exception_flag",
        title: `${count} returns in 8 days from ${customer?.name ?? customerId}`,
        detail: "Unusual return frequency. Flagged for human review only; no refunds were issued automatically and no account is blocked.",
        evidence: store.returnRequests.filter((r) => r.customerId === customerId).map((r) => `${r.reference} — ${r.status}`),
        dataPeriod: "Last 8 days of returns (demo fixtures + live demo actions)",
      });
    }
  }
  return made;
}

function defaultRoles(kind: AISuggestion["kind"]): AISuggestion["requiresRole"] {
  if (kind === "replenishment" || kind === "expiry_promotion") return ["owner_admin", "operations_manager", "inventory_officer"];
  if (kind === "dispatch_grouping") return ["owner_admin", "operations_manager", "dispatcher"];
  if (kind === "exception_flag") return ["owner_admin", "operations_manager", "finance_reviewer"];
  return ["owner_admin", "operations_manager"];
}

export function reviewSuggestion(store: VgStore, id: string, decision: "reviewed" | "dismissed", actor: string): AISuggestion {
  const s = store.aiSuggestions.find((x) => x.id === id);
  if (!s) throw Object.assign(new Error("Suggestion not found."), { code: "VALIDATION_FAILED" });
  s.status = decision;
  return s;
}

/* ------------------------------------------------------------------ */
/* Business questions (fixture-grounded)                               */
/* ------------------------------------------------------------------ */

export function businessQuestion(store: VgStore, question: string): { answer: string; evidence: string[] } {
  const q = question.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const all = store.orders.filter((o) => o.channel === "online");
  const todayOrders = all.filter((o) => o.createdAt.slice(0, 10) === today);
  const salesToday = todayOrders.filter((o) => ["succeeded", "partially_refunded", "refunded"].includes(o.paymentStatus)).reduce((a, o) => a + o.totalMinor, 0);

  if (q.includes("sale") || q.includes("revenue") || q.includes("today")) {
    return {
      answer: `Confirmed online sales today: ${formatMoney(salesToday)} across ${todayOrders.length} online orders (all channels are in the reports screen). POS sales are counted separately.`,
      evidence: [`Today's online orders: ${todayOrders.length}`, `Sum of paid order totals: ${formatMoney(salesToday)}`, "Data period: today (UTC), live demo state"],
    };
  }
  if (q.includes("stock") || q.includes("low")) {
    const low = store.variants.map((v) => ({ v, a: availability(store, v.id) })).filter((x) => Number(x.a.availableToSell) > 0 && Number(x.a.availableToSell) <= 3);
    return {
      answer: `${low.length} variants are at or below 3 sellable units. The replenishment assistant lists them with evidence. Zero-availability items are already hidden from the storefront.`,
      evidence: low.slice(0, 6).map((x) => `${x.v.name} — ${x.a.availableToSell} available`),
    };
  }
  if (q.includes("deliver") || q.includes("dispatch")) {
    const active = store.deliveryJobs.filter((j) => !["delivered", "return_to_store"].includes(j.status));
    return {
      answer: `${active.length} delivery jobs are in progress. Details are on the dispatch dashboard; failed and rescheduled jobs are listed with reasons.`,
      evidence: active.slice(0, 6).map((j) => `Job ${j.id} for order ${store.orders.find((o) => o.id === j.orderId)?.reference} — ${j.status}`),
    };
  }
  return {
    answer: "I can answer questions about today's sales, low stock, and delivery status from the recorded demo data. The reports screen has the full breakdown. This is a deterministic demo assistant — no live AI is connected and no accuracy scores are shown.",
    evidence: ["Grounded on current fixture and live demo data only", "Not connected to a live model"],
  };
}
