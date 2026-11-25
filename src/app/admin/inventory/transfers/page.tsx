"use client";

import {useEffect,useMemo,useState} from "react";
import {apiOps} from "@/services/client";
import {useApiData} from "@/features/staff/admin-data";
import {isDemoStaffSessionActive} from "@/features/staff/staff-demo-session";
import {LoadingState,ErrorState,EmptyState} from "@/components/shared/states";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {formatDateTime} from "@/lib/format";
import {formatTransferMoney,internalTransferStatuses,type InternalTransferRow} from "../../../../../packages/contracts/src/internal-transfers";
import {TransferRequestForm,TransferActions} from "./transfer-operations";
import {ArrowRight,RefreshCw,Truck} from "lucide-react";

const labels:Record<InternalTransferRow["status"],string>={
 requested:"Awaiting authorization",authorized:"Authorized",reserved:"Reserved",
 cancelled:"Cancelled",rejected:"Rejected",in_transit:"In transit",
};

export default function BranchTransfersPage(){
 const [mode,setMode]=useState<"checking"|"unavailable"|"ready">("checking");
 useEffect(()=>{
  const task=window.setTimeout(()=>setMode(process.env.NEXT_PUBLIC_INTERNAL_TRANSFERS_UAT==="1"&&!!process.env.NEXT_PUBLIC_API_BASE_URL&&!isDemoStaffSessionActive()?"ready":"unavailable"),0);
  return ()=>window.clearTimeout(task);
 },[]);
 if(mode==="checking")return <LoadingState label="Checking branch transfer workspace"/>;
 if(mode==="unavailable")return <EmptyState title="Branch transfers are not enabled" description="This workspace requires the verified transfer API and a real staff session. No demonstration inventory records are shown."/>;
 return <TransferWorkspace/>;
}

function TransferWorkspace(){
 const {data,loading,error,reload}=useApiData(()=>apiOps.internalTransfers(),[]);
 const [status,setStatus]=useState("all"),[search,setSearch]=useState("");
 const [productQuery,setProductQuery]=useState("");
 const options=useApiData(()=>apiOps.transferOptions(productQuery),[productQuery]);
 const locationName=(id:string|null)=>id?(options.data?.locations.find(l=>l.id===id)?.name??id):"Source not assigned";
 const variantName=(id:string)=>{const v=options.data?.variants.find(v=>v.id===id);return v?v.productName+" · "+v.name:id;};

 const rows=useMemo(()=>{
  const q=search.trim().toLowerCase();
  return (data?.items??[]).filter(r=>(status==="all"||r.status===status)&&(!q||[r.id,r.sourceId??"",r.destinationId,r.note,...r.lines.map(l=>l.variantId),r.dispatch?.handoverReference??""].some(v=>v.toLowerCase().includes(q))));
 },[data,status,search]);
 const visible=data?.items??[];
 const counts=[{label:"Awaiting authorization",value:visible.filter(r=>r.status==="requested").length},{label:"Authorized",value:visible.filter(r=>r.status==="authorized").length},{label:"Reserved",value:visible.filter(r=>r.stockReserved).length},{label:"In transit",value:visible.filter(r=>r.status==="in_transit").length}];
 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h1 className="font-serif text-2xl font-bold">Branch transfers</h1><p className="text-sm text-muted-foreground">Authorized internal stock movements, separate from supplier purchases.</p></div>
   <Button variant="outline" onClick={()=>void reload()} disabled={loading}><RefreshCw className="size-4" aria-hidden/> Refresh</Button>
  </div>
  <div className="rounded-xl border bg-muted/40 p-3 text-sm">Requisition, head-office authorization, reservation and dispatch are available in this candidate. Dispatch is not destination receipt or a financial journal. Receiving and reconciliation actions are not enabled.</div>
  {options.error?<ErrorState title="Transfer operations unavailable" message={options.error} onRetry={options.reload}/>:options.data?<TransferRequestForm options={options.data} onReload={reload} onSearch={setProductQuery} busy={options.loading}/>:null}
  {loading?<LoadingState label="Loading verified branch transfers"/>:error?<ErrorState message={error} onRetry={reload}/>:<>
   {data?.capped?<p role="status" className="rounded-lg border p-3 text-sm">Showing the latest 100 transfer records within your permitted scope. Counts apply only to these records.</p>:null}
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{counts.map(c=><div key={c.label} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{c.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{c.value}</p></div>)}</div>
   <div className="flex flex-wrap gap-2">
    <Input className="min-w-48 flex-1" type="search" aria-label="Search transfers" placeholder="Transfer, location, product or reference…" value={search} onChange={e=>setSearch(e.target.value)}/>
    <select className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Filter transfer status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{internalTransferStatuses.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select>
   </div>
   {rows.length===0?<EmptyState icon={Truck} title={visible.length?"No matching transfers":"No branch transfers"} description={visible.length?"Try another search or status.":"No transfer requisitions are available in your permitted scope."}/>:<div className="space-y-3">{rows.map(r=><details key={r.id} className="rounded-xl border bg-card p-4">
    <summary className="cursor-pointer space-y-2">
     <span className="inline-flex flex-wrap items-center gap-2 font-semibold">{locationName(r.sourceId)} <ArrowRight className="inline size-4" aria-hidden/> {locationName(r.destinationId)}<span className="rounded-full bg-muted px-2 py-1 text-xs">{labels[r.status]}</span></span>
     <span className="block break-all text-xs text-muted-foreground">{r.id} · {formatDateTime(r.createdAt)} · {r.lines.length} requested lines</span>
    </summary>
    <div className="mt-4 space-y-4 border-t pt-3 text-sm">
     <dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-muted-foreground">Requested by</dt><dd className="break-all">{r.requestedBy}</dd></div><div><dt className="text-muted-foreground">Head-office decision</dt><dd>{r.decidedAt?formatDateTime(r.decidedAt):"Awaiting decision"}</dd></div><div><dt className="text-muted-foreground">Reservation</dt><dd>{r.reservationStatus}{r.reservationExpiresAt?" · "+formatDateTime(r.reservationExpiresAt):""}</dd></div><div><dt className="text-muted-foreground">Request note</dt><dd className="break-words">{r.note||"—"}</dd></div>{r.decisionNote?<div><dt className="text-muted-foreground">Decision note</dt><dd className="break-words">{r.decisionNote}</dd></div>:null}{r.cancellationNote?<div><dt className="text-muted-foreground">Cancellation note</dt><dd className="break-words">{r.cancellationNote}</dd></div>:null}</dl>
     <div className="overflow-x-auto"><table className="w-full text-left"><caption className="pb-2 text-left font-semibold">Requested items</caption><thead><tr className="border-b"><th className="py-2">Product / variant</th><th className="py-2 text-right">Quantity</th></tr></thead><tbody>{r.lines.map(l=><tr key={l.id} className="border-b"><td className="py-2 break-all">{variantName(l.variantId)}</td><td className="text-right tabular-nums">{l.quantity}</td></tr>)}</tbody></table></div>
     {r.dispatch?<section className="space-y-2 rounded-lg border p-3"><h2 className="font-semibold">Original dispatch evidence</h2><p>Handover: {r.dispatch.handoverReference} · {formatDateTime(r.dispatch.dispatchedAt)}</p><p className="font-medium">Dispatched carrying value: {formatTransferMoney(r.dispatch.totalValueMinor)}</p><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b"><th>Batch</th><th>Expiry</th><th className="text-right">Qty</th><th className="text-right">Unit cost</th><th className="text-right">Value</th></tr></thead><tbody>{r.dispatch.lots.map(l=><tr key={l.id} className="border-b"><td className="py-2 break-words">{l.lotNumber}</td><td>{l.expiryDate??"—"}</td><td className="text-right">{l.quantity}</td><td className="text-right whitespace-nowrap">{formatTransferMoney(String(l.unitCostMinor))}</td><td className="text-right whitespace-nowrap">{formatTransferMoney(l.valueMinor)}</td></tr>)}</tbody></table></div><p className="text-muted-foreground">Source stock has been reduced. Destination receipt and financial posting are not recorded by this release.</p></section>:null}
     {options.data&&!options.error&&!options.loading?<TransferActions row={r} options={options.data} onReload={reload}/>:null}
    </div>
   </details>)}</div>}
  </>}
 </div>;
}
