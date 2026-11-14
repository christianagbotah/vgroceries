"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Headphones, Phone, RefreshCw, ShieldCheck } from "lucide-react";
import { api, apiOps, ApiError } from "@/services/client";

type Activity={action:string;privateNote:string|null;actorId:string|null;createdAt:string};
type Case={id:string;reference:string;name:string;phone:string;email:string|null;
 subject:string;message:string;orderReference:string|null;preferredContact:string;
 status:string;createdAt:string;updatedAt:string;activities:Activity[]};
type List={items:Case[];capped:boolean};
const STATUSES=["open","acknowledged","in_progress","resolved","closed"] as const;
function date(value:string){const n=Date.parse(value);return Number.isNaN(n)?"—":
 new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(n));}
export default function AdminSupportPage(){
 const [cases,setCases]=useState<List|null>(null),[filter,setFilter]=useState("all"),[selected,setSelected]=useState<string|null>(null);
 const [status,setStatus]=useState<string>("acknowledged"),[note,setNote]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const reload=useCallback(async(choice:string)=>{
  const list=await api<List>("admin.support.list",{query:choice==="all"?{}:{status:choice}});
  setCases(list);return list;
 },[]);
 useEffect(()=>{
  let active=true;
  apiOps.staffSession().then(async session=>{
   if(session.actor.role!=="admin")throw new ApiError("FORBIDDEN","Administrator-only support queue.");
   const list=await reload(filter);if(!active)return;setCases(list);
  }).catch(cause=>{if(active)setError(cause instanceof ApiError?cause.message:"Unable to open support queue.")})
    .finally(()=>{if(active)setLoading(false)});
  return ()=>{active=false};
 },[filter,reload]);
 const current=cases?.items.find(x=>x.id===selected)||null;
 async function update(){
  if(!current||busy)return;setBusy(true);setError("");setNotice("");
  try{
    await api("admin.support.action",{query:{caseId:current.id},body:{status,note}});
    await reload(filter);setNote("");setNotice("Update recorded in the case audit history.");
  }catch(cause){setError(cause instanceof ApiError?cause.message:"Could not save case update.");}
  finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-7xl space-y-5 px-4 py-7">
  <header className="flex flex-wrap items-center justify-between gap-3">
    <div><p className="flex items-center gap-2 text-sm font-bold text-primary"><Headphones className="size-5"/> Customer support operations</p>
      <h1 className="font-serif text-3xl font-black">Support inbox</h1>
      <p className="mt-1 text-sm text-muted-foreground">Real database-backed requests with private case notes. No outbound calls or SMS are sent automatically.</p>
    </div>
    <button type="button" onClick={()=>{setError("");void reload(filter).catch(()=>setError("Could not refresh support cases."));}}
      className="flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-bold"><RefreshCw className="size-4"/> Refresh</button>
  </header>
  <div className="flex flex-wrap items-center gap-3">
    <label htmlFor="support-status-filter" className="text-sm font-semibold">Status</label>
    <select id="support-status-filter" value={filter} onChange={e=>{setSelected(null);setFilter(e.target.value)}}
     className="min-h-11 rounded-lg border bg-background px-3 text-sm"><option value="all">All requests</option>{STATUSES.map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select>
    {cases?.capped?<p className="text-xs text-amber-700">First 100 cases shown; pagination required for larger volumes.</p>:null}
  </div>
  {loading?<p role="status" className="rounded-xl border p-4">Loading your authorised support inbox…</p>:null}
  {error?<p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{error}</p>:null}
  {notice?<p role="status" className="rounded-xl border border-primary/40 p-3 text-sm text-primary">{notice}</p>:null}
  {!loading&&!cases?<p className="text-sm">Please <Link href="/staff/login?next=%2Fadmin%2Fsupport" className="font-bold underline">sign in as an administrator</Link> to review real support requests.</p>:null}
  {cases?<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
    <section className="min-w-0 space-y-2">
      <h2 className="text-lg font-bold">Requests ({cases.items.length})</h2>
      {!cases.items.length?<p className="rounded-xl border p-5 text-sm text-muted-foreground">No requests match this filter.</p>:null}
      {cases.items.map(x=><button key={x.id} type="button" onClick={()=>{setSelected(x.id);setStatus(x.status);setNote("");setNotice("")}}
       className={"w-full rounded-xl border p-4 text-left hover:border-primary "+(selected===x.id?"border-primary bg-primary/[0.03]":"bg-card")}>
        <div className="flex items-center justify-between gap-2"><p className="font-semibold">{x.reference}</p><span className="rounded-md border px-2 py-1 text-xs">{x.status.replaceAll("_"," ")}</span></div>
        <p className="mt-1 text-sm">{x.name} · {x.subject}</p>
        <p className="mt-1 text-xs text-muted-foreground">{date(x.createdAt)}</p>
       </button>)}
    </section>
    <section className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
      {!current?<p className="text-sm text-muted-foreground">Select a case to view the customer&apos;s enquiry and manage its status.</p>:<>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-lg font-bold">{current.reference}</h2>
          <span className="rounded-lg border px-2 py-1 text-xs">{current.status.replaceAll("_"," ")}</span>
        </div>
        <div className="mt-4 space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
          <p><strong>Customer:</strong> {current.name}</p>
          <p><strong>Phone:</strong> {current.phone} <a className="inline-flex items-center gap-1 font-bold text-primary underline" href={"tel:"+current.phone}><Phone className="size-3"/> Dial</a></p>
          {current.email?<p className="break-all"><strong>Email:</strong> {current.email}</p>:null}
          <p><strong>Requested contact:</strong> {current.preferredContact}</p>
          {current.orderReference?<p><strong>Unverified order reference:</strong> {current.orderReference}</p>:null}
          <p><strong>Received:</strong> {date(current.createdAt)}</p>
          <p className="whitespace-pre-wrap border-t pt-3">{current.message}</p>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4"/> Verify ownership before sharing private order or payment information.</p>
        <h3 className="mt-5 font-semibold">Internal case history</h3>
        <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto">{current.activities.map((activity,i)=><li key={i} className="rounded-lg border p-2 text-xs">
          <p className="font-semibold">{activity.action.replaceAll("_"," ")} · {date(activity.createdAt)}</p>
          {activity.privateNote?<p className="mt-1 whitespace-pre-wrap">{activity.privateNote}</p>:null}
        </li>)}</ul>
        <div className="mt-5 space-y-3 border-t pt-4">
          <label className="block space-y-1 text-sm font-semibold">Next status<select value={status} onChange={e=>setStatus(e.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-background px-3">
            {STATUSES.map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}
          </select></label>
          <label className="block space-y-1 text-sm font-semibold">Internal note<textarea minLength={5} maxLength={1000} rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe the contact, verification and next action. Do not record passwords or payment secrets." className="mt-1 w-full rounded-lg border p-3 text-base"/></label>
          <button type="button" disabled={busy||note.trim().length<5} onClick={()=>void update()} className="min-h-11 w-full rounded-lg bg-primary px-4 font-bold text-white disabled:opacity-50">{busy?"Saving…":"Save audited case update"}</button>
          <p className="text-xs text-muted-foreground">A saved status is an internal workflow event, not proof that a message or callback was delivered.</p>
        </div>
      </>}
    </section>
  </div>:null}
 </main>;
}
