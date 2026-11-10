"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CashierTillSessionView, PosTillReconciliationView, SessionActor } from "@/services/contracts";
import { ApiError } from "@/services/adapters/types";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { cashierApiBase, createCashierReportClient } from "./cashier-report-client";
import { clearDemoStaffSession } from "./staff-demo-session";

type TillList = { enabled: boolean; includesSales: boolean; sessions: CashierTillSessionView[] };
type ShiftFilter = "all" | "open" | "closed";

function dateLabel(value: string) {
  return new Date(value).toLocaleString("en-GH", {
    timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short",
  });
}
function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "UNAUTHENTICATED") return "Your staff session has expired or has not been verified. Sign in with your cashier account.";
    if (error.code === "FORBIDDEN") return "Your account cannot view this cash report.";
    if (error.code === "NOT_FOUND") return "This shift is not in an assigned active location, or it no longer exists.";
    return error.message;
  }
  if (error instanceof Error && error.message === "This account does not have cashier report access.") return error.message;
  if (error instanceof Error && error.message.includes("API is not configured")) return error.message;
  return "We could not verify the cashier records. No balances have been assumed.";
}
function Figure({label,amount}:{label:string;amount:number}) {
  return <div className="rounded-xl border bg-background p-3">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(amount)}</dd>
  </div>;
}

export function CashierWorkspace() {
  const router = useRouter();
  const [signingOut,setSigningOut] = useState(false);
  const [actor,setActor] = useState<SessionActor | null>(null);
  const [list,setList] = useState<TillList | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [busy,setBusy] = useState(true);
  const [refresh,setRefresh] = useState(0);
  const [search,setSearch] = useState("");
  const [shiftFilter,setShiftFilter] = useState<ShiftFilter>("all");
  const [selected,setSelected] = useState<string | null>(null);
  const [report,setReport] = useState<PosTillReconciliationView | null>(null);
  const [reportBusy,setReportBusy] = useState(false);
  const [reportError,setReportError] = useState<string | null>(null);

  useEffect(() => {
    let current=true;
    Promise.resolve().then(async () => {
      const api=createCashierReportClient(cashierApiBase());
      const identity=await api.session();
      const records=await api.list();
      return {identity,records};
    }).then(({identity,records}) => {
      if(!current)return;
      setActor(identity);setList(records);setError(null);
    }).catch(cause=>{
      if(!current)return;
      // Never retain a previous authenticated cashier's information on failure.
      setActor(null);setList(null);setReport(null);setSelected(null);
      setError(message(cause));
    }).finally(()=>{if(current)setBusy(false);});
    return ()=>{current=false;};
  },[refresh]);

  useEffect(()=>{
    if(!selected)return;
    let current=true;
    Promise.resolve().then(()=>createCashierReportClient(cashierApiBase()).reconciliation(selected))
      .then(data=>{if(current){setReport(data);setReportError(null);}})
      .catch(cause=>{if(current){setReport(null);setReportError(message(cause));}})
      .finally(()=>{if(current)setReportBusy(false);});
    return ()=>{current=false;};
  },[selected,refresh]);

  const visible = useMemo(()=>{
    const query=search.trim().toLocaleLowerCase("en-GH");
    return (list?.sessions??[]).filter(item=>
      (shiftFilter==="all"||item.status===shiftFilter)&&
      (!query||`${item.tillCode} ${item.locationId}`.toLocaleLowerCase("en-GH").includes(query)),
    );
  },[list,search,shiftFilter]);
  const preview = useCallback((id:string)=>{
    setSelected(id);setReport(null);setReportError(null);setReportBusy(true);
  },[]);
  const signOut=async()=>{
    setSigningOut(true);setError(null);
    try {
      await createCashierReportClient(cashierApiBase()).signOut();
      clearDemoStaffSession();
      setActor(null);setList(null);setReport(null);setSelected(null);
      router.replace("/staff/login");router.refresh();
    } catch(cause) {
      // Financial reports must disappear if sign-out cannot reverify the session.
      setActor(null);setList(null);setReport(null);setSelected(null);
      setError(message(cause));
    } finally { setSigningOut(false); }
  };
  const reload=()=>{
    setBusy(true);setSelected(null);setReport(null);setReportError(null);setReportBusy(false);
    setRefresh(value=>value+1);
  };
  let csvHref:string|null=null;
  if(report){
    try { csvHref=createCashierReportClient(cashierApiBase()).cashCsvHref(report.tillSessionId); }
    catch { csvHref=null; }
  }

  return <main className="mx-auto min-h-screen max-w-6xl space-y-5 px-4 py-6 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary font-serif text-2xl font-bold text-primary-foreground">V</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">Variety Groceries</p>
          <h1 className="font-serif text-2xl font-bold">Cashier workspace</h1>
          <p className="text-sm text-muted-foreground">Authenticated read-only shift reports</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {actor && process.env.NEXT_PUBLIC_POS_COUNTER_UAT === "1" && <Link
          href="/staff/pos" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
          Counter checkout
        </Link>}
        <Button type="button" variant="outline" disabled={busy} onClick={reload} className="min-h-11">Refresh</Button>
        {actor ? <Button type="button" variant="outline" disabled={signingOut||busy} onClick={signOut} className="min-h-11">
          {signingOut?"Signing out…":"Sign out"}
        </Button> : <Link href="/staff/login?next=%2Fstaff%2Fcashier" className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted">Staff sign in</Link>}
      </div>
    </header>

    <p className="rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed">
      This report screen never creates sales, receives payments, opens or closes tills, moves cash or
      changes stock. Where enabled for staging, use Counter checkout to complete a separately
      permissioned, cash-only sale. Reports do not verify MoMo, bank, card, refunds, tax or accounting.
    </p>

    {busy && <p role="status" className="rounded-xl border p-4">Checking your cashier session and assigned locations…</p>}
    {error && <section role="alert" className="space-y-2 rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
      <p>{error}</p>
      <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/staff/login?next=%2Fstaff%2Fcashier">Sign in to the real cashier workspace</Link>
    </section>}

    {!busy && actor && list && <>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Signed in as {actor.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {actor.role==="admin"?"Administrator reporting access":"Cashier reporting access"} ·
          {actor.locationIds.length? ` Assigned stock locations: ${actor.locationIds.join(", ")}`:
            " No stock location assigned"}
        </p>
      </section>
      {!list.enabled
        ? <p role="status" className="rounded-xl border p-4 text-sm">
            Cashier reporting is not enabled on this server. No sales or till actions are available.
          </p>
        : <>
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <label className="space-y-1 text-sm font-medium">
                <span>Search loaded tills and locations</span>
                <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
                  className="min-h-11 w-full rounded-md border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Till code or location"/>
              </label>
              <label className="space-y-1 text-sm font-medium">
                <span>Shift status</span>
                <select value={shiftFilter} onChange={e=>setShiftFilter(e.target.value as ShiftFilter)}
                  className="min-h-11 w-full rounded-md border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="all">All shifts</option><option value="open">Open</option><option value="closed">Closed</option>
                </select>
              </label>
            </div>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {visible.length} of {list.sessions.length} loaded shifts. The server supplies only the latest
              50 accessible shifts; this is not an exhaustive historical search.
            </p>
          </section>
          {visible.length===0 ? <p className="rounded-xl border p-4 text-sm">
            No accessible cashier shifts match these filters.
          </p> :
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map(till=><article key={till.id} className="space-y-3 rounded-xl border bg-card p-4">
              <h3 className="font-semibold">{till.tillCode} · {till.locationId}</h3>
              <p className="text-sm text-muted-foreground">{till.status==="open"?"Open shift":"Closed shift"} · {dateLabel(till.openedAt)}</p>
              <p className="text-sm">Expected drawer: <strong className="tabular-nums">{formatMoney(till.expectedDrawerCashMinor??till.expectedDrawerOnlyMinor)}</strong></p>
              <Button type="button" variant="outline" className="min-h-11 w-full" disabled={reportBusy} onClick={()=>preview(till.id)}>
                View cash report
              </Button>
            </article>)}
          </div>}
        </>}
    </>}
    {reportBusy && <p role="status">Verifying the selected shift ledger…</p>}
    {reportError && <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{reportError}</p>}
    {report && <section aria-label="Cashier reconciliation" className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Cash drawer — {report.tillCode}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{report.locationId} ·
            {report.status==="open"?" Open":" Closed"} · Generated {dateLabel(report.generatedAt)}</p>
        </div>
        {csvHref && <a href={csvHref} className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted">
          Export authorised cash CSV
        </a>}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Figure label="Opening float" amount={report.openingFloatMinor}/>
        <Figure label="Cash added" amount={report.manualCashInMinor}/>
        <Figure label="Cash removed" amount={report.manualCashOutMinor}/>
        <Figure label="Cash drops" amount={report.manualCashDropsMinor}/>
        <Figure label="Completed cash-only sales" amount={report.cashSalesMinor}/>
        <Figure label="Expected drawer cash" amount={report.expectedDrawerCashMinor}/>
        {report.actualCountedCashMinor!==null && <Figure label="Counted at close" amount={report.actualCountedCashMinor}/>}
        {report.recomputedDifferenceMinor!==null && <Figure label="Counted minus expected" amount={report.recomputedDifferenceMinor}/>}
      </dl>
      {report.closingMatchesLedger===false && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
        Closing records do not match the current cash ledger. Refer the difference to an administrator.
      </p>}
      <p className="text-sm text-muted-foreground">
        {report.cashSalesCount} cash-only sales · {report.activeStockHoldsCount} active stock holds
      </p>
      <h3 className="font-semibold">Recent completed cash sales</h3>
      {report.recentCashSales.length===0?<p className="text-sm text-muted-foreground">None recorded in this shift.</p>:
      <ul className="divide-y rounded-lg border">{report.recentCashSales.map(sale=>
        <li key={sale.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
          <span className="break-all">{sale.reference} · {dateLabel(sale.createdAt)}</span>
          <strong className="tabular-nums">{formatMoney(sale.amountMinor)}</strong>
        </li>)}</ul>}
      {report.recentCashSalesTruncated && <p className="text-sm text-muted-foreground">
        The 20 latest sale references are shown; totals include all recorded sales for this shift.
      </p>}
      <p className="text-xs text-muted-foreground">CSV values use integer pesewas. This is not a tax invoice or verified merchant settlement.</p>
    </section>}
  </main>;
}
