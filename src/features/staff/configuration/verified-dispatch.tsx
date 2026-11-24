"use client";
import {useRef,useState} from "react";
import Link from "next/link";
import {api} from "@/services/client";
import {useApiData} from "@/features/staff/admin-data";
import {configurationApi,requireRealAdminTransport} from "./client";
import {dispatchQueueResponseSchema,dispatchRiderFleetResponseSchema,dispatchProviderTransitionRequestSchema,dispatchFailureReasonSchema,dispatchActionResponseSchema,type ProductionDispatchQueueResponse,type DispatchAllowedAction} from "@/services/contracts";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {LoadingState,ErrorState} from "@/components/shared/states";
import {useToast} from "@/hooks/use-toast";
import {formatDateTime} from "@/lib/format";
import {formatMoney} from "@/lib/money";

type Row=ProductionDispatchQueueResponse["items"][number];
const labels:Record<DispatchAllowedAction,string>={assign:"Assign",unassign:"Unassign",reassign:"Reassign",reschedule:"Reschedule",return_to_store:"Request return",receive_returned_goods:"Confirm physical receipt",provider_transition:"Record courier update"};
const actionOps:Record<DispatchAllowedAction,string>={assign:"admin.directory.dispatch.assign",reassign:"admin.directory.dispatch.reassign",unassign:"admin.verified.dispatch.unassign",reschedule:"admin.verified.dispatch.reschedule",return_to_store:"admin.verified.dispatch.return",receive_returned_goods:"admin.verified.dispatch.receive",provider_transition:"admin.verified.dispatch.transition"};
const human=(s:string)=>s.replace(/_/g," ");
export function providerActions(row:Row):string[]{
 if(row.deliveryStatus==="assigned")return ["picked_up","failed"];
 if(row.deliveryStatus==="picked_up")return ["out_for_delivery","failed"];
 if(row.deliveryStatus==="out_for_delivery")return ["delivered","failed"];
 if(row.deliveryStatus==="rescheduled"&&row.allowedActions.includes("provider_transition"))return row.custodyState==="dispatch"?["picked_up"]:row.custodyState==="provider"?["out_for_delivery"]:[];
 return [];
}
export function VerifiedDispatch(){
 const [page,setPage]=useState(1);
 const [delivered,setDelivered]=useState(false);
 const {data,loading,error,reload}=useApiData(async()=>{
  requireRealAdminTransport();
  const [queue,fleet,partners]=await Promise.all([
   api<unknown>("admin.directory.dispatch.queue",{query:{page,perPage:25,...(delivered?{status:"delivered"}:{})}}),
   api<unknown>("admin.verified.dispatch.fleet"),configurationApi.partners()]);
  return {queue:dispatchQueueResponseSchema.parse(queue),fleet:dispatchRiderFleetResponseSchema.parse(fleet),partners:partners.filter(p=>p.active)};
 },[page,delivered]);
 const {toast}=useToast();
 const [selected,setSelected]=useState<{row:Row;action:DispatchAllowedAction}|null>(null);
 const [target,setTarget]=useState("");
 const [reference,setReference]=useState("");
 const [note,setNote]=useState("");
 const [when,setWhen]=useState("");
 const [transition,setTransition]=useState("");
 const [reason,setReason]=useState("");
 const [proofMethod,setProofMethod]=useState("signature");
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const intent=useRef<{hash:string;key:string}|null>(null);
 function open(row:Row,action:DispatchAllowedAction){setSelected({row,action});setTarget("");setReference("");setNote("");setWhen("");setTransition("");setReason("");setProofMethod("signature");setConfirmed(false);}
 async function save(e:React.FormEvent){
  e.preventDefault();if(!selected||busy||!confirmed)return;
  const {row,action}=selected;
  setBusy(true);
  try{
   requireRealAdminTransport();
   if(!row.allowedActions.includes(action))throw Error("Action unavailable. Refresh the queue.");
   const query:Record<string,string>=action==="assign"?{orderId:row.orderId}:{jobId:row.jobId??""};
   const body:Record<string,unknown>={...(note.trim()?{note:note.trim()}:{})};
   if(action==="assign"||action==="reassign"){
    const rider=data?.fleet.riders.find(r=>"rider:"+r.riderProfileId===target&&r.effectiveAvailability==="available");
    const partner=data?.partners.find(p=>"directory:"+p.id===target);
    if(rider)body.riderProfileId=rider.riderProfileId;
    else if(partner)body.manualProvider={providerKey:target,...(reference.trim()?{reference:reference.trim()}:{})};
    else throw Error("Choose an available rider or active courier.");
   }else if(action==="reschedule"){
    // The administrator enters Ghana/UTC wall-clock time, not device-local time.
    const stamp=new Date(when+"Z");if(!when||!Number.isFinite(stamp.getTime())||stamp.getTime()<=Date.now())throw Error("Enter a future Ghana date and time.");
    body.when=stamp.toISOString();
   }else if(action==="provider_transition"){
    if(!providerActions(row).includes(transition))throw Error("Choose an allowed courier milestone.");
    body.action=transition;
    if(transition==="delivered")body.proof={method:proofMethod,reference:reference.trim()};
    if(transition==="failed")body.failureReason=reason;
    const parsed=dispatchProviderTransitionRequestSchema.safeParse(body);
    if(!parsed.success)throw Error(parsed.error.issues.map(x=>x.message).join("; "));
   }
   const op=actionOps[action];
   const hash=JSON.stringify({op,query,body});
   if(intent.current?.hash!==hash)intent.current={hash,key:crypto.randomUUID()};
   dispatchActionResponseSchema.parse(await api<unknown>(op,{query,body,idempotencyKey:intent.current.key}));
   intent.current=null;setSelected(null);toast({title:"Dispatch record updated"});await reload();
  }catch(e){toast({title:"Dispatch action failed",description:e instanceof Error?e.message:undefined,variant:"destructive"});}
  finally{setBusy(false);}
 }
 const assigning=selected?.action==="assign"||selected?.action==="reassign";
 const updating=selected?.action==="provider_transition";
 return <main className="space-y-5 pb-12">
 <header className="flex flex-wrap justify-between items-start gap-3"><div><h1 className="font-serif text-2xl font-bold">Dispatch control centre</h1><p className="text-sm text-muted-foreground">Live handover queue, rider assignments and recorded courier milestones.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={reload}>Refresh</Button><Button asChild variant="outline"><Link href="/admin/providers">Manage providers</Link></Button><Button asChild variant="outline"><Link href="/admin/dispatch/cod-exceptions">COD exceptions</Link></Button></div></header>
 <div className="flex gap-2"><Button variant={!delivered?"default":"outline"} onClick={()=>{setDelivered(false);setPage(1);}}>Dispatch queue</Button><Button variant={delivered?"default":"outline"} onClick={()=>{setDelivered(true);setPage(1);}}>Delivered</Button></div>
 {loading?<LoadingState/>:error?<ErrorState message={error} onRetry={reload}/>:data?<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
 <section className="min-w-0 space-y-3">
 {data.queue.items.map(row=><article key={row.orderId} className="space-y-3 rounded-xl border bg-card p-4"><div className="flex flex-wrap justify-between gap-2"><div><Link href={"/admin/orders/"+row.orderId} className="font-semibold hover:underline">{row.reference}</Link><p className="text-sm">{row.customerName} · {row.zoneName??"No zone"}</p></div><span className="h-fit rounded-md bg-muted px-2 py-1 text-sm font-medium capitalize">{human(row.deliveryStatus)}</span></div><div className="grid gap-2 text-sm sm:grid-cols-2"><p>Handover: {formatDateTime(row.handedOverAt)} GMT</p><p>Payment: {human(row.paymentStatus)}</p><p>Assignment: {row.assignment?.riderName??row.assignment?.providerName??"Unassigned"}</p><p>Custody: {human(row.custodyState??"dispatch")}</p>{row.assignment?.manualProviderReference&&<p>Booking: {row.assignment.manualProviderReference}</p>}{row.codDueMinor!==undefined&&<p>COD due: {formatMoney(row.codDueMinor)} (not collection evidence)</p>}{row.rescheduledFor&&<p>Rescheduled: {formatDateTime(row.rescheduledFor)} GMT</p>}</div>{row.returnsInspectionMessage&&<p className="text-sm">{row.returnsInspectionMessage}</p>}{row.blockers.length>0&&<p className="text-xs text-muted-foreground">{row.blockers.map(human).join(" · ")}</p>}<div className="flex flex-wrap gap-2">{!delivered&&row.allowedActions.map(action=><Button key={action} size="sm" variant="outline" onClick={()=>open(row,action)}>{labels[action]}</Button>)}</div></article>)}
 {!data.queue.items.length&&<p className="rounded-xl border border-dashed p-8 text-center text-sm">No orders in this queue.</p>}
 <div className="flex justify-between items-center"><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm">Page {page} · {data.queue.total} orders</span><Button variant="outline" disabled={page*25>=data.queue.total} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
 </section>
 <aside className="space-y-4"><section className="rounded-xl border bg-card p-4 space-y-3"><h2 className="font-semibold">Rider availability</h2>{data.fleet.riders.map(r=><div key={r.riderProfileId} className="flex justify-between gap-2 border-b pb-2 text-sm"><div>{r.name}<p className="text-xs text-muted-foreground">{human(r.kind)} · {r.vehicle}</p></div><span className="capitalize">{r.effectiveAvailability}</span></div>)}{!data.fleet.riders.length&&<p className="text-sm text-muted-foreground">No registered riders.</p>}</section><section className="rounded-xl border bg-card p-4 space-y-3"><h2 className="font-semibold">Active courier partners</h2>{data.partners.map(p=><div key={p.id} className="text-sm"><p>{p.name}</p><p className="text-xs text-muted-foreground">{p.coverage||"Coverage not specified"} · Manual</p></div>)}<p className="text-xs text-muted-foreground">No automated external booking is implied.</p></section></aside></div>:null}
 <Dialog open={!!selected} onOpenChange={o=>{if(!o&&!busy)setSelected(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?labels[selected.action]:"Dispatch action"}</DialogTitle><DialogDescription>{selected?.row.reference} · Record only a verified operational action.</DialogDescription></DialogHeader>
 <form className="space-y-4" onSubmit={save}>
 {assigning&&<><Label htmlFor="dispatch-target">Rider or courier</Label><select id="dispatch-target" className="w-full rounded-md border bg-background p-3" value={target} onChange={e=>setTarget(e.target.value)} required disabled={busy}><option value="">Select</option>{data?.fleet.riders.filter(r=>r.effectiveAvailability==="available").map(r=><option key={r.riderProfileId} value={"rider:"+r.riderProfileId}>{r.name} · Rider</option>)}{data?.partners.map(p=><option key={p.id} value={"directory:"+p.id}>{p.name} · Manual courier</option>)}</select>{target.startsWith("directory:")&&<><Label htmlFor="dispatch-booking">External booking reference (optional)</Label><Input id="dispatch-booking" maxLength={256} value={reference} onChange={e=>setReference(e.target.value)} disabled={busy}/></>}</>}
 {selected?.action==="reschedule"&&<><Label htmlFor="dispatch-when">New date and time (Ghana / GMT)</Label><Input id="dispatch-when" type="datetime-local" required value={when} onChange={e=>setWhen(e.target.value)} disabled={busy}/></>}
 {updating&&selected&&<><Label htmlFor="dispatch-transition">Observed milestone</Label><select id="dispatch-transition" className="w-full rounded-md border bg-background p-3" value={transition} onChange={e=>setTransition(e.target.value)} required disabled={busy}><option value="">Select</option>{providerActions(selected.row).map(a=><option key={a} value={a}>{human(a)}</option>)}</select>{transition==="delivered"&&<><Label htmlFor="dispatch-proof-method">Proof method</Label><select id="dispatch-proof-method" className="w-full rounded-md border bg-background p-3" value={proofMethod} onChange={e=>setProofMethod(e.target.value)} disabled={busy}><option value="signature">Signature</option><option value="photo_note">Photo reference</option></select><Label htmlFor="dispatch-proof">Verified proof reference</Label><Input id="dispatch-proof" required maxLength={256} value={reference} onChange={e=>setReference(e.target.value)} disabled={busy}/></>}{transition==="failed"&&<><Label htmlFor="dispatch-reason">Failure reason</Label><select id="dispatch-reason" className="w-full rounded-md border bg-background p-3" required value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}><option value="">Select</option>{dispatchFailureReasonSchema.options.map(r=><option value={r} key={r}>{human(r)}</option>)}</select></>}</>}
 <Label htmlFor="dispatch-note">Operational note</Label><Input id="dispatch-note" maxLength={500} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/>
 <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy} required/>{selected?.action==="receive_returned_goods"?"I confirm the goods are physically received at the store. This does not release stock for resale.":"I confirm this operational action is accurate. It does not confirm payment or cash collection."}</label>
 <Button type="submit" disabled={busy||!confirmed} className="w-full">{busy?"Saving…":"Save action"}</Button></form></DialogContent></Dialog>
 </main>;
}
