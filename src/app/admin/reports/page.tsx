"use client";

import { useState } from "react";
import { apiOps } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/money";
import { Download, BarChart3, TrendingUp, Boxes, Truck, RotateCcw, Banknote, CreditCard, FileText, Filter, CalendarRange } from "lucide-react";

type Row = { label: string; value: string }[];
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

export default function AdminReportsPage() {
  const { toast } = useToast();
  const today = day(0);
  const [tab, setTab] = useState("sales");
  const [fromInput, setFromInput] = useState(day(13));
  const [toInput, setToInput] = useState(today);
  const [from, setFrom] = useState(day(13));
  const [to, setTo] = useState(today);
  const { data, loading, error, reload } = useApiData(() => apiOps.reports({ from, to }), [from, to]);

  const applyRange = () => {
    if (!fromInput || !toInput) { toast({ title: "Choose both report dates", variant: "destructive" }); return; }
    if (fromInput > toInput) { toast({ title: "Start date must be before end date", description: "Reverse date ranges are not applied.", variant: "destructive" }); return; }
    setFrom(fromInput); setTo(toInput);
  };
  const quickRange = (days: number) => { const nextFrom = day(days - 1); setFromInput(nextFrom); setToInput(today); setFrom(nextFrom); setTo(today); };

  if (loading && !data) return <LoadingState rows={6} label="Building reports" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const salesRows: Row = data.salesByDay.map((d) => ({ label: d.date, value: `${formatMoney(d.onlineMinor + d.posMinor)} (online ${formatMoney(d.onlineMinor)} · POS ${formatMoney(d.posMinor)} · ${d.orders} orders)` }));
  const topRows: Row = data.topProducts.map((p) => ({ label: `${p.name} (${p.variant})`, value: `${p.qty} sold · ${formatMoney(p.revenueMinor)}` }));
  const periodLabel = from === to ? from : `${from} → ${to}`;

  const exportCsv = (rows: Row, name: string) => {
    const csv = ["Label,Value", ...rows.map((r) => `"${r.label.replace(/"/g, '""')}","${r.value.replace(/"/g, '""')}"`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${name}-${from}-to-${to}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><h1 className="font-serif text-2xl font-bold">Reports</h1><p className="text-sm text-muted-foreground">Operational reports reconcile with underlying orders, movements, sessions, returns and delivery jobs.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="h-10" onClick={() => exportCsv(salesRows, "sales-by-day")}><Download className="size-4" aria-hidden /> Export sales CSV</Button><Button variant="outline" className="h-10" onClick={() => exportCsv(topRows, "top-products")}><Download className="size-4" aria-hidden /> Export top products CSV</Button></div></div>

    <section aria-label="Report filters" className="space-y-3 rounded-xl border bg-card p-4"><div className="flex items-center gap-2 font-semibold"><Filter className="size-4 text-primary" aria-hidden /> Report filters</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[12rem_12rem_14rem_auto]"><div><Label htmlFor="report-from">From</Label><Input id="report-from" type="date" value={fromInput} max={toInput || undefined} onChange={(e) => setFromInput(e.target.value)} /></div><div><Label htmlFor="report-to">To</Label><Input id="report-to" type="date" value={toInput} min={fromInput || undefined} onChange={(e) => setToInput(e.target.value)} /></div><div><Label>Report section</Label><Select value={tab} onValueChange={setTab}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sales">Sales</SelectItem><SelectItem value="stock">Stock</SelectItem><SelectItem value="ops">Fulfilment & delivery</SelectItem><SelectItem value="returns">Returns & cash</SelectItem></SelectContent></Select></div><div className="flex items-end"><Button className="w-full" onClick={applyRange}><CalendarRange className="size-4" aria-hidden /> Apply dates</Button></div></div><div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Quick range:</span><Button size="sm" variant="outline" onClick={() => quickRange(1)}>Today</Button><Button size="sm" variant="outline" onClick={() => quickRange(7)}>7 days</Button><Button size="sm" variant="outline" onClick={() => quickRange(14)}>14 days</Button><Button size="sm" variant="outline" onClick={() => quickRange(30)}>30 days</Button><span className="ml-auto text-muted-foreground">Showing {periodLabel}</span></div></section>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden><FileText className="size-5" /></div><div><h2 className="font-semibold">Project documents</h2><p className="mt-0.5 text-sm text-muted-foreground">Delivery &amp; Integration Report — architect handover pack.</p></div></div><Button asChild className="h-10"><a href="/reports/Variety-Groceries-Delivery-and-Integration-Report.docx" download="Variety-Groceries-Delivery-and-Integration-Report.docx"><Download className="size-4" aria-hidden /> Download .docx</a></Button></div>

    <Tabs value={tab} onValueChange={setTab}><TabsList className="h-12 w-full justify-start overflow-x-auto sm:w-auto"><TabsTrigger value="sales" className="gap-1.5 px-4"><TrendingUp className="size-4" aria-hidden /> Sales</TabsTrigger><TabsTrigger value="stock" className="gap-1.5 px-4"><Boxes className="size-4" aria-hidden /> Stock</TabsTrigger><TabsTrigger value="ops" className="gap-1.5 px-4"><Truck className="size-4" aria-hidden /> Fulfilment & delivery</TabsTrigger><TabsTrigger value="returns" className="gap-1.5 px-4"><RotateCcw className="size-4" aria-hidden /> Returns & cash</TabsTrigger></TabsList>
      <TabsContent value="sales" className="mt-4 space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Stat label="Online revenue" value={formatMoney(data.salesByDay.reduce((a, d) => a + d.onlineMinor, 0))} /><Stat label="Counter revenue" value={formatMoney(data.salesByDay.reduce((a, d) => a + d.posMinor, 0))} /><Stat label="Orders" value={String(data.salesByDay.reduce((a, d) => a + d.orders, 0))} /></div><div className="rounded-xl border bg-card p-4"><h2 className="mb-1 flex items-center gap-2 font-semibold"><BarChart3 className="size-5 text-primary" aria-hidden /> Sales by day</h2><p className="mb-3 text-xs text-muted-foreground">{periodLabel}</p><ul className="space-y-1.5">{data.salesByDay.map((d) => { const total=d.onlineMinor+d.posMinor; const max=Math.max(...data.salesByDay.map((x)=>x.onlineMinor+x.posMinor),1); return <li key={d.date} className="flex items-center gap-3 text-xs"><span className="w-20 shrink-0 text-muted-foreground">{d.date.slice(5)}</span><span className="h-4 rounded bg-primary/20" style={{width:`${Math.max(2,(total/max)*55)}%`}} aria-hidden /><span className="tabular-nums font-medium">{formatMoney(total)}</span><span className="text-muted-foreground">{d.orders} orders</span></li>; })}</ul></div><TableCard title="Top products by revenue" rows={topRows} /></TabsContent>
      <TabsContent value="stock" className="mt-4 space-y-4"><div className="grid gap-3 sm:grid-cols-4"><Stat label="Stock value (cost basis, est.)" value={formatMoney(data.stockValue.costBasisMinor)} /><Stat label="Sellable units" value={String(data.stockValue.sellableUnits)} /><Stat label="Zero-availability variants" value={String(data.stockValue.zeroVariants)} tone="danger" /><Stat label="Low-stock variants (≤3)" value={String(data.stockValue.lowVariants)} tone="warning" /></div><p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Stock is a current snapshot, so it is intentionally not rewound by the activity date filter. Cost basis uses variant purchase prices as a demo approximation.</p></TabsContent>
      <TabsContent value="ops" className="mt-4 space-y-4"><div className="grid gap-3 lg:grid-cols-2"><TableCard title="Fulfilment counts" rows={Object.entries(data.fulfilmentCounts).map(([key,value])=>({label:key.replace(/_/g," "),value:`${value} order(s)`}))} /><TableCard title="Delivery outcomes" rows={Object.entries(data.deliveryCounts).map(([key,value])=>({label:key.replace(/_/g," "),value:`${value} job(s)`}))} /></div></TabsContent>
      <TabsContent value="returns" className="mt-4 space-y-4"><div className="grid gap-3 sm:grid-cols-4"><Stat label="Returns total" value={String(data.returnsSummary.total)} /><Stat label="Pending returns" value={String(data.returnsSummary.pending)} tone="warning" /><Stat label="Resolved returns" value={String(data.returnsSummary.resolved)} tone="success" /><Stat label="Refunded amount" value={formatMoney(data.returnsSummary.refundedMinor)} /></div><div className="grid gap-3 sm:grid-cols-3"><Stat icon={Banknote} label="Open cashier sessions" value={String(data.cashSummary.openSessions)} /><Stat icon={Banknote} label="Expected cash in open sessions" value={formatMoney(data.cashSummary.expectedMinor)} /><Stat icon={CreditCard} label="Last closed session difference" value={formatMoney(data.cashSummary.lastClosedDiffMinor)} tone={data.cashSummary.lastClosedDiffMinor===0?"success":"danger"} /></div><TableCard title="Payments reconciliation" rows={[{label:"Settled / reconciled attempts",value:String(data.paymentsReconciliation.settled)},{label:"Unsettled attempts",value:String(data.paymentsReconciliation.unsettled)},{label:"Exceptions",value:String(data.paymentsReconciliation.exceptions)}]} /></TabsContent>
    </Tabs>
  </div>;
}

function Stat({ label, value, tone, icon: Icon }: { label: string; value: string; tone?: "success" | "danger" | "warning"; icon?: typeof Banknote }) { return <div className="rounded-xl border bg-card p-4"><p className="flex items-center gap-1.5 text-xs text-muted-foreground">{Icon ? <Icon className="size-3.5" aria-hidden /> : null} {label}</p><p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-[color:var(--warning-foreground)]" : tone === "success" ? "text-success" : ""}`}>{value}</p></div>; }
function TableCard({ title, rows }: { title: string; rows: Row }) { return <div className="overflow-hidden rounded-xl border bg-card"><h2 className="border-b p-4 font-semibold">{title}</h2>{!rows.length ? <p className="p-4 text-sm text-muted-foreground">No data for this period.</p> : <ul className="divide-y text-sm">{rows.map((row,index)=><li key={index} className="flex flex-wrap justify-between gap-2 p-3"><span className="capitalize">{row.label}</span><span className="tabular-nums font-medium">{row.value}</span></li>)}</ul>}</div>; }
