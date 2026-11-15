"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { StockAdjustmentHistory, StockAdjustmentLotOptions } from "@/services/contracts";
import { ApiError, apiOps } from "@/services/client";
import { isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Check, ClipboardCheck, RefreshCw, Search, ShieldCheck, X } from "lucide-react";

const enabled = process.env.NEXT_PUBLIC_STOCK_ADJUSTMENTS_UAT === "1";
const quantityPattern = /^[+-]?(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/;
type Actor = {id:string; name:string; role:string};
type PendingAction = {kind:"request"} | {kind:"approve"|"reject"; id:string; label:string};

const errMessage = (cause:unknown) =>
  cause instanceof Error ? cause.message : "The operation could not be completed.";

export function VerifiedStockAdjustments() {
  const [actor, setActor] = useState<Actor|null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<StockAdjustmentLotOptions|null>(null);
  const [rows, setRows] = useState<StockAdjustmentHistory>([]);
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending_approval");
  const [lotId, setLotId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<PendingAction|null>(null);
  const [revision, setRevision] = useState(0);
  const retryRef = useRef<{payload:string;key:string}|null>(null);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    if (isDemoStaffSessionActive()) {
      setError("Use a real administrator or inventory-manager login. Demo staff cannot manage physical stock.");
      setLoading(false);
      return;
    }
    const apiBase=process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!apiBase || apiBase.includes("/api/mock/")) {
      setError("Verified stock operations require a configured production API. Demo data is not accepted.");
      setLoading(false);
      return;
    }
    let current = true;
    apiOps.staffSession().then(session => {
      if (!current) return;
      if (!["admin","inventory_manager"].includes(session.actor.role))
        throw new Error("A real administrator or inventory manager is required.");
      setActor({id:session.actor.id,name:session.actor.name,role:session.actor.role});
    }).catch(cause => {
      if (current) { setError(errMessage(cause)); setLoading(false); }
    });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!actor) return;
    let current = true;
    setLoading(true);
    apiOps.verifiedAdjustmentLots({locationId:locationId||undefined,q:query||undefined})
      .then(async lotOptions => {
        const history = await apiOps.verifiedAdjustmentHistory(lotOptions.selectedLocationId);
        return {lotOptions,history};
      }).then(({lotOptions,history}) => {
      if (!current) return;
      setOptions(lotOptions);
      setRows(history);
      setLocationId(old => old || lotOptions.selectedLocationId);
      setError("");
    }).catch(cause => { if (current) setError(errMessage(cause)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [actor,locationId,query,revision]);

  const selectedLot = options?.lots.find(lot => lot.id === lotId);
  const pending = rows.filter(row => row.status === "pending_approval");
  const visible = useMemo(() => rows.filter(row =>
    statusFilter === "all" || row.status === statusFilter),[rows,statusFilter]);
  const canDecide = actor?.role === "admin";

  function validateRequest() {
    if (!selectedLot?.eligible) return "Choose an eligible stock lot from the current branch.";
    if (!quantityPattern.test(delta.trim()) || Number(delta) === 0)
      return "Enter a nonzero signed quantity, with at most three decimal places.";
    if (!["kg","litre"].includes(selectedLot.unit) && !Number.isInteger(Number(delta)))
      return "This product uses whole units. Enter a whole-number correction.";
    if (reason.trim().length < 8 || reason.trim().length > 200)
      return "Provide a reason of 8–200 characters.";
    if (note.trim().length > 1000) return "Keep the optional note under 1,000 characters.";
    return "";
  }

  async function apply() {
    if (!actor || !confirm || !options) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      if (confirm.kind === "request") {
        const problem = validateRequest();
        if (problem) throw new Error(problem);
        const payload = {
          lotId, variantId:selectedLot!.variantId, locationId:options.selectedLocationId,
          delta:delta.trim(), reason:reason.trim(), ...(note.trim()?{note:note.trim()}:{}),
        };
        const fingerprint = JSON.stringify(payload);
        if (!retryRef.current || retryRef.current.payload !== fingerprint)
          retryRef.current = {payload:fingerprint,key:crypto.randomUUID()};
        await apiOps.verifiedAdjustmentCreate(payload,retryRef.current.key);
        retryRef.current = null;
        setLotId("");setDelta("");setReason("");setNote("");
        setNotice("Physical-count correction requested. Stock has not changed; a different administrator must review it.");
      } else {
        await apiOps.verifiedAdjustmentDecide({
          adjustmentId:confirm.id,decision:confirm.kind,
        });
        setNotice(confirm.kind === "approve"
          ? "Correction approved. The server has recorded the stock movement and audit."
          : "Request rejected. Stock was not changed.");
      }
      setConfirm(null);
      setRevision(value => value+1);
    } catch (cause) { setError(errMessage(cause)); }
    finally { setBusy(false); }
  }

  if (!enabled) return <section className="mx-auto max-w-5xl space-y-4 rounded-xl border p-5">
    <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" />
      <h1 className="font-serif text-2xl font-bold">Verified stock corrections are disabled</h1></div>
    <p className="text-sm leading-6 text-muted-foreground">Stock adjustments require warehouse acceptance, a verified staff session and a separate administrator approval. No stock-changing action is available while the private UAT gates are off.</p>
    <Button variant="outline" asChild><Link href="/admin/inventory">Return to inventory</Link></Button>
  </section>;

  return <section className="mx-auto max-w-6xl space-y-5 pb-12">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="size-4" /> Verified warehouse UAT</p>
        <h1 className="font-serif text-3xl font-bold">Physical stock corrections</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">The requester records a physical count difference. Only a different authorised administrator can approve stock movement. Cash and customer payments are never changed here.</p>
      </div>
      <Button variant="outline" disabled={!actor || busy} onClick={() => setRevision(v=>v+1)} className="min-h-11">
        <RefreshCw className="mr-2 size-4" /> Refresh
      </Button>
    </header>
    {actor ? <p className="rounded-lg border bg-muted/40 p-3 text-sm">Signed in as <strong>{actor.name}</strong> · {actor.role === "admin" ? "Administrator" : "Inventory manager"}. Server permissions and current branch assignments are checked again for every action.</p> : null}
    {error ? <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p> : null}
    {loading && !options ? <p role="status" className="p-4 text-sm">Verifying staff and loading active stock branches…</p> : null}

    {options ? <>
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-1">
          <Label htmlFor="adjustment-branch">Stock branch</Label>
          <Select value={locationId||options.selectedLocationId} onValueChange={id=>{setLocationId(id);setLotId("");setSearch("");setQuery("");}}>
            <SelectTrigger id="adjustment-branch" className="min-h-11 w-full"><SelectValue placeholder="Choose branch" /></SelectTrigger>
            <SelectContent>{options.locations.map(loc=><SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <form className="space-y-1" onSubmit={event=>{event.preventDefault();setQuery(search.trim());setLotId("");}}>
          <Label htmlFor="adjustment-search">Find product or stock lot</Label>
          <div className="flex min-w-0 gap-2"><Input id="adjustment-search" placeholder="Product, variant or lot number" value={search} maxLength={120} onChange={e=>setSearch(e.target.value)} className="min-h-11 min-w-0 flex-1" />
            <Button type="submit" variant="outline" className="min-h-11"><Search className="mr-1 size-4" /> Search</Button>
          </div>
        </form>
      </div>
      {options.capped ? <p role="status" className="rounded-lg border p-3 text-sm text-amber-800 dark:text-amber-200">Showing the first 150 matching lots. Narrow the search to find the correct lot before submitting.</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardCheck className="size-5" /> Request a physical correction</h2>
          <form className="space-y-4" onSubmit={event=>{event.preventDefault();const problem=validateRequest();if(problem){setError(problem);return;}setError("");setConfirm({kind:"request"});}}>
            <div className="space-y-1">
              <Label htmlFor="adjustment-lot">Affected stock lot</Label>
              <Select value={lotId} onValueChange={id=>{setLotId(id);retryRef.current=null;}}>
                <SelectTrigger id="adjustment-lot" className="min-h-11 w-full"><SelectValue placeholder="Select a real stock lot" /></SelectTrigger>
                <SelectContent>{options.lots.map(lot=><SelectItem key={lot.id} value={lot.id} disabled={!lot.eligible}>
                  {lot.productName} · {lot.variantName} · {lot.lotNumber} · {lot.quantity} {lot.unit}{lot.ineligibleReason ? ` (${lot.ineligibleReason})` : ""}
                </SelectItem>)}</SelectContent>
              </Select>
              {selectedLot ? <p className="text-xs text-muted-foreground">Recorded physical quantity: {selectedLot.quantity} {selectedLot.unit}. Approval will recheck the current count and reservations.</p> : null}
            </div>
            <div className="space-y-1"><Label htmlFor="adjustment-delta">Signed change (e.g. -2 or +5)</Label>
              <Input id="adjustment-delta" value={delta} onChange={e=>setDelta(e.target.value)} className="min-h-11 font-mono text-base" inputMode="decimal" placeholder="-2" maxLength={18} required /></div>
            <div className="space-y-1"><Label htmlFor="adjustment-reason">Reason for the correction</Label>
              <Input id="adjustment-reason" value={reason} onChange={e=>setReason(e.target.value)} maxLength={200} minLength={8} className="min-h-11" placeholder="Verified count discrepancy" required /></div>
            <div className="space-y-1"><Label htmlFor="adjustment-note">Supporting note (optional)</Label>
              <Textarea id="adjustment-note" value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} rows={3} placeholder="Count reference, witness or investigation details" /></div>
            <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={busy || loading || !actor || !selectedLot?.eligible}>Review correction request</Button>
            <p className="text-xs leading-5 text-muted-foreground">No stock is changed when submitting a request. Changes require a second person to approve.</p>
          </form>
        </section>
        <aside className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-lg font-semibold">Approval queue</h2>
          <p className="text-sm text-muted-foreground">Pending in this branch: <strong className="text-foreground">{pending.length}</strong></p>
          {pending.length===0 ? <p className="rounded-lg bg-muted/50 p-4 text-sm">No adjustments awaiting approval.</p> : pending.slice(0,10).map(row=><article key={row.id} className="space-y-2 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><strong>{row.productName} · {row.variantName}</strong><span className="font-mono">{row.delta}</span></div>
            <p className="text-muted-foreground">{row.lotNumber} · {row.reason}</p>
            <p className="text-xs text-muted-foreground">Requested by {row.requestedBy} · {row.atLabel} Ghana time</p>
            {canDecide && row.requestedById !== actor?.id ? <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="min-h-10" disabled={busy} onClick={()=>setConfirm({kind:"approve",id:row.id,label:row.productName})}><Check className="mr-1 size-4" /> Approve</Button>
              <Button type="button" size="sm" variant="outline" className="min-h-10" disabled={busy} onClick={()=>setConfirm({kind:"reject",id:row.id,label:row.productName})}><X className="mr-1 size-4" /> Reject</Button>
            </div> : <p className="text-xs text-muted-foreground">Awaiting an independent administrator.</p>}
          </article>)}
        </aside>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Adjustment history</h2>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger aria-label="History status" className="min-h-11 w-full sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="pending_approval">Pending</SelectItem><SelectItem value="all">All statuses</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent>
          </Select>
        </div>
        {visible.length===0 ? <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">No adjustments match this filter.</div> : <>
          <div className="grid gap-2 md:hidden">{visible.map(row=><article key={row.id} className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            <div className="flex justify-between gap-2"><strong>{row.productName}</strong><StatusBadge kind="generic" status={row.status} /></div>
            <p>{row.variantName} · {row.lotNumber}</p><p>{row.delta} · {row.reason}</p>
            <p className="text-xs text-muted-foreground">Before: {row.beforeQuantity} · After: {row.afterQuantity??"Pending"} · {row.atLabel}</p>
          </article>)}</div>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block"><table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-left"><tr>{["When (Ghana)","Item / lot","Delta","Before → after","Reason","Requested by","Status"].map(x=><th key={x} className="whitespace-nowrap p-3 font-semibold">{x}</th>)}</tr></thead>
            <tbody>{visible.map(row=><tr key={row.id} className="border-t align-top">
              <td className="whitespace-nowrap p-3">{row.atLabel}</td><td className="p-3"><strong>{row.productName}</strong><span className="block text-xs text-muted-foreground">{row.variantName} · {row.lotNumber}</span></td>
              <td className="p-3 font-mono">{row.delta}</td><td className="whitespace-nowrap p-3 font-mono">{row.beforeQuantity} → {row.afterQuantity??"—"}</td>
              <td className="max-w-64 break-words p-3">{row.reason}</td><td className="p-3">{row.requestedBy}{row.approvedBy ? <span className="block text-xs text-muted-foreground">Reviewed: {row.approvedBy}</span>:null}</td>
              <td className="p-3"><StatusBadge kind="generic" status={row.status} /></td>
            </tr>)}</tbody>
          </table></div>
        </>}
      </section>
    </> : null}

    <Dialog open={confirm!==null} onOpenChange={open=>{if(!open&&!busy)setConfirm(null);}}>
      <DialogContent>
        <DialogHeader><DialogTitle>{confirm?.kind==="request"?"Confirm physical-count request":confirm?.kind==="approve"?"Approve stock correction?":"Reject stock correction?"}</DialogTitle>
          <DialogDescription>{confirm?.kind==="request"
            ? `Request ${delta} for ${selectedLot?.productName??"selected item"} · ${selectedLot?.lotNumber??""}. The physical balance will NOT change until approved by another administrator.`
            : confirm?.kind==="approve"
              ? `This will change physical stock for ${confirm.label} and record a permanent stock movement. The server rechecks active reservations and quantities.`
              : `Reject this adjustment for ${confirm?.label??"the selected item"} without changing stock.`}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</Button>
          <Button type="button" disabled={busy} onClick={()=>void apply()}>{busy?"Processing…":confirm?.kind==="request"?"Submit request":confirm?.kind==="approve"?"Approve and record":"Reject request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
