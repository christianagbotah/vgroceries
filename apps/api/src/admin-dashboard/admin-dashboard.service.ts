import { Injectable } from "@nestjs/common";
import type { DashboardView, ReportBundleView } from "@variety/contracts";
import { Database } from "../database/database";

const DAY_MS = 86_400_000;
const PAID_STATUSES = ["succeeded", "partially_refunded", "refunded"];
const money = (minor: number) => `₵${(minor / 100).toFixed(2)}`;
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class AdminDashboardService {
  constructor(private readonly db: Database) {}

  async view(): Promise<DashboardView> {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const firstDay = new Date(todayStart.getTime() - 13 * DAY_MS);
    const expiryEnd = new Date(todayStart.getTime() + 7 * DAY_MS);

    const [recentOrders, reportOrders, topLines, fulfilmentGroups, deliveryGroups, paymentGroups, succeededRefunds, refundsAttention, unassignedJobs, variants, expiringSoon] = await Promise.all([
      this.db.order.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 8 }),
      this.db.order.findMany({ where: { createdAt: { gte: firstDay } }, select: { createdAt: true, channel: true, totalMinor: true, paymentStatus: true, fulfilmentStatus: true } }),
      this.db.orderLine.findMany({ where: { order: { paymentStatus: { in: PAID_STATUSES }, fulfilmentStatus: { not: "cancelled" } } }, select: { variantId: true, productName: true, variantName: true, quantity: true, lineTotalMinor: true } }),
      this.db.order.groupBy({ by: ["fulfilmentStatus"], _count: { _all: true } }),
      this.db.deliveryJob.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.paymentAttempt.groupBy({ by: ["settlementState"], _count: { _all: true } }),
      this.db.refund.aggregate({ where: { status: "succeeded" }, _sum: { amountMinor: true } }),
      this.db.refund.count({ where: { status: { in: ["awaiting_approval", "requires_review"] } } }),
      this.db.deliveryJob.count({ where: { status: { in: ["unassigned", "rescheduled"] } } }),
      this.db.variant.findMany({ where: { active: true }, select: { positions: { select: { safetyStock: true, lots: { where: { kind: "regular", quarantined: false, OR: [{ expiryDate: null }, { expiryDate: { gte: todayStart } }] }, select: { quantity: true, unitCostMinor: true } }, reservations: { where: { state: "active", expiresAt: { gt: now } }, select: { quantity: true } } } } } }),
      this.db.stockLot.count({ where: { kind: "regular", quarantined: false, quantity: { gt: 0 }, expiryDate: { gte: todayStart, lte: expiryEnd } } }),
    ]);

    const salesByDay: ReportBundleView["salesByDay"] = [];
    for (let i = 0; i < 14; i += 1) {
      const date = new Date(firstDay.getTime() + i * DAY_MS);
      salesByDay.push({ date: dayKey(date), onlineMinor: 0, posMinor: 0, orders: 0 });
    }
    const salesMap = new Map(salesByDay.map((row) => [row.date, row]));
    for (const order of reportOrders) {
      if (order.fulfilmentStatus === "cancelled") continue;
      const row = salesMap.get(dayKey(order.createdAt));
      if (!row) continue;
      row.orders += 1;
      if (!PAID_STATUSES.includes(order.paymentStatus)) continue;
      if (order.channel === "online") row.onlineMinor += order.totalMinor;
      else row.posMinor += order.totalMinor;
    }

    const perVariant = new Map<string, { name: string; variant: string; qty: number; revenueMinor: number }>();
    for (const line of topLines) {
      const current = perVariant.get(line.variantId) ?? { name: line.productName, variant: line.variantName, qty: 0, revenueMinor: 0 };
      current.qty += Number(line.quantity);
      current.revenueMinor += line.lineTotalMinor;
      perVariant.set(line.variantId, current);
    }
    const topProducts = [...perVariant.values()].sort((a, b) => b.revenueMinor - a.revenueMinor).slice(0, 10);
    const fulfilmentCounts = Object.fromEntries(fulfilmentGroups.map((row) => [row.fulfilmentStatus, row._count._all]));
    const deliveryCounts = Object.fromEntries(deliveryGroups.map((row) => [row.status, row._count._all]));
    const paymentCounts = Object.fromEntries(paymentGroups.map((row) => [row.settlementState, row._count._all]));

    let costBasisMinor = 0;
    let sellableUnits = 0;
    let zeroVariants = 0;
    let lowVariants = 0;
    for (const variant of variants) {
      let available = 0;
      for (const position of variant.positions) {
        const quantity = position.lots.reduce((sum, lot) => {
          const qty = Number(lot.quantity);
          if (lot.unitCostMinor !== null) costBasisMinor += Math.round(qty * lot.unitCostMinor);
          return sum + qty;
        }, 0);
        const reserved = position.reservations.reduce((sum, reservation) => sum + Number(reservation.quantity), 0);
        available += Math.max(0, quantity - reserved - Number(position.safetyStock));
      }
      sellableUnits += available;
      if (available <= 0) zeroVariants += 1;
      else if (available <= 3) lowVariants += 1;
    }

    const reports: ReportBundleView = {
      salesByDay,
      topProducts,
      fulfilmentCounts,
      deliveryCounts,
      returnsSummary: { total: 0, pending: 0, resolved: 0, refundedMinor: succeededRefunds._sum.amountMinor ?? 0 },
      cashSummary: { openSessions: 0, expectedMinor: 0, lastClosedDiffMinor: 0 },
      stockValue: { costBasisMinor, sellableUnits, zeroVariants, lowVariants },
      paymentsReconciliation: {
        settled: (paymentCounts.settled ?? 0) + (paymentCounts.reconciled ?? 0),
        unsettled: paymentCounts.unsettled ?? 0,
        exceptions: paymentCounts.exception ?? 0,
      },
    };

    const actionable = {
      awaitingConfirmation: await this.db.order.count({ where: { fulfilmentStatus: "awaiting_confirmation", channel: "online" } }),
      readyToPick: await this.db.order.count({ where: { fulfilmentStatus: "confirmed" } }),
      picking: await this.db.order.count({ where: { fulfilmentStatus: "picking" } }),
      readyToDispatch: await this.db.order.count({ where: { fulfilmentStatus: "packed", fulfilment: "delivery" } }),
      pendingPayments: await this.db.order.count({ where: { paymentStatus: { in: ["pending", "requires_review"] } } }),
      returnsPending: 0,
      refundsAttention,
      lowStock: reports.stockValue.lowVariants,
      expiringSoon,
      unassignedJobs,
      openSessions: 0,
    };

    return {
      today: salesMap.get(dayKey(todayStart)) ?? { date: dayKey(todayStart), onlineMinor: 0, posMinor: 0, orders: 0 },
      actionable,
      recentOrders: recentOrders.map((order) => ({ id: order.id, reference: order.reference, customer: order.customerName, channel: order.channel, total: order.totalMinor, paymentStatus: order.paymentStatus, fulfilmentStatus: order.fulfilmentStatus, at: order.createdAt.toISOString(), atLabel: order.createdAt.toISOString(), totalLabel: money(order.totalMinor) })),
      reports,
    };
  }
}
