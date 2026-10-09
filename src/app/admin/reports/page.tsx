"use client";

import { useState } from "react";
import { apiOps } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { Download, BarChart3, TrendingUp, Boxes, Truck, RotateCcw, Banknote, CreditCard, FileText } from "lucide-react";
import type { ReportBundle } from "@/services/mock/engine/reports";

type Row = { label: string; value: string }[];

export default function AdminReportsPage() {
  const { data, loading, error, reload } = useApiData(() => apiOps.reports(), []);
  const [tab, setTab] = useState("sales");

  if (loading) return <LoadingState rows={6} label="Building reports" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const salesRows: Row = data.salesByDay.map((d) => ({
    label: d.date,
    value: `${formatMoney(d.onlineMinor + d.posMinor)} (online ${formatMoney(d.onlineMinor)} · POS ${formatMoney(d.posMinor)} · ${d.orders} orders)`,
  }));
  const topRows: Row = data.topProducts.map((p) => ({ label: `${p.name} (${p.variant})`, value: `${p.qty} sold · ${formatMoney(p.revenueMinor)}` }));

  const exportCsv = (rows: Row, name: string) => {
    // exports exactly the current filtered dataset shown in the table
    const csv = ["Label,Value", ...rows.map((r) => `"${r.label.replace(/"/g, '""')}","${r.value.replace(/"/g, '""')}"`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Every figure derives from the orders, movements, sessions, returns and jobs in the
            system — the reports reconcile with the underlying data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10" onClick={() => exportCsv(salesRows, "sales-by-day")}>
            <Download className="size-4" aria-hidden /> Export sales CSV
          </Button>
          <Button variant="outline" className="h-10" onClick={() => exportCsv(topRows, "top-products")}>
            <Download className="size-4" aria-hidden /> Export top products CSV
          </Button>
        </div>
      </div>

      {/* Project documents — handover deliverables, not live business data. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden>
            <FileText className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">Project documents</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Delivery &amp; Integration Report — the architect handover pack (Word, 12 pages, 179 KB).
            </p>
          </div>
        </div>
        <Button asChild className="h-10">
          {/* Same-origin static file: the download attribute triggers a save instead of navigation. */}
          <a
            href="/reports/Variety-Groceries-Delivery-and-Integration-Report.docx"
            download="Variety-Groceries-Delivery-and-Integration-Report.docx"
          >
            <Download className="size-4" aria-hidden /> Download .docx
          </a>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-12 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="sales" className="gap-1.5 px-4"><TrendingUp className="size-4" aria-hidden /> Sales</TabsTrigger>
          <TabsTrigger value="stock" className="gap-1.5 px-4"><Boxes className="size-4" aria-hidden /> Stock</TabsTrigger>
          <TabsTrigger value="ops" className="gap-1.5 px-4"><Truck className="size-4" aria-hidden /> Fulfilment & delivery</TabsTrigger>
          <TabsTrigger value="returns" className="gap-1.5 px-4"><RotateCcw className="size-4" aria-hidden /> Returns & cash</TabsTrigger>
        </TabsList>

        {/* SALES */}
        <TabsContent value="sales" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Online revenue (14 days)" value={formatMoney(data.salesByDay.reduce((a, d) => a + d.onlineMinor, 0))} />
            <Stat label="Counter revenue (14 days)" value={formatMoney(data.salesByDay.reduce((a, d) => a + d.posMinor, 0))} />
            <Stat label="Orders (14 days)" value={String(data.salesByDay.reduce((a, d) => a + d.orders, 0))} />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <BarChart3 className="size-5 text-primary" aria-hidden /> Sales by day (last 14 days)
            </h2>
            <ul className="space-y-1.5">
              {data.salesByDay.map((d) => {
                const total = d.onlineMinor + d.posMinor;
                const max = Math.max(...data.salesByDay.map((x) => x.onlineMinor + x.posMinor), 1);
                return (
                  <li key={d.date} className="flex items-center gap-3 text-xs">
                    <span className="w-20 shrink-0 text-muted-foreground">{d.date.slice(5)}</span>
                    <span className="h-4 rounded bg-primary/20" style={{ width: `${Math.max(2, (total / max) * 55)}%` }} aria-hidden />
                    <span className="tabular-nums font-medium">{formatMoney(total)}</span>
                    <span className="text-muted-foreground">{d.orders} orders</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <TableCard title="Top products by revenue" rows={topRows} />
        </TabsContent>

        {/* STOCK */}
        <TabsContent value="stock" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Stock value (cost basis, est.)" value={formatMoney(data.stockValue.costBasisMinor)} />
            <Stat label="Sellable units" value={String(data.stockValue.sellableUnits)} />
            <Stat label="Zero-availability variants" value={String(data.stockValue.zeroVariants)} tone="danger" />
            <Stat label="Low-stock variants (≤3)" value={String(data.stockValue.lowVariants)} tone="warning" />
          </div>
          <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            Cost basis uses variant purchase prices as an approximation for the demo (no landed-cost
            ledger). The backend owns the authoritative cost of goods.
          </p>
        </TabsContent>

        {/* OPS */}
        <TabsContent value="ops" className="mt-4 space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <TableCard title="Fulfilment counts" rows={Object.entries(data.fulfilmentCounts).map(([k, v]) => ({ label: k.replace(/_/g, " "), value: `${v} order(s)` }))} />
            <TableCard title="Delivery outcomes" rows={Object.entries(data.deliveryCounts).map(([k, v]) => ({ label: k.replace(/_/g, " "), value: `${v} job(s)` }))} />
          </div>
        </TabsContent>

        {/* RETURNS & CASH */}
        <TabsContent value="returns" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Returns total" value={String(data.returnsSummary.total)} />
            <Stat label="Pending returns" value={String(data.returnsSummary.pending)} tone="warning" />
            <Stat label="Resolved returns" value={String(data.returnsSummary.resolved)} tone="success" />
            <Stat label="Refunded amount" value={formatMoney(data.returnsSummary.refundedMinor)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat icon={Banknote} label="Open cashier sessions" value={String(data.cashSummary.openSessions)} />
            <Stat icon={Banknote} label="Expected cash in open sessions" value={formatMoney(data.cashSummary.expectedMinor)} />
            <Stat icon={CreditCard} label="Last closed session difference" value={formatMoney(data.cashSummary.lastClosedDiffMinor)} tone={data.cashSummary.lastClosedDiffMinor === 0 ? "success" : "danger"} />
          </div>
          <TableCard
            title="Payments reconciliation"
            rows={[
              { label: "Settled / reconciled attempts", value: String(data.paymentsReconciliation.settled) },
              { label: "Unsettled attempts", value: String(data.paymentsReconciliation.unsettled) },
              { label: "Exceptions", value: String(data.paymentsReconciliation.exceptions) },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, tone, icon: Icon }: { label: string; value: string; tone?: "success" | "danger" | "warning"; icon?: typeof Banknote }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null} {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-[color:var(--warning-foreground)]" : tone === "success" ? "text-success" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function TableCard({ title, rows }: { title: string; rows: Row }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <h2 className="border-b p-4 font-semibold">{title}</h2>
      {!rows.length ? (
        <p className="p-4 text-sm text-muted-foreground">No data for this period.</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 p-3">
              <span className="capitalize">{r.label}</span>
              <span className="tabular-nums font-medium">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
