"use client";
import {useRef,useState} from "react";
import Link from "next/link";
import {api} from "@/services/client";
import {configurationApi,requireRealAdminTransport} from "@/features/staff/configuration/client";
import {dispatchQueueResponseSchema,type ProductionDispatchQueueResponse} from "@/services/contracts";
import {useApiData} from "@/features/staff/admin-data";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {ErrorState,LoadingState} from "@/components/shared/states";
import {useToast} from "@/hooks/use-toast";

type OrderRow=ProductionDispatchQueueResponse["items"][number];
export default function ProviderDispatchPage(){
 const [page,setPage]=useState(1);
 const {data,loading,error,reload}=useApiData(async()=>{
   requireRealAdminTransport();
   const [queue,partners]=await Promise.all([api<unknown>("admin.directory.dispatch.queue",{query:{page,perPage:25}}),configurationApi.partners()]);
   return {queue:dispatchQueueResponseSchema.parse(queue),partners:partners.filter(p=>p.active)};
 },[page]);
 const {toast}=useToast();
 const [target,setTarget]=useState<OrderRow|null>(null);
 const [partner,setPartner]=useState("");
 const [reference,setReference]=useState("");
 const [busy,setBusy]=useState(false);
 const intent=useRef<{hash:string;key:string}|null>(null);
 function open(row:OrderRow){setTarget(row);setPartner("");setReference("");}
 async function save(e:React.FormEvent){
  e.preventDefault();if(!target||!partner||busy)return;
  if(!data?.partners.some(p=>p.id===partner))return;
  const reassign=!target.allowedActions.includes("assign")&&target.allowedActions.includes("reassign")&&!!target.jobId;
  if(!reassign&&!target.allowedActions.includes("assign"))return;
  const op=reassign?"admin.directory.dispatch.reassign":"admin.directory.dispatch.assign";
  const query:Record<string,string>=reassign?{jobId:target.jobId!}:{orderId:target.orderId};
  const body={manualProvider:{providerKey:"directory:"+partner,...(reference.trim()?{reference:reference.trim()}:{})}};
  const hash=JSON.stringify({op,query,body});
  if(intent.current?.hash!==hash)intent.current={hash,key:crypto.randomUUID()};
  setBusy(true);
  try{
   requireRealAdminTransport();
   await api(op,{query,body,idempotencyKey:intent.current.key});
   intent.current=null;setTarget(null);toast({title:"Manual courier assignment saved"});await reload();
  }catch(e){toast({title:"Assignment failed",description:e instanceof Error?e.message:undefined,variant:"destructive"});}
  finally{setBusy(false);}
 }
 return <main className="space-y-5 pb-12">
 <header className="flex flex-wrap justify-between items-start gap-3"><div><h1 className="font-serif text-2xl font-bold">Manual courier dispatch</h1><p className="text-sm text-muted-foreground">Assign orders handed over to dispatch to an active directory partner.</p></div><Button asChild variant="outline"><Link href="/admin/providers">Manage providers</Link></Button></header>
 <p className="rounded-lg border p-3 text-sm text-muted-foreground">Record externally arranged bookings only. This does not contact a courier API, charge a customer, or confirm delivery or payment.</p>
 {loading?<LoadingState/>:error?<ErrorState message={error} onRetry={reload}/>:data?<><div className="space-y-3">{data.queue.items.map(row=><article key={row.orderId} className="flex flex-wrap justify-between gap-3 rounded-xl border bg-card p-4"><div><Link className="font-semibold hover:underline" href={"/admin/orders/"+row.orderId}>{row.reference}</Link><p className="text-sm">{row.customerName} · {row.zoneName??"No zone"}</p><p className="text-sm text-muted-foreground">{row.deliveryStatus.replace(/_/g," ")} · {row.assignment?.providerName??row.assignment?.riderName??"Unassigned"}</p></div>{(row.allowedActions.includes("assign")||(row.jobId&&row.allowedActions.includes("reassign")))&&<Button disabled={!data.partners.length} onClick={()=>open(row)}>Assign provider</Button>}</article>)}</div>{!data.queue.items.length&&<p className="rounded-xl border border-dashed p-6 text-center text-sm">No orders handed over to dispatch.</p>}{!data.partners.length&&<p className="text-sm text-muted-foreground">Create an active delivery provider first.</p>}<div className="flex items-center justify-between"><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm">Page {page}</span><Button variant="outline" disabled={page*25>=data.queue.total} onClick={()=>setPage(p=>p+1)}>Next</Button></div></>:null}
 <Dialog open={!!target} onOpenChange={o=>{if(!o&&!busy)setTarget(null);}}><DialogContent><DialogHeader><DialogTitle>Assign {target?.reference}</DialogTitle><DialogDescription>Choose the courier you arranged externally. Verify coverage before recording the booking.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={save}><div className="space-y-1"><Label htmlFor="partner">Delivery provider</Label><select id="partner" className="w-full rounded-md border bg-background p-3" required disabled={busy} value={partner} onChange={e=>setPartner(e.target.value)}><option value="">Choose an active provider</option>{data?.partners.map(p=><option key={p.id} value={p.id}>{p.name}{p.coverage?" — "+p.coverage:""}</option>)}</select></div><div className="space-y-1"><Label htmlFor="booking">External booking reference (optional)</Label><Input id="booking" maxLength={256} value={reference} disabled={busy} onChange={e=>setReference(e.target.value)}/></div><Button type="submit" disabled={busy||!partner} className="w-full">{busy?"Saving…":"Record assignment"}</Button></form></DialogContent></Dialog>
 </main>;
}
