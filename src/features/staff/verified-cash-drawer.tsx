"use client";

/**
 * Production cashier reporting is intentionally READ ONLY.
 * Every request goes to the real authenticated REST API; this screen does not
 * open tills, move cash, create holds, issue receipts, or complete POS sales.
 */
import { useCallback, useEffect, useState } from "react";
import {
  cashierTillListSchema,
  posTillReconciliationViewSchema,
  type CashierTillSessionView,
  type PosTillReconciliationView,
} from "@/services/contracts";
import { resolveClientAdapter, ApiError } from "@/services/adapters/browser";
import { useStaff } from "@/features/staff/role-context";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";

type TillList = ReturnType<typeof cashierTillListSchema.parse>;

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GH", {
    timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short",
  });

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "The service response could not be verified. No cashier data has been assumed.";
}

function MoneyFigure({ label, amount }: { label: string; amount: number }) {
  return <div className="rounded-lg border bg-muted/30 p-3">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(amount)}</dd>
  </div>;
}

function TillItem({ till, onPreview, busy }: {
  till: CashierTillSessionView;
  onPreview: (id: string) => void;
  busy: boolean;
}) {
  return <article className="rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-semibold">{till.tillCode} · {till.locationId}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {till.status === "open" ? "Open" : "Closed"} · {dateLabel(till.openedAt)}
        </p>
        <p className="text-sm text-muted-foreground">
          Expected cash: {formatMoney(till.expectedDrawerCashMinor ?? till.expectedDrawerOnlyMinor)}
        </p>
      </div>
      <Button type="button" variant="outline" onClick={() => onPreview(till.id)}
        disabled={busy} className="min-h-10">
        View verified cash report
      </Button>
    </div>
  </article>;
}

export function VerifiedCashDrawerReport() {
  const { can } = useStaff();
  const allowed = can("cash.session.manage");
  const [list, setList] = useState<TillList | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<PosTillReconciliationView | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    resolveClientAdapter().request<unknown>({ op: "pos.tills.list" })
      .then(response => {
        const verified = cashierTillListSchema.parse(response);
        if (current) { setList(verified); setError(null); }
      })
      .catch(err => {
        if (current) { setList(null); setError(errorMessage(err)); }
      })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [allowed, refreshKey]);

  useEffect(() => {
    if (!allowed || !selected) return;
    let current = true;
    resolveClientAdapter().request<unknown>({
      op: "pos.tills.reconciliation", query: { sessionId: selected },
    }).then(response => {
      const verified = posTillReconciliationViewSchema.parse(response);
      if (current) { setReport(verified); setReportError(null); }
    }).catch(err => {
      if (current) { setReport(null); setReportError(errorMessage(err)); }
    }).finally(() => { if (current) setReportBusy(false); });
    return () => { current = false; };
  }, [allowed, selected, refreshKey]);

  const choose = useCallback((id: string) => {
    setSelected(id); setReport(null); setReportError(null);
    setReportBusy(true);
  }, []);

  // The endpoint is server-authorised and only returns a cash-drawer CSV.
  const csvHref = report
    ? `${process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "")}/admin/pos/tills/${encodeURIComponent(report.tillSessionId)}/reconciliation.csv`
    : null;

  return <main className="min-w-0 space-y-5 pb-10">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-serif text-2xl font-bold">Cashier shifts and cash reports</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Live server-owned cash-drawer reports only. Opening or closing shifts,
          making sales and changing cash movements are not activated here.
        </p>
      </div>
      <Button type="button" variant="outline" onClick={() => {
        setSelected(null); setReport(null); setReportError(null);
        setReportBusy(false); setBusy(true); setRefreshKey(k => k + 1);
      }} disabled={!allowed || busy}>Refresh records</Button>
    </div>
    <p role="note" className="rounded-xl border p-4 text-sm leading-relaxed">
      Cash-drawer totals do not verify MoMo, bank or card settlements, refunds,
      tax invoices or the general ledger. No transaction is recorded by this screen.
    </p>
    {!allowed && <p role="alert" className="rounded-lg border p-4 text-sm">
      Only authorised administrators may view real till reports.
    </p>}
    {allowed && busy && <p role="status">Loading authenticated till records…</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
    {list && !list.enabled && <p role="status" className="rounded-lg border p-4 text-sm">
      Live cashier till operations are disabled in this environment. Nothing can be opened,
      completed or reconciled from this screen.
    </p>}
    {list?.enabled && list.sessions.length === 0 && <p className="rounded-lg border p-4 text-sm">
      No real cashier sessions have been recorded.
    </p>}
    {allowed && list?.enabled && <div className="grid gap-3 lg:grid-cols-2">
      {list.sessions.map(till => <TillItem key={till.id} till={till} onPreview={choose} busy={reportBusy}/>)}
    </div>}
    {selected && reportBusy && <p role="status">Checking cash-drawer ledger…</p>}
    {reportError && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{reportError}</p>}
    {allowed && report && <section aria-label="Selected till reconciliation" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Verified cash-drawer preview — {report.tillCode}</h2>
          <p className="text-sm text-muted-foreground">
            {report.status === "open" ? "Open shift" : "Closed shift"} ·
            Generated {dateLabel(report.generatedAt)}
          </p>
        </div>
        {csvHref && <a href={csvHref} className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted">
          Export cash CSV
        </a>}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MoneyFigure label="Opening float" amount={report.openingFloatMinor}/>
        <MoneyFigure label="Manual cash in" amount={report.manualCashInMinor}/>
        <MoneyFigure label="Manual cash out" amount={report.manualCashOutMinor}/>
        <MoneyFigure label="Cash drops" amount={report.manualCashDropsMinor}/>
        <MoneyFigure label="Completed cash sales" amount={report.cashSalesMinor}/>
        <MoneyFigure label="Expected drawer cash" amount={report.expectedDrawerCashMinor}/>
        {report.actualCountedCashMinor !== null &&
          <MoneyFigure label="Physically counted at close" amount={report.actualCountedCashMinor}/>}
        {report.recomputedDifferenceMinor !== null &&
          <MoneyFigure label="Counted minus expected" amount={report.recomputedDifferenceMinor}/>}
      </dl>
      <p className="text-sm text-muted-foreground">
        {report.cashSalesCount} completed cash sales · {report.activeStockHoldsCount}
        active stock holds. {report.closingMatchesLedger === false
          ? "The saved shift closing values do not match the current cash ledger; investigate."
          : ""}
      </p>
      <h3 className="font-semibold">Recent cash-sale references</h3>
      {report.recentCashSales.length === 0
        ? <p className="text-sm text-muted-foreground">No completed cash sales in this shift.</p>
        : <ul className="divide-y rounded-lg border">
          {report.recentCashSales.map(sale => <li key={sale.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
            <span className="min-w-0 break-all">{sale.reference} · {dateLabel(sale.createdAt)}</span>
            <strong className="tabular-nums">{formatMoney(sale.amountMinor)}</strong>
          </li>)}
        </ul>}
      {report.recentCashSalesTruncated &&
        <p className="text-sm text-muted-foreground">Only the latest 20 references are shown; shift totals include all recorded cash sales.</p>}
      <p className="text-xs text-muted-foreground">
        Scope: cash drawer only. CSV figures are pesewa-based; this is not a statutory tax invoice,
        a bank statement or completed merchant accounting.
      </p>
    </section>}
  </main>;
}
