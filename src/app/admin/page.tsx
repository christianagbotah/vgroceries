"use client";

import Link from "next/link";
import { apiOps } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { AlertTriangle, ArrowRight, ClipboardCheck, CreditCard, Package, RotateCcw, TriangleAlert, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminDashboardPage() {
  const { data, loading, error, reload } = useApiData(() => apiOps.dashboard(), []);

  if (loading) return <LoadingState rows={6} label="Loading dashboard" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const { actionable, recentOrders, today, reports } = data;

  const tiles = [
    { href: "/admin/orders?status=awaiting_confirmation", label: "Awaiting confirmation", value: actionable.awaitingConfirmation, icon: ClipboardCheck, tone: "warning" as const },
    { href: "/admin/fulfilment", label: "To pick & pack", value: actionable.toPick + actionable.toPack, icon: Package, tone: "info" as const },
    { href: "/admin/dispatch", label: "Ready to dispatch", value: actionable.readyToDispatch + actionable.unassignedJobs, icon: Truck, tone: "info" as const },
    { href: "/admin/orders?payment=pending", label: "Pending payments", value: actionable.pendingPayments, icon: CreditCard, tone: "warning" as const },
    { href: "/admin/returns", label: "Returns to handle", value: actionable.returnsPending, icon: RotateCcw, tone: "warning" as const },
    { href: "/admin/inventory?filter=low", label: "Low stock", value: actionable.lowStock, icon: AlertTriangle, tone: "danger" as const },
    { href: "/admin/inventory/expiry", label: "Expiring ≤ 7 days", value: actionable.expiringSoon, icon: TriangleAlert, tone: "warning" as const },
    { href: "/admin/cashier-sessions", label: "Open cashier sessions", value: actionable.openSessions, icon: CreditCard, tone: "neutral" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Operations dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Everything actionable, reconciled with live demo data.
          </p>
        </div>
        <Link href="/admin/reports" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:underline">
          Full reports <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {/* today snapshot */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today · online</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatMoney(today.onlineMinor)}</p>
            <p className="text-xs text-muted-foreground">{today.orders} online orders today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today · counter (POS)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatMoney(today.posMinor)}</p>
            <p className="text-xs text-muted-foreground">Cashier sales across channels</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Payment reconciliation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {reports.paymentsReconciliation.exceptions}{" "}
              <span className="text-sm font-normal text-muted-foreground">exceptions</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {reports.paymentsReconciliation.settled} settled · {reports.paymentsReconciliation.unsettled} awaiting settlement
            </p>
          </CardContent>
        </Card>
      </div>

      {/* actionable tiles */}
      <section aria-labelledby="action-heading">
        <h2 id="action-heading" className="mb-3 font-semibold">
          Needs attention
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center justify-between gap-2">
                <t.icon
                  className={cn(
                    "size-5",
                    t.tone === "danger" && "text-destructive",
                    t.tone === "warning" && "text-[color:var(--warning-foreground)]",
                    t.tone === "info" && "text-primary",
                    t.tone === "neutral" && "text-muted-foreground"
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    t.value === 0 && "text-muted-foreground"
                  )}
                >
                  {t.value}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-muted-foreground group-hover:text-foreground">{t.label}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* recent orders */}
      <section aria-labelledby="recent-heading" className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 id="recent-heading" className="font-semibold">Recent orders</h2>
          <Link href="/admin/orders" className="text-sm font-medium text-primary hover:underline focus-visible:underline">
            View all
          </Link>
        </div>
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="p-3 font-semibold">Reference</th>
                <th className="p-3 font-semibold">Customer</th>
                <th className="hidden p-3 font-semibold sm:table-cell">Channel</th>
                <th className="p-3 font-semibold">Payment</th>
                <th className="hidden p-3 font-semibold md:table-cell">Fulfilment</th>
                <th className="p-3 text-right font-semibold">Total</th>
                <th className="hidden p-3 font-semibold lg:table-cell">Placed</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-t hover:bg-accent/50">
                  <td className="p-3 font-medium">
                    <Link href={`/admin/orders/${o.id}`} className="hover:underline focus-visible:underline">
                      {o.reference}
                    </Link>
                  </td>
                  <td className="max-w-40 truncate p-3 text-muted-foreground">{o.customer}</td>
                  <td className="hidden p-3 capitalize text-muted-foreground sm:table-cell">{o.channel}</td>
                  <td className="p-3">
                    <StatusBadge kind="payment" status={o.paymentStatus} />
                  </td>
                  <td className="hidden p-3 md:table-cell">
                    <StatusBadge kind="fulfilment" status={o.fulfilmentStatus} />
                  </td>
                  <td className="p-3 text-right font-medium tabular-nums">{o.totalLabel}</td>
                  <td className="hidden p-3 text-muted-foreground lg:table-cell">{o.atLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
