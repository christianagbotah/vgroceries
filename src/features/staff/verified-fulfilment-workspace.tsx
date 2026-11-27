"use client";
import Link from "next/link";
import {useRef,useState} from "react";
import {apiOps,ApiError} from "@/services/client";
import {useApiData} from "@/features/staff/admin-data";
import {LoadingState,ErrorState} from "@/components/shared/states";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {formatPlacedDateTime} from "@/lib/format";
import {PickReplayLedger} from "./pick-replay-ledger";
import type {FulfilmentDetailResponse,ProductionFulfilmentStatus,ProductionFulfilmentAction} from "../../../packages/contracts/src/fulfilment";

const queues:[ProductionFulfilmentStatus,string][]=[["awaiting_confirmation","Awaiting confirmation"],["confirmed","Ready to pick"],["picking","Picking / exceptions"],["packed","Delivery handover"],["ready_for_collection","Collection"],["dispatched","Dispatched"],["delivered","Delivered"],["collected","Collected"],["cancelled","Cancelled"]];
const label=(s:string)=>s.replace(/_/g," ");
const blocks:Record<string,string>={reservation_lost:"Stock reservation expired or incomplete. Review the order before proceeding.",picks_incomplete:"Record the actual picked quantity for every reserved lot.",shortage:"One or more lots have a shortage. Resolve before packing.",payment_pending:"Payment still pending.",payment_requires_review:"Payment needs review.",payment_insufficient:"Payment coverage is insufficient.",collection_cash_unverified:"Collection cash has not been verified.",already_handed_over:"Stock was already handed over.",invalid_state:"Action is not valid in this state."};
const actions:{name:ProductionFulfilmentAction;route:"confirm"|"start-picking"|"pack"|"handover";caption:string}[]=[{name:"confirm",route:"confirm",caption:"Confirm order"},{name:"start_picking",route:"start-picking",caption:"Start picking"},{name:"pack",route:"pack",caption:"Mark packed"},{name:"handover",route:"handover",caption:"Confirm physical handover"}];
type Reservation=FulfilmentDetailResponse["lines"][number]["reservations"][number];
function PickRow({row,orderId,disabled,save,replayLedger}:{row:Reservation;orderId:string;disabled:boolean;save:(work:()=>Promise<unknown>)=>Promise<void>;replayLedger:PickReplayLedger}){
 const [qty,setQty]=useState(row.pickedQuantity??"");
 const [note,setNote]=useState(row.shortageNote??"");
 const valid=/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(qty)&&Number.isFinite(Number(qty))&&Number(qty)<=Number(row.expectedQuantity);
 const shortage=valid&&Number(qty)<Number(row.expectedQuantity);
 const submit=()=>{const raw={pickedQuantity:qty,...(note.trim()?{note:note.trim()}: {})};void save(async()=>{const replay=replayLedger.keyFor(orderId,row.reservationId,raw);await apiOps.verifiedFulfilmentPick(orderId,row.reservationId,raw,replay);replayLedger.confirmed(orderId,row.reservationId);});};
 return <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_120px_1fr_auto] md:items-end">
  <div className="text-sm"><p className="font-medium">Lot {row.lotNumber}</p><p className="text-muted-foreground">Reserved: {row.expectedQuantity} · {row.expiryDate?"Expires "+row.expiryDate:"No expiry recorded"}</p><p>Recorded: {row.pickedQuantity??"Not recorded"} {row.pickState?("("+label(row.pickState)+")"):""}</p></div>
  <div><Label htmlFor={"qty-"+row.reservationId}>Actual picked</Label><Input id={"qty-"+row.reservationId} inputMode="decimal" value={qty} onChange={e=>setQty(e.target.value)} disabled={disabled} placeholder="Quantity"/></div>
  <div><Label htmlFor={"note-"+row.reservationId}>{shortage?"Shortage note (required)":"Note (optional)"}</Label><Input id={"note-"+row.reservationId} value={note} onChange={e=>setNote(e.target.value)} maxLength={500} disabled={disabled}/></div>
  <Button disabled={disabled||!valid||(shortage&&!note.trim())} onClick={submit}>Record pick</Button>
 </div>;
}
export function VerifiedFulfilmentDetail({orderId,onChange,embedded=false}:{orderId:string;onChange:()=>void;embedded?:boolean}){
 const {data,loading,error,reload}=useApiData(()=>apiOps.verifiedFulfilmentDetail(orderId),[orderId]);
 const [replayLedger]=useState(()=>new PickReplayLedger());
 const [busy,setBusy]=useState(false);const lock=useRef(false);const [message,setMessage]=useState("");const [failure,setFailure]=useState(false);
 const save=async(work:()=>Promise<unknown>)=>{if(lock.current)return;lock.current=true;setBusy(true);setMessage("");setFailure(false);try{await work();setMessage("Action accepted by the server.");}catch(e){setFailure(true);setMessage(e instanceof ApiError?e.message:"Action could not be verified. Review the refreshed state before retrying.");}finally{try{await reload();onChange();}finally{lock.current=false;setBusy(false);}}};
 return <section className="space-y-4 rounded-xl border bg-card p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Order fulfilment detail</h2>{!embedded&&<Button asChild variant="outline"><Link href={"/admin/orders/"+encodeURIComponent(orderId)}>Full order details</Link></Button>}</div>
  {message&&<p role={failure?"alert":"status"} className={failure?"text-sm text-destructive":"text-sm"}>{message}</p>}
  {loading?<LoadingState rows={3} label="Loading reservation evidence"/>:error?<ErrorState message={error} onRetry={reload}/>:data&&data.orderId===orderId?<><div className="flex flex-wrap items-center gap-2"><strong>{data.reference}</strong><span className="rounded-full border px-3 py-1 text-sm capitalize">{label(data.fulfilmentStatus)}</span><span className="text-sm capitalize">Payment: {label(data.paymentStatus)}</span></div>
  {data.blockingReasons.length>0&&<div className="rounded-lg border bg-muted/30 p-3 text-sm"><p className="font-medium">Action restrictions</p>{data.blockingReasons.map(reason=><p key={reason}>{blocks[reason]??label(reason)}</p>)}</div>}
  <div className="flex flex-wrap gap-2">{actions.filter(a=>data.allowedActions.includes(a.name)).map(a=><Button key={a.name} disabled={busy} onClick={()=>{if(a.name==="handover"&&!window.confirm("Confirm goods have physically been handed over. This records stock depletion."))return;void save(()=>apiOps.verifiedFulfilmentAction(orderId,a.route));}}>{a.name==="handover"?(data.fulfilment==="collection"?"Confirm customer collection":"Confirm dispatch handover"):a.caption}</Button>)}</div>
  {data.fulfilmentStatus==="awaiting_confirmation"&&data.paymentStatus==="succeeded"&&data.blockingReasons.includes("reservation_lost")&&!data.allowedActions.includes("confirm")&&<div className="space-y-2 rounded-lg border p-3 text-sm"><p>A paid order with an expired hold may be recoverable. The server must recheck the original payment and stock availability; this does not bypass any stock or payment rules.</p><Button variant="outline" disabled={busy} onClick={()=>{if(window.confirm("Recheck payment and stock, then confirm only if the server authorizes recovery?"))void save(()=>apiOps.verifiedFulfilmentAction(orderId,"confirm"));}}>Recheck stock and confirm</Button></div>}
  <div className="space-y-3">{data.lines.map(line=><article key={line.orderLineId} className="space-y-2 rounded-lg border p-3"><div><p className="font-semibold">{line.productName} · {line.variantName}</p><p className="text-sm text-muted-foreground">Ordered: {line.orderedQuantity} {line.unit}</p></div>{line.reservations.length===0?<p className="text-sm text-muted-foreground">No current reservation.</p>:line.reservations.map(row=>data.allowedActions.includes("record_pick")?<PickRow key={row.reservationId+":"+(row.pickedQuantity??"")+":"+(row.shortageNote??"")} row={row} orderId={orderId} disabled={busy} save={save} replayLedger={replayLedger}/>:<div key={row.reservationId} className="rounded-md bg-muted/30 p-2 text-sm">Lot {row.lotNumber} · Reserved {row.expectedQuantity} · Picked {row.pickedQuantity??"Not recorded"} {row.pickState?" · "+label(row.pickState):""}</div>)}</article>)}</div>
  {data.timeline.length>0&&<div className="space-y-2"><h3 className="font-medium">Fulfilment history</h3>{data.timeline.map((event,i)=><div className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm" key={i}><span>{label(event.action.replace("fulfilment.",""))}{event.note?" — "+event.note:""}</span><span className="text-muted-foreground">{formatPlacedDateTime(event.at)}</span></div>)}</div>}
  </>:null}
 </section>;
}
export function VerifiedFulfilmentWorkspace(){
 const [status,setStatus]=useState<ProductionFulfilmentStatus>("awaiting_confirmation");const [page,setPage]=useState(1);const [selected,setSelected]=useState<string|null>(null);
 const {data,loading,error,reload}=useApiData(()=>apiOps.verifiedFulfilmentQueue(status,page),[status,page]);
 return <div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-serif text-2xl font-bold">Fulfilment</h1><p className="text-sm text-muted-foreground">Live order queue, actual lot picks, packing and physical handover.</p></div><Button variant="outline" onClick={()=>void reload()}>Refresh</Button></div>
  <div className="flex flex-wrap items-center gap-2">{queues.map(([value,title])=><Button key={value} variant={status===value?"default":"outline"} size="sm" onClick={()=>{setStatus(value);setPage(1);setSelected(null);}}>{title}</Button>)}</div>
  {loading?<LoadingState rows={5} label="Loading live fulfilment queue"/>:error?<ErrorState message={error} onRetry={reload}/>:data?<div className="overflow-hidden rounded-xl border bg-card"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted/60"><tr>{["Order","Customer","Placed","Payment","Items / picks","Restrictions","Action"].map(h=><th key={h} className="p-3 font-semibold">{h}</th>)}</tr></thead><tbody>{data.items.map(row=><tr className="border-t" key={row.orderId}><td className="p-3"><strong>{row.reference}</strong><p className="capitalize text-muted-foreground">{row.fulfilment}</p></td><td className="p-3">{row.customerName}</td><td className="whitespace-nowrap p-3">{formatPlacedDateTime(row.createdAt)}</td><td className="p-3 capitalize">{label(row.paymentStatus)}</td><td className="p-3">{row.lineCount} lines · {row.pickedReservationCount}/{row.reservationCount} lots picked</td><td className="p-3">{row.blockingReasons.map(label).join(", ")||"None"}</td><td className="p-3"><Button size="sm" variant="outline" onClick={()=>setSelected(row.orderId)}>Open</Button></td></tr>)}{!data.items.length&&<tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No orders in this queue.</td></tr>}</tbody></table></div><div className="flex items-center justify-between gap-2 border-t p-3 text-sm"><span>{data.total} orders · Page {data.page}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page<=1} onClick={()=>{setPage(p=>p-1);setSelected(null);}}>Previous</Button><Button variant="outline" size="sm" disabled={page*data.perPage>=data.total} onClick={()=>{setPage(p=>p+1);setSelected(null);}}>Next</Button></div></div></div>:null}
  {selected&&<VerifiedFulfilmentDetail key={selected} orderId={selected} onChange={()=>void reload()}/>}
 </div>;
}
