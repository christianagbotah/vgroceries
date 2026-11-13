"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, parseMoneyToMinor } from "@/lib/money";
import type { CashierTillSessionView } from "@/services/contracts";
import { ApiError } from "@/services/adapters/types";
import { verifiedPosUat, type CashierTillList } from "./verified-pos-uat-transport";

const enabled = process.env.NEXT_PUBLIC_POS_COUNTER_UAT === "1";
type MovementKind = "cash_in" | "cash_out" | "drop";
type DrawerOperation = { mode: "move" | "close"; till: CashierTillSessionView };
const dateLabel = (value:string) => new Date(value).toLocaleString("en-GH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra",
});

const amountMinor = (value:string) => {
  const parsed = parseMoneyToMinor(value);
  return parsed !== null && Number.isSafeInteger(parsed) &&
    parsed >= 0 && parsed <= 100_000_000 ? parsed : null;
};

const readableError = (cause:unknown) => cause instanceof ApiError
  ? cause.code === "UNAUTHENTICATED"
    ? "Sign in using the actual staging administrator account."
    : cause.code === "FORBIDDEN"
      ? "This operation requires an administrator account."
      : cause.message
  : cause instanceof Error ? cause.message : "The test till operation could not be verified.";

export function VerifiedTillOperations() {
  const [actorName, setActorName] = useState("");
  const [csrf, setCsrf] = useState("");
  const [list, setList] = useState<CashierTillList|null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [notice, setNotice] = useState<string|null>(null);
  const [locationId, setLocationId] = useState("");
  const [tillCode, setTillCode] = useState("");
  const [float, setFloat] = useState("0.00");
  const [operation, setOperation] = useState<DrawerOperation|null>(null);
  const [kind, setKind] = useState<MovementKind>("cash_in");
  const [amount, setAmount] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(async() => {
    setList(await verifiedPosUat.tills());
  },[]);
  useEffect(()=>{
    if(!enabled) { setLoading(false); return; }
    let live=true;
    Promise.all([verifiedPosUat.session(),verifiedPosUat.tills()])
      .then(([session,rows])=>{
        if(!live)return;
        if(session.actor.role!=="admin"||!session.csrfToken)
          throw new ApiError("FORBIDDEN","A real administrator web session is required.");
        setCsrf(session.csrfToken);setActorName(session.actor.name);setList(rows);
      }).catch(cause=>{if(live){setCsrf("");setList(null);setError(readableError(cause));}})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[]);

  const locations=useMemo(()=>[...new Set((list?.sessions??[]).map(s=>s.locationId))].sort(),[list]);
  const activeSessions=(list?.sessions??[]).filter(s=>s.status==="open");
  const openingMinor=amountMinor(float);
  const canOpen=/^[A-Z0-9_-]{1,32}$/.test(tillCode.trim()) &&
    locationId.trim().length>0 && locationId.trim().length<=128 && openingMinor!==null;
  const inputMinor=amountMinor(operation?.mode==="close"?counted:amount);
  const expected=operation?.till.expectedDrawerCashMinor ??
    operation?.till.expectedDrawerOnlyMinor ?? 0;
  const difference=inputMinor === null ? null : inputMinor-expected;

  async function perform(action:()=>Promise<unknown>,success:string){
    setBusy(true);setError(null);setNotice(null);
    try{
      await action();
      await refresh();
      setOperation(null);setAmount("");setCounted("");setNote("");
      setNotice(success);
    }catch(cause){setError(readableError(cause));}
    finally{setBusy(false);}
  }
  function prepare(mode:"move"|"close",till:CashierTillSessionView){
    setOperation({mode,till});setKind("cash_in");setAmount("");
    setCounted(((till.expectedDrawerCashMinor ?? till.expectedDrawerOnlyMinor)/100).toFixed(2));
    setNote("");setError(null);setNotice(null);
  }

  if(!enabled) return <section className="mx-auto max-w-4xl space-y-3 p-6">
    <h1 className="text-2xl font-bold">Till operations are disabled</h1>
    <p>Real counter cash operations are limited to the private staging build. Production POS is not activated.</p>
    <Link href="/admin/cashier-sessions" className="underline">Return to cash reports</Link>
  </section>;

  return <main className="mx-auto max-w-5xl space-y-5 p-4 pb-10 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-primary">Variety Groceries · Private UAT</p>
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">Till opening and reconciliation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administrator-only cash drawer operations · No MoMo or card payments
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium" href="/admin/cashier-sessions">Cash reports</Link>
        <Link className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium" href="/admin/pos/verified-uat">Sample sale</Link>
      </div>
    </header>
    <p className="rounded-xl border border-amber-500/50 p-4 text-sm leading-6">
      <strong>Staging only.</strong> These actions persist in the separate synthetic POS
      database. Use test floats and simulated cash, not real physical money.
      Ending a shift records a counted-cash variance; it does not reconcile bank,
      MoMo, tax or merchant settlements. Open reservations must be released before closing.
    </p>
    {loading&&<p role="status" className="rounded-xl border p-4">Verifying administrator permissions…</p>}
    {error&&<p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="rounded-xl border p-4 text-sm">{notice}</p>}
    {!loading&&!csrf&&<Link href="/staff/login?next=%2Fadmin%2Fpos%2Ftill-operations"
      className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium">
      Sign in with the staging administrator account
    </Link>}
    {!loading&&!!csrf&&list&&<>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Open a sample counter shift</h2>
            <p className="text-sm text-muted-foreground">Administrator: {actorName}</p></div>
          <Button variant="outline" disabled={busy} onClick={()=>void perform(
            ()=>refresh(),"Reloaded the current server-owned shifts.")}>Refresh shifts</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Enter the exact configured branch location ID. Recently used branch IDs are offered below.
          Each till code must be unique among open shifts at that branch.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-medium"><span>Stock location ID</span>
            <Input value={locationId} disabled={busy} list="uat-pos-locations"
              onChange={e=>setLocationId(e.target.value)} placeholder="e.g. loc_accra" />
            <datalist id="uat-pos-locations">{locations.map(id=><option key={id} value={id}/>)}</datalist>
          </label>
          <label className="space-y-1 text-sm font-medium"><span>Till code</span>
            <Input value={tillCode} disabled={busy} maxLength={32}
              onChange={e=>setTillCode(e.target.value.toUpperCase())} placeholder="e.g. ACCRA02" />
          </label>
          <label className="space-y-1 text-sm font-medium"><span>Opening float (₵)</span>
            <Input value={float} disabled={busy} inputMode="decimal"
              onChange={e=>setFloat(e.target.value)} placeholder="0.00" />
          </label>
        </div>
        <Button disabled={!canOpen||busy||!list.enabled} onClick={()=>{
          if(!window.confirm(`Open simulated till ${tillCode.trim()} at ${locationId.trim()} with ${formatMoney(openingMinor!)} in test cash?`))return;
          void perform(()=>verifiedPosUat.openTill(csrf,{
            locationId:locationId.trim(),tillCode:tillCode.trim(),
            openingFloatMinor:openingMinor!,
          }),"New sample till opened successfully.");
        }}>Open test till</Button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Cash drawer shifts</h2>
          <span className="text-sm text-muted-foreground">
            {activeSessions.length} open · latest {list.sessions.length} shifts
          </span>
        </div>
        {!list.enabled&&<p role="status">Till operations are disabled on the staging API.</p>}
        {list.sessions.length===0&&<p className="rounded-xl border p-4 text-sm">No counter shifts found. Open a test shift above.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {list.sessions.map(till=><article key={till.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{till.tillCode} · {till.locationId}</h3>
                <p className="text-sm text-muted-foreground">{dateLabel(till.openedAt)}</p>
              </div>
              <span className="rounded-md border px-2 py-1 text-sm">{till.status==="open"?"Open":"Closed"}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Opening float</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(till.openingFloatMinor)}</dd></div>
              <div><dt className="text-muted-foreground">Recorded cash sales</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(till.cashSalesMinor??0)}</dd></div>
              <div><dt className="text-muted-foreground">Expected drawer</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(till.expectedDrawerCashMinor??till.expectedDrawerOnlyMinor)}</dd></div>
              <div><dt className="text-muted-foreground">{till.status==="closed"?"Counted difference":"Movements"}</dt>
                <dd className="font-semibold tabular-nums">{till.status==="closed"
                  ?formatMoney(till.closingDifferenceMinor??0):String(till.movements.length)}</dd></div>
            </dl>
            {till.status==="closed"&&<p className="text-sm text-muted-foreground">
              Closed {till.closedAt?dateLabel(till.closedAt):"at recorded server time"} · {till.closeNote??"No note"}</p>}
            {till.status==="open"&&<div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={()=>prepare("move",till)}>Cash movement</Button>
              <Button variant="outline" disabled={busy} onClick={()=>prepare("close",till)}>Count and close</Button>
            </div>}
          </article>)}
        </div>
      </section>

      {operation&&<section className="space-y-3 rounded-xl border border-primary/30 bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold">{operation.mode==="move"?"Record simulated cash movement":"Close and count drawer"}</h2>
            <p className="text-sm text-muted-foreground">
              Till {operation.till.tillCode} · {operation.till.locationId}
            </p></div>
          <Button variant="outline" disabled={busy} onClick={()=>setOperation(null)}>Cancel</Button>
        </div>
        {operation.mode==="move"?<>
          <label className="block space-y-1 text-sm font-medium"><span>Movement type</span>
            <select value={kind} disabled={busy} onChange={e=>setKind(e.target.value as MovementKind)}
              className="min-h-11 w-full rounded-md border bg-background px-3">
              <option value="cash_in">Cash in from safe</option>
              <option value="cash_out">Cash out to safe</option>
              <option value="drop">Cash drop</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm font-medium"><span>Test amount (₵)</span>
            <Input inputMode="decimal" value={amount} disabled={busy}
              onChange={e=>setAmount(e.target.value)} placeholder="e.g. 20.00" />
          </label>
        </>:<>
          <p className="rounded-md border p-3 text-sm">Expected cash including sample sales:
            <strong className="ml-2 tabular-nums">{formatMoney(expected)}</strong></p>
          <label className="block space-y-1 text-sm font-medium"><span>Physically counted simulated cash (₵)</span>
            <Input inputMode="decimal" value={counted} disabled={busy}
              onChange={e=>setCounted(e.target.value)} placeholder="e.g. 100.00" />
          </label>
          {difference!==null&&<p className="text-sm">
            Difference (counted minus expected): <strong className="tabular-nums">{formatMoney(difference)}</strong>
          </p>}
        </>}
        <label className="block space-y-1 text-sm font-medium"><span>Required reason or closing note (at least 10 characters)</span>
          <textarea className="min-h-20 w-full rounded-md border bg-background p-3"
            value={note} disabled={busy} maxLength={400}
            onChange={e=>setNote(e.target.value)} placeholder="Explain the sample cash count or drawer movement" />
        </label>
        <Button disabled={busy||inputMinor===null||(operation.mode==="move"&&inputMinor<=0)||
          note.trim().length<10||note.trim().length>400}
          onClick={()=>{
            const {mode,till}=operation;
            if(mode==="move"){
              if(!window.confirm(`Record ${kind} of ${formatMoney(inputMinor!)} on sample till ${till.tillCode}?`))return;
              void perform(()=>verifiedPosUat.moveCash(csrf,till.id,{
                kind,amountMinor:inputMinor!,note:note.trim(),
              }),"Test cash movement recorded in the audit trail.");
            }else{
              if(!window.confirm(`Close sample till ${till.tillCode} with counted ${formatMoney(inputMinor!)} and variance ${formatMoney(difference!)}? This cannot be undone.`))return;
              void perform(()=>verifiedPosUat.closeTill(csrf,till.id,{
                countedCashMinor:inputMinor!,note:note.trim(),
              }),"Sample till closed and counted difference recorded.");
            }
          }}>{operation.mode==="move"?"Record test cash movement":"Confirm counted close"}</Button>
      </section>}
    </>}
  </main>;
}
