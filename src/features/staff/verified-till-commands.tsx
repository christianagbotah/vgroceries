"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {api,apiOps,ApiError} from "@/services/client";
import {formatMoney,parseMoneyToMinor} from "@/lib/money";
import {isDemoStaffSessionActive} from "./staff-demo-session";
import {parseVerifiedTillChoices,verifiedPosTillReconciliationUatEnabled} from "./verified-pos-till-reconciliation-client";
import {assertVerifiedPosQuoteUat} from "./verified-pos-quote-client";
import {createTillIntent,executeTillIntent,verifiedTillCommandsEnabled,type TillIntent,type TillCommandKind} from "./verified-till-command-client";
import type {CashierTillSessionView} from "@/services/contracts";
export function VerifiedTillCommands(){
 const [rows,setRows]=useState<CashierTillSessionView[]>([]);
 const [admin,setAdmin]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 const [kind,setKind]=useState<TillCommandKind>("open"),[sessionId,setSessionId]=useState("");
 const [location,setLocation]=useState(""),[code,setCode]=useState(""),[amount,setAmount]=useState(""),[note,setNote]=useState("");
 const [movement,setMovement]=useState<"cash_in"|"cash_out"|"drop">("cash_in");
 const [attested,setAttested]=useState(false),[pending,setPending]=useState<TillIntent|null>(null);
 const lock=useRef(false),intentRef=useRef<TillIntent|null>(null);
 const enabled=verifiedTillCommandsEnabled||verifiedPosTillReconciliationUatEnabled;
 const reload=useCallback(async()=>{
  setLoading(true);setError("");setAdmin(false);setRows([]);
  try{
   assertVerifiedPosQuoteUat({enabled,demo:isDemoStaffSessionActive(),apiBase:process.env.NEXT_PUBLIC_API_BASE_URL});
   if((await apiOps.staffSession()).actor.role!=="admin")throw new ApiError("FORBIDDEN","Administrator access is required.");
   const list=parseVerifiedTillChoices(await api("pos.verified.tills"));
   setRows(list);setAdmin(true);
  }catch(e){setError(e instanceof ApiError?e.message:"Unable to verify till records.");}
  finally{setLoading(false);}
 },[enabled]);
 useEffect(()=>{if(enabled)void reload();else setLoading(false);},[enabled,reload]);
 async function submit(){
  if(lock.current||!admin||loading||!verifiedTillCommandsEnabled)return;
  lock.current=true;setBusy(true);setError("");setMessage("");
  try{
   let intent=intentRef.current;
   if(!intent){
    const minor=parseMoneyToMinor(amount);
    if(!attested||minor===null)throw new ApiError("VALIDATION_FAILED","Confirm the physical cash count and enter a valid amount.");
    const selected=rows.find(t=>t.id===sessionId&&t.status==="open");
    if(kind!=="open"&&!selected)throw new ApiError("VALIDATION_FAILED","Select an open till.");
    intent=createTillIntent(kind,kind==="open"?undefined:sessionId,kind==="open"?{locationId:location.trim(),tillCode:code.trim().toUpperCase(),openingFloatMinor:minor}:kind==="move"?{kind:movement,amountMinor:minor,note:note.trim()}:{countedCashMinor:minor,note:note.trim()});
    intentRef.current=intent;setPending(intent);
   }
   const result=await executeTillIntent(intent);
   intentRef.current=null;setPending(null);setAttested(false);setAmount("");setNote("");
   setMessage("Server accepted the till action for "+result.tillCode+". Reloading records.");
   await reload();
  }catch(e){
   if(e instanceof ApiError&&["FORBIDDEN","UNAUTHENTICATED"].includes(e.code)){setAdmin(false);setRows([]);}
   setError((e instanceof ApiError?e.message:"The outcome could not be confirmed.")+(intentRef.current?" Retry the identical action only, or inspect the server ledger before starting another action.":""));
  }finally{lock.current=false;setBusy(false);}
 }
 const frozen=busy||!!pending;
 return <main className="mx-auto max-w-5xl space-y-4">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-serif text-2xl font-bold">Cashier sessions</h1><p className="text-sm text-muted-foreground">Verified cash drawer records · administrator only</p></div><Button variant="outline" disabled={loading||busy} onClick={()=>void reload()}>Refresh records</Button></header>
  {verifiedPosTillReconciliationUatEnabled?<Button asChild variant="outline"><Link href="/admin/pos/verified-uat/reconciliation">Cash drawer reconciliation and CSV</Link></Button>:null}
  {loading?<p role="status">Verifying till records…</p>:null}
  {error?<p role="alert" className="rounded-lg border p-3 text-sm text-destructive">{error}</p>:null}
  {message?<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>:null}
  {!verifiedTillCommandsEnabled?<p className="rounded-lg border p-4 text-sm">Till actions are not activated in this build. Existing records and reconciliation remain read-only.</p>:null}
  {admin&&!loading?<><div className="grid gap-3 sm:grid-cols-2">{rows.map(t=><article className="rounded-xl border bg-card p-4" key={t.id}><h2 className="font-semibold">{t.tillCode} · {t.status}</h2><p className="text-sm text-muted-foreground">{t.locationId}</p><p className="mt-2">Opening float {formatMoney(t.openingFloatMinor)}</p><p>Recorded cash sales {t.cashSalesMinor===undefined?"Not supplied":formatMoney(t.cashSalesMinor)}</p><p className="font-semibold">Expected drawer cash {t.expectedDrawerCashMinor===undefined?"Not supplied":formatMoney(t.expectedDrawerCashMinor)}</p>{t.status==="closed"&&t.closingDifferenceMinor!==null?<p>Closing difference {formatMoney(t.closingDifferenceMinor)}</p>:null}</article>)}</div>{rows.length===0?<p>No till records returned.</p>:null}
  {verifiedTillCommandsEnabled?<section className="space-y-3 rounded-xl border p-4">
   <h2 className="font-semibold">Record physical drawer activity</h2>
   <p className="text-sm text-muted-foreground">No sales, payment settlements or stock changes are made here. Confirm each physical count. If the network fails, retry only the same request; do not refresh or repeat a cash movement without inspecting the ledger.</p>
   <fieldset disabled={frozen} className="grid gap-3 sm:grid-cols-2">
    <div><Label htmlFor="till-command">Action</Label><select id="till-command" className="w-full min-h-11 rounded-md border bg-background px-2" value={kind} onChange={e=>{setKind(e.target.value as TillCommandKind);setAttested(false);}}><option value="open">Open till</option><option value="move">Cash movement</option><option value="close">Close till</option></select></div>
    {kind==="open"?<><div><Label htmlFor="till-location">Active location ID</Label><Input id="till-location" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Exact configured branch ID"/></div><div><Label htmlFor="till-code">Till code</Label><Input id="till-code" maxLength={32} value={code} onChange={e=>setCode(e.target.value)}/></div></>:<div><Label htmlFor="till-session">Open till</Label><select id="till-session" className="w-full min-h-11 rounded-md border bg-background px-2" value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Choose a till</option>{rows.filter(t=>t.status==="open").map(t=><option key={t.id} value={t.id}>{t.tillCode} · {t.locationId}</option>)}</select></div>}
    {kind==="move"?<div><Label htmlFor="till-kind">Movement type</Label><select id="till-kind" className="w-full min-h-11 rounded-md border bg-background px-2" value={movement} onChange={e=>setMovement(e.target.value as typeof movement)}><option value="cash_in">Cash in</option><option value="cash_out">Cash out</option><option value="drop">Cash drop</option></select></div>:null}
    <div><Label htmlFor="till-amount">{kind==="open"?"Opening float":kind==="close"?"Physically counted cash":"Movement amount"} (₵)</Label><Input id="till-amount" inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setAttested(false);}}/></div>
    {kind!=="open"?<div><Label htmlFor="till-note">Reason (at least 10 characters)</Label><Input id="till-note" maxLength={400} value={note} onChange={e=>setNote(e.target.value)}/></div>:null}
    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/> I have verified the physical cash and confirm this exact action.</label>
   </fieldset>
   <Button disabled={busy||loading||(!pending&&!attested)} onClick={()=>void submit()}>{busy?"Verifying…":pending?"Retry identical action":"Confirm drawer action"}</Button>
   {pending?<p className="text-sm">An action is unresolved. Form editing is locked to preserve its request identity. Use the read-only reconciliation screen to investigate before retrying.</p>:null}
  </section>:null}</>:null}
 </main>;
}
