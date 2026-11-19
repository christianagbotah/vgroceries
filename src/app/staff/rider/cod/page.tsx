"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Banknote, CheckCircle2, LogOut, RefreshCcw, ShieldAlert } from "lucide-react";
import {
  type ProductionRiderJobResponse, type CodCashDeclarationView,
} from "@/services/contracts";
import { apiOps, ApiError } from "@/services/client";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  declareVerifiedRiderCod, getVerifiedRiderCodHistory,
  verifyRiderCodEnvironment, verifiedRiderCodEnabled,
} from "@/features/rider/verified-cod-client";

type KeyState={jobId:string;amountMinor:number;note:string;key:string};
const codDelivered=(job:ProductionRiderJobResponse)=>
  job.deliveryStatus==="delivered" && Boolean(job.proof) && job.paymentMethod==="cash_on_delivery" &&
  job.paymentStatus==="unpaid" && Number.isSafeInteger(job.codDueMinor) &&
  (job.codDueMinor??0)>0;
const eligible=(job:ProductionRiderJobResponse)=> codDelivered(job) && !job.codCashDeclaration;

/** Enabled-only real rider workspace. No legacy riderId, demo or mock adapter. */
export default function VerifiedRiderCodPage(){
  const router=useRouter();
  const [riderName,setRiderName]=useState("");
  const [jobs,setJobs]=useState<ProductionRiderJobResponse[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [selected,setSelected]=useState<ProductionRiderJobResponse|null>(null);
  const [note,setNote]=useState("");
  const [counted,setCounted]=useState(false);
  const [holding,setHolding]=useState(false);
  const [saved,setSaved]=useState<CodCashDeclarationView|null>(null);
  const [completed,setCompleted]=useState<string[]>([]);
  const [revision,setRevision]=useState(0);
  const attempt=useRef<KeyState|null>(null);

  useEffect(()=>{
    if(!verifiedRiderCodEnabled){setLoading(false);return;}
    const controller=new AbortController();let active=true;
    // Clear previous account's order and financial context before each check.
    setLoading(true);setError("");setJobs([]);setRiderName("");
    setSelected(null);setSaved(null);setCompleted([]);attempt.current=null;
    void(async()=>{
      try{
        verifyRiderCodEnvironment();
        const session=await apiOps.staffSession();
        if(session.actor.role!=="rider"){
          router.replace("/staff/rider/login");return;
        }
        const result=await getVerifiedRiderCodHistory(controller.signal);
        if(active){setRiderName(session.actor.name);setJobs(result.jobs.filter(codDelivered));}
      }catch(cause){
        if(active && !controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not verify the rider cash records.");
      }finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;controller.abort();};
  },[router,revision]);

  function choose(job:ProductionRiderJobResponse){
    if(busy)return;
    setSelected(job);setNote("");setCounted(false);setHolding(false);
    setSaved(null);setError("");attempt.current=null;
  }
  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(!selected || busy || !counted || !holding || note.trim().length<10 ||
       note.trim().length>400 || !eligible(selected))return;
    setBusy(true);setError("");
    try{
      verifyRiderCodEnvironment();
      const session=await apiOps.staffSession();
      if(session.actor.role!=="rider")throw new ApiError("FORBIDDEN","A real rider session is required.");
      const amountMinor=selected.codDueMinor!;
      const noteText=note.trim();
      const same=attempt.current && attempt.current.jobId===selected.jobId &&
        attempt.current.amountMinor===amountMinor && attempt.current.note===noteText;
      if(!same){
        if(!window.crypto?.randomUUID)throw new ApiError("UNAVAILABLE","Secure transaction IDs are unavailable on this device.");
        attempt.current={jobId:selected.jobId,amountMinor,note:noteText,
          key:window.crypto.randomUUID().replaceAll("-","")};
      }
      const result=await declareVerifiedRiderCod(selected.jobId,{
        amountMinor,cashCountConfirmed:true,riderPossessionConfirmed:true,note:noteText,
      },attempt.current!.key);
      setSaved(result);setCompleted(current=>[...new Set([...current,selected.jobId])]);
      setSelected(null);setNote("");setCounted(false);setHolding(false);
      attempt.current=null;
    }catch(cause){
      setError(cause instanceof Error ? cause.message : "Declaration could not be verified. Do not assume cash is recorded.");
    }finally{setBusy(false);}
  }
  async function signOut(){
    await apiOps.staffLogout().catch(()=>undefined);
    router.replace("/staff/rider/login");router.refresh();
  }
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-7 pb-16">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-primary">Variety Groceries · Verified rider</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Declare cash in your possession</h1>
        <p className="text-sm text-muted-foreground">{riderName ? `Signed in: ${riderName}. ` : ""}Only your real, completed COD deliveries are listed.</p>
      </div>
      <Button type="button" variant="outline" className="h-11 gap-2" onClick={signOut}>
        <LogOut className="size-4" aria-hidden /> Sign out
      </Button>
    </header>
    <section role="note" className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm leading-6">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
      <p><strong>This is not proof of payment to Variety Groceries.</strong> You are declaring physical cash counted and currently held by you. A supervisor must independently verify it and complete a separate cash remittance. Do not declare cash that you did not actually collect.</p>
    </section>
    {!verifiedRiderCodEnabled ? <p role="status" className="rounded-xl border p-5 text-sm">
      Verified rider cash declarations are disabled on this portal. No cash record can be submitted.
      <Link className="ml-2 text-primary underline" href="/staff/rider/login">Return to sign-in</Link>
    </p> : <>
      {loading && <p role="status" className="rounded-xl border p-5 text-sm">Verifying real rider identity and completed jobs…</p>}
      {error && <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
      {saved && <section role="status" className="flex gap-3 rounded-xl border border-green-600/30 p-4 text-sm leading-6">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div><p className="font-semibold">Rider declaration recorded — supervisor unverified</p>
          <p>Reference: {saved.id} · {formatMoney(saved.amountMinor)} held by rider. Not remitted or marked paid.</p></div>
      </section>}
      {!loading && riderName && <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{jobs.length} completed COD job{jobs.length===1?"":"s"} · recorded rider statements are shown but cannot be submitted twice</p>
        <Button type="button" variant="outline" size="sm" className="min-h-11 gap-2" onClick={()=>setRevision(n=>n+1)} disabled={busy}>
          <RefreshCcw className="size-4" aria-hidden /> Refresh
        </Button>
      </div>}
      {!loading && riderName && jobs.length===0 && <p className="rounded-xl border p-6 text-sm text-muted-foreground">No completed unpaid COD deliveries were returned by the real rider API.</p>}
      {!loading && riderName && jobs.length>0 && <div className="space-y-3">
        {jobs.map(job=><div key={job.jobId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div><p className="font-semibold">{job.orderReference}</p>
            <p className="mt-1 text-sm text-muted-foreground">Exact server-owned COD total: <strong>{formatMoney(job.codDueMinor!)}</strong></p>
            {job.codCashDeclaration ? <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              Rider cash declared on {new Date(job.codCashDeclaration.declaredAt).toLocaleString("en-GH")} · supervisor unverified · not remitted
            </p> : <p className="mt-1 text-xs text-muted-foreground">Completed delivery · cash declaration not yet recorded</p>}
          </div>
          <Button type="button" variant="outline" className="min-h-11 gap-2" disabled={busy || Boolean(job.codCashDeclaration) || completed.includes(job.jobId)} onClick={()=>choose(job)}>
            <Banknote className="size-4" aria-hidden />{job.codCashDeclaration?"Already declared · unverified":completed.includes(job.jobId)?"Declared in this session":"Declare held cash"}
          </Button>
        </div>)}
      </div>}
      {selected && <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Cash custody confirmation · {selected.orderReference}</h2>
        <p className="text-sm">Exact COD order total: <strong>{formatMoney(selected.codDueMinor!)}</strong>. The amount cannot be changed here.</p>
        <div className="space-y-1.5"><Label htmlFor="rider-cod-note">Physical cash counting note</Label>
          <Textarea id="rider-cod-note" required minLength={10} maxLength={400} rows={4}
            placeholder="Describe when and where you counted the exact physical cash. Do not enter payment account details."
            value={note} onChange={event=>setNote(event.target.value)} disabled={busy} />
          <p className="text-xs text-muted-foreground">10–400 characters. Do not include sensitive financial credentials.</p>
        </div>
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={counted}
          onChange={event=>setCounted(event.target.checked)} disabled={busy} className="mt-1 size-5" />
          I physically counted the complete cash amount shown above.</label>
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={holding}
          onChange={event=>setHolding(event.target.checked)} disabled={busy} className="mt-1 size-5" />
          I currently hold that exact physical cash and understand that a supervisor must separately verify and accept it.</label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-12 flex-1" disabled={busy || !counted || !holding || note.trim().length<10 || note.trim().length>400}>
            {busy?"Recording declaration…":"Confirm rider declaration only"}
          </Button>
          <Button type="button" variant="outline" className="min-h-12" disabled={busy} onClick={()=>{setSelected(null);setError("");attempt.current=null;}}>Cancel</Button>
        </div>
      </form>}
    </>}
  </main>;
}
