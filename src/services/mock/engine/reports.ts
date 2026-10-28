/**
 * Reports engine — every figure derives directly from the order,
 * movement, session, return and job records in the store so dashboards
 * and reports reconcile with the underlying data.
 */

import type { Order } from "@/types/domain";
import type { VgStore } from "../store";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import type { ReportBundleView } from "@/services/views";

/** Shared response contract — see src/services/views.ts (used by client.ts and pages). */
export type ReportBundle = ReportBundleView;

export function buildReports(store: VgStore, range: { from?: string; to?: string } = {}): ReportBundle {
  const paid = (o: Order) => ["succeeded", "partially_refunded", "refunded"].includes(o.paymentStatus);
  const explicitRange = Boolean(range.from || range.to);
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10);
  let from = range.from && ymd.test(range.from) ? range.from : defaultFrom;
  let to = range.to && ymd.test(range.to) ? range.to : today;
  if (from > to) [from, to] = [to, from];
  const maxDays = 366;
  const span = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(span) || span >= maxDays) from = new Date(Date.parse(`${to}T00:00:00Z`) - (maxDays - 1) * 86_400_000).toISOString().slice(0, 10);
  const inRange = (iso?: string) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const activityInRange = (iso?: string) => !explicitRange || inRange(iso);

  const days: { date: string; onlineMinor: number; posMinor: number; orders: number }[] = [];
  for (let at = Date.parse(`${from}T00:00:00Z`), stop = Date.parse(`${to}T00:00:00Z`); at <= stop; at += 86_400_000) {
    days.push({ date: new Date(at).toISOString().slice(0, 10), onlineMinor: 0, posMinor: 0, orders: 0 });
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  const rangedOrders = store.orders.filter((o) => activityInRange(o.createdAt));
  for (const o of store.orders.filter((order) => inRange(order.createdAt))) {
    if (o.fulfilmentStatus === "cancelled") continue;
    const d = byDate.get(o.createdAt.slice(0, 10));
    if (!d) continue;
    d.orders += 1;
    if (paid(o)) {
      if (o.channel === "online") d.onlineMinor += o.totalMinor;
      else d.posMinor += o.totalMinor;
    }
  }

  const perVariant = new Map<string, { name: string; variant: string; qty: number; revenueMinor: number }>();
  for (const o of rangedOrders) {
    if (o.fulfilmentStatus === "cancelled" || !paid(o)) continue;
    for (const lid of o.lines) {
      const l = store.orderLines.find((x) => x.id === lid);
      if (!l) continue;
      const key = l.variantId;
      const agg = perVariant.get(key) ?? { name: l.productName, variant: l.variantName, qty: 0, revenueMinor: 0 };
      agg.qty += Number(l.quantity);
      agg.revenueMinor += l.lineTotalMinor;
      perVariant.set(key, agg);
    }
  }
  const topProducts = [...perVariant.values()].sort((a, b) => b.revenueMinor - a.revenueMinor).slice(0, 10);

  const fulfilmentCounts: Record<string, number> = {};
  for (const o of rangedOrders) fulfilmentCounts[o.fulfilmentStatus] = (fulfilmentCounts[o.fulfilmentStatus] ?? 0) + 1;

  const rangedJobs = store.deliveryJobs.filter((j) => activityInRange(j.assignedAt ?? j.events[0]?.at));
  const deliveryCounts: Record<string, number> = {};
  for (const j of rangedJobs) deliveryCounts[j.status] = (deliveryCounts[j.status] ?? 0) + 1;

  const rangedReturns = store.returnRequests.filter((r) => activityInRange(r.createdAt));
  const succeededRefunds = store.refunds.filter((r) => r.status === "succeeded" && activityInRange(r.createdAt));
  const returnsSummary = {
    total: rangedReturns.length,
    pending: rangedReturns.filter((r) => ["requested", "approved", "received", "inspected"].includes(r.status)).length,
    resolved: rangedReturns.filter((r) => r.status === "resolved").length,
    refundedMinor: succeededRefunds.reduce((a, r) => a + r.amountMinor, 0),
  };

  const rangedSessions = store.cashierSessions.filter((s) => activityInRange(s.openedAt));
  const openSessions = rangedSessions.filter((s) => s.status === "open");
  const lastClosed = rangedSessions.find((s) => s.status === "closed");
  const expectedMinor = openSessions.reduce((a, s) => {
    const cashSales = rangedOrders
      .filter((o) => o.posSessionId === s.id && o.paymentMethod === "cash_counter" && paid(o))
      .reduce((x, o) => x + o.totalMinor, 0);
    const movements = s.movements.filter((m) => activityInRange(m.at)).reduce((x, m) => x + (m.kind === "cash_in" ? m.amountMinor : -m.amountMinor), 0);
    return a + s.openingFloatMinor + cashSales + movements;
  }, 0);

  let costBasis = 0;
  let sellableUnits = 0;
  let zeroVariants = 0;
  let lowVariants = 0;
  const now = new Date().toISOString();
  for (const v of store.variants) {
    const lots = store.lots.filter((l) => l.variantId === v.id && l.kind === "regular" && !l.isQuarantined && (!l.expiryDate || l.expiryDate > now));
    const qty = lots.reduce((a, l) => a + Number(l.quantity), 0);
    const reserved = store.reservations.filter((r) => r.variantId === v.id && !r.consumedAt && !r.releasedAt).reduce((a, r) => a + Number(r.quantity), 0);
    const available = Math.max(0, qty - reserved - Number(v.safetyStock));
    costBasis += Math.round(qty * (v.purchaseUnit ? v.priceMinor / Number(v.purchaseUnit.factor) : v.priceMinor) * 0.85);
    sellableUnits += available;
    if (available === 0) zeroVariants += 1;
    else if (available <= 3) lowVariants += 1;
  }

  const rangedAttempts = store.paymentAttempts.filter((a) => activityInRange(a.createdAt));
  return {
    salesByDay: days,
    topProducts,
    fulfilmentCounts,
    deliveryCounts,
    returnsSummary,
    cashSummary: {
      openSessions: openSessions.length,
      expectedMinor,
      lastClosedDiffMinor: lastClosed?.differenceMinor ?? 0,
    },
    stockValue: { costBasisMinor: costBasis, sellableUnits, zeroVariants, lowVariants },
    paymentsReconciliation: {
      settled: rangedAttempts.filter((a) => a.settlementState === "settled" || a.settlementState === "reconciled").length,
      unsettled: rangedAttempts.filter((a) => a.settlementState === "unsettled").length,
      exceptions: rangedAttempts.filter((a) => a.settlementState === "exception").length,
    },
  };
}

export function dashboardSummary(store: VgStore) {
  const reports = buildReports(store);
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = reports.salesByDay.find((d) => d.date === today);
  const actionable = {
    awaitingConfirmation: store.orders.filter((o) => o.fulfilmentStatus === "awaiting_confirmation" && o.channel === "online").length,
    readyToPick: store.orders.filter((o) => o.fulfilmentStatus === "confirmed").length,
    picking: store.orders.filter((o) => o.fulfilmentStatus === "picking").length,
    readyToDispatch: store.orders.filter((o) => o.fulfilmentStatus === "packed" && o.fulfilment === "delivery").length,
    pendingPayments: store.orders.filter((o) => o.paymentStatus === "pending" || o.paymentStatus === "requires_review").length,
    returnsPending: store.returnRequests.filter((r) => ["requested", "approved", "received", "inspected"].includes(r.status)).length,
    refundsAttention: store.refunds.filter((r) => ["awaiting_approval", "requires_review"].includes(r.status)).length,
    lowStock: reports.stockValue.lowVariants,
    expiringSoon: store.lots.filter((l) => {
      if (!l.expiryDate || l.isQuarantined || l.kind !== "regular") return false;
      const days = (new Date(l.expiryDate).getTime() - Date.now()) / 86_400_000;
      return days >= 0 && days <= 7;
    }).length,
    unassignedJobs: store.deliveryJobs.filter((j) => ["unassigned", "rescheduled"].includes(j.status)).length,
    openSessions: store.cashierSessions.filter((s) => s.status === "open").length,
  };
  const recentOrders = store.orders
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8)
    .map((o) => ({
      id: o.id, reference: o.reference, customer: o.customerName, channel: o.channel,
      total: o.totalMinor, paymentStatus: o.paymentStatus, fulfilmentStatus: o.fulfilmentStatus,
      at: o.createdAt, atLabel: formatDateTime(o.createdAt), totalLabel: formatMoney(o.totalMinor),
    }));
  return { today: todayRow ?? { date: today, onlineMinor: 0, posMinor: 0, orders: 0 }, actionable, recentOrders, reports };
}
