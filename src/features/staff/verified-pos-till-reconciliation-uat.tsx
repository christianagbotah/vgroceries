"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/services/adapters/types";
import { formatMoney } from "@/lib/money";
import type { CashierTillSessionView, PosTillReconciliationView } from "@/services/contracts";
import { isDemoStaffSessionActive } from "./staff-demo-session";
import {
  assertVerifiedPosCashHistoryUat,
  verifiedPosCashHistoryUatEnabled,
} from "./verified-pos-cash-history-client";
import {
  loadVerifiedTillChoices,
  loadVerifiedTillReconciliation,
  verifiedTillCashCsvUrl,
} from "./verified-pos-till-reconciliation-client";

const ghTime = (value: string) => new Intl.DateTimeFormat("en-GH", {
  timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));

const signedMoney = (minor: number) =>
  minor < 0 ? "-" + formatMoney(-minor) : formatMoney(minor);

export function VerifiedPosTillReconciliationUat() {
  const [tills, setTills] = useState<CashierTillSessionView[]>([]);
  const [adminName, setAdminName] = useState("");
  const [tillId, setTillId] = useState("");
  const [report, setReport] = useState<PosTillReconciliationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!verifiedPosCashHistoryUatEnabled) {
      setLoading(false);
      return;
    }
    let active = true;
    const init = async () => {
      setLoading(true);
      setAdminName("");
      setTills([]);
      setReport(null);
      setError("");
      try {
        assertVerifiedPosCashHistoryUat({
          enabled: verifiedPosCashHistoryUatEnabled,
          demo: isDemoStaffSessionActive(),
          apiBase: process.env.NEXT_PUBLIC_API_BASE_URL,
        });
        const { apiOps } = await import("@/services/client");
        const identity = await apiOps.staffSession();
        if (identity.actor.role !== "admin")
          throw new ApiError("FORBIDDEN", "Only a real administrator can review tills.");
        const list = await loadVerifiedTillChoices();
        if (active) {
          setAdminName(identity.actor.name);
          setTills(list);
          setTillId(previous => list.some(t => t.id === previous) ? previous : "");
        }
      } catch (cause) {
        if (active) setError(cause instanceof ApiError &&
          ["UNAUTHENTICATED", "FORBIDDEN"].includes(cause.code)
          ? "Real administrator access is required to view cash-drawer reports."
          : cause instanceof ApiError ? cause.message : "Unable to verify till records.");
      } finally { if (active) setLoading(false); }
    };
    void init();
    return () => { active = false; };
  }, [revision]);

  const review = async () => {
    if (!tillId || busy || loading || !tills.some(t => t.id === tillId)) return;
    const requested = tillId;
    setBusy(true);
    setReport(null);
    setError("");
    try {
      const current = await loadVerifiedTillReconciliation(requested);
      // If the selected till changes while a response is in transit, do
      // not render another till's cash details under the new selection.
      setReport(current);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The till report could not be verified.");
    } finally { setBusy(false); }
  };

  if (!verifiedPosCashHistoryUatEnabled) return <main className="mx-auto max-w-3xl rounded-xl border p-6">
    <h1 className="font-serif text-2xl font-semibold">Verified POS reconciliation is disabled</h1>
    <p className="mt-2 text-sm">This read-only screen requires an approved UAT build.</p>
    <Button asChild variant="outline" className="mt-4">
      <Link href="/admin/pos/verified-uat">Return to verified POS</Link>
    </Button>
  </main>;

  const fields: Array<[string, number]> = report ? [
    ["Opening float", report.openingFloatMinor],
    ["Manual cash in", report.manualCashInMinor],
    ["Manual cash out", -report.manualCashOutMinor],
    ["Cash drops", -report.manualCashDropsMinor],
    ["Recorded cash sales", report.cashSalesMinor],
  ] : [];

  return <main className="mx-auto max-w-6xl space-y-5 pb-12">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-primary">Verified POS · Administrator only</p>
        <h1 className="font-serif text-3xl font-bold">Cash drawer reconciliation</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          A server-generated, read-only cash drawer report. It does not reconcile
          electronic provider settlements, refunds, taxes, bank deposits or the general ledger.
        </p>
      </div>
      <Button variant="outline" className="min-h-11" disabled={loading || busy}
        onClick={() => setRevision(x => x + 1)}>
        <RefreshCw className="size-4" aria-hidden /> Reload tills
      </Button>
    </header>
    <p role="status" className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm leading-6">
      <ShieldCheck className="size-5 shrink-0" aria-hidden />
      Only real administrator sessions can request this report. This screen cannot
      count cash, open or close a till, record sales, modify inventory or approve refunds.
    </p>
    {loading ? <p role="status" className="rounded-lg border p-4 text-sm">
      Verifying administrator permissions and fetching server tills…
    </p> : null}
    {error ? <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{error}</p> : null}
    {!loading && adminName ? <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">Verified administrator: <strong>{adminName}</strong></p>
      <label htmlFor="verified-pos-reconciliation-till" className="block text-sm font-medium">Till session to inspect</label>
      <select id="verified-pos-reconciliation-till" className="min-h-12 w-full min-w-0 rounded-md border bg-background px-3 text-base"
        value={tillId} disabled={busy}
        onChange={event => { setTillId(event.target.value); setReport(null); setError(""); }}>
        <option value="">Select a till</option>
        {tills.map(till => <option key={till.id} value={till.id}>
          {till.tillCode} · {till.locationId} · {till.status}
        </option>)}
      </select>
      {!tills.length ? <p role="status" className="text-sm text-muted-foreground">
        No till sessions were returned. This is not confirmation of a balanced cash drawer.
      </p> : null}
      <Button className="min-h-12" disabled={!tillId || loading || busy}
        onClick={() => void review()}>{busy ? "Verifying drawer…" : "Review server cash ledger"}</Button>
    </section> : null}
    {report && report.tillSessionId === tillId ? <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Till {report.tillCode}</h2>
          <p className="text-sm text-muted-foreground">Location {report.locationId} · {report.status} · Report at {ghTime(report.generatedAt)}</p>
          <p className="text-xs text-muted-foreground">Opened {ghTime(report.openedAt)}
            {report.closedAt ? " · Closed " + ghTime(report.closedAt) : ""}</p>
        </div>
        <Button asChild variant="outline" className="min-h-11">
          <a href={verifiedTillCashCsvUrl(tillId, process.env.NEXT_PUBLIC_API_BASE_URL!)}
            target="_blank" rel="noopener noreferrer">
            Download server cash CSV <ExternalLink className="size-4" aria-hidden />
          </a>
        </Button>
      </header>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([label, minor]) => <div key={label} className="rounded-lg bg-muted/35 p-3">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 font-semibold tabular-nums">{signedMoney(minor)}</dd>
        </div>)}
        <div className="rounded-lg border p-3">
          <dt className="text-sm font-semibold">Expected drawer cash</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(report.expectedDrawerCashMinor)}</dd>
        </div>
      </dl>
      <p className="text-sm">Recorded sales: <strong>{report.cashSalesCount}</strong> ·
        Active stock holds: <strong>{report.activeStockHoldsCount}</strong>
      </p>
      {report.status === "closed" ? <div className="space-y-2 rounded-lg border p-4">
        <h3 className="font-semibold">Closing comparison</h3>
        <p className="text-sm">Counted cash: {formatMoney(report.actualCountedCashMinor!)}</p>
        <p className="text-sm">Difference (counted − expected): {signedMoney(report.recomputedDifferenceMinor!)}</p>
        <p className="text-sm font-semibold">{!report.closingMatchesLedger
          ? "Saved closing figures conflict with the server cash ledger. Investigate before reporting this shift."
          : report.recomputedDifferenceMinor !== 0
            ? "Counted cash differs from expected cash. Investigate the drawer variance."
            : "Cash count agrees with the recorded cash-drawer ledger."}</p>
      </div> : <p className="rounded-lg border p-4 text-sm">
        This till is still open. Expected cash is a provisional ledger balance, not a physical count.
      </p>}
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-semibold">Recent server-recorded sales (up to 20)</summary>
        <div className="mt-3 space-y-2">
          {report.recentCashSales.map(sale => <div key={sale.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
            <span className="break-all">{sale.reference} · {ghTime(sale.createdAt)}</span>
            <strong className="tabular-nums">{formatMoney(sale.amountMinor)}</strong>
          </div>)}
          {!report.recentCashSales.length ? <p className="text-sm">No cash sales are recorded for this till.</p> : null}
          {report.recentCashSalesTruncated ? <p className="text-xs text-muted-foreground">
            More than 20 sales exist. This list is incomplete; totals use all recorded sales.
          </p> : null}
        </div>
      </details>
      <p className="text-xs text-muted-foreground">
        Source: server cash ledger only. Electronic payments, refunds and taxes are not reconciled.
      </p>
    </section> : null}
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline"><Link href="/admin/pos/verified-uat/history">Cash sales history</Link></Button>
      <Button asChild variant="outline"><Link href="/admin/pos/verified-uat">Back to verified POS</Link></Button>
    </div>
  </main>;
}
