"use client";

import {useRef,useState} from "react";
import {apiOps} from "@/services/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {availableTransferActions,createTransferSchema,type InternalTransferRow,type TransferAction,type TransferOptions} from "../../../../../packages/contracts/src/internal-transfers";

const titles:Record<TransferAction,string>={authorize:"Authorize transfer",reject:"Reject requisition",reserve:"Reserve source stock",cancel:"Cancel reservation",dispatch:"Confirm physical dispatch"};
const descriptions:Record<TransferAction,string>={authorize:"Assign the supplying branch. Authorization does not move inventory.",reject:"Reject the requisition with a documented reason.",reserve:"Reserve the requested quantities against available source inventory.",cancel:"Release this transfer's stock reservation. This does not reverse a dispatch.",dispatch:"Confirm that goods were physically handed over. Source inventory will decrease; destination receipt is not recorded."};
const message=(error:unknown)=>error instanceof Error?error.message:"The operation could not be verified.";

export function TransferRequestForm({options,onReload,onSearch,busy}:{options:TransferOptions;onReload:()=>Promise<void>;onSearch:(query:string)=>void;busy:boolean}){
 const [destination,setDestination]=useState(""),[note,setNote]=useState(""),[search,setSearch]=useState(""),[variant,setVariant]=useState(""),[quantity,setQuantity]=useState("");
 const [lines,setLines]=useState<{variantId:string;label:string;quantity:string}[]>([]);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false);
 const pending=useRef<{key:string;body:{destinationId:string;note:string;lines:{variantId:string;quantity:string}[]}}|null>(null);
 const inFlight=useRef(false);
 const locked=saving||uncertain;
 function add(){
  const selected=options.variants.find(v=>v.id===variant);
  if(!selected||!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(quantity)||Number(quantity)<=0||(!["kg","litre"].includes(selected.unit)&&!Number.isInteger(Number(quantity)))||lines.some(l=>l.variantId===selected.id)||lines.length>=100){setError("Select a new product and a valid positive base-unit quantity.");return;}
  setLines(old=>[...old,{variantId:selected.id,label:selected.productName+" · "+selected.name+" ("+selected.unit+")",quantity}]);setVariant("");setQuantity("");setError("");
 }
 async function submit(){
  if(inFlight.current)return;
  if(!pending.current){
   const parsed=createTransferSchema.safeParse({destinationId:destination,note,lines:lines.map(({variantId,quantity})=>({variantId,quantity}))});
   if(!parsed.success){setError("Select a destination and add valid requested items.");return;}
   pending.current={key:crypto.randomUUID(),body:parsed.data};
  }
  inFlight.current=true;setSaving(true);setError("");setNotice("");
  try{
   const row=await apiOps.createInternalTransfer(pending.current.body,pending.current.key);
   pending.current=null;setUncertain(false);setLines([]);setNote("");setNotice("Requisition recorded: "+row.id);await onReload();
  }catch(e){setUncertain(true);setError(message(e)+" Retry the same request safely using its existing request key, or review the transfer list before leaving this page.");}
  finally{inFlight.current=false;setSaving(false);}
 }
 return <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-semibold">New transfer requisition</summary>
  <div className="mt-4 space-y-3">
   <label className="block text-sm">Receiving branch<select className="mt-1 h-10 w-full rounded-md border bg-background px-2" disabled={locked} value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Choose branch</option>{options.locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
   {options.locationsCapped?<p className="text-xs text-muted-foreground">Only the first 100 permitted locations are available in this candidate.</p>:null}
   <label className="block text-sm">Request note<Textarea disabled={locked} value={note} maxLength={500} onChange={e=>setNote(e.target.value)}/></label>
   <form className="flex gap-2" onSubmit={e=>{e.preventDefault();setVariant("");onSearch(search.trim());}}><Input aria-label="Search products" value={search} maxLength={100} disabled={locked} onChange={e=>setSearch(e.target.value)} placeholder="Product name or SKU"/><Button variant="outline" type="submit" disabled={locked||busy}>Search</Button></form>
   {options.variantsCapped?<p className="text-xs text-muted-foreground">Showing the first 100 matching variants. Search to narrow the list.</p>:null}
   <div className="flex flex-wrap gap-2"><select aria-label="Product variant" className="h-10 min-w-48 flex-1 rounded-md border bg-background px-2" disabled={locked||busy} value={variant} onChange={e=>setVariant(e.target.value)}><option value="">Select product</option>{options.variants.map(v=><option key={v.id} value={v.id}>{v.productName} · {v.name} ({v.unit})</option>)}</select><Input aria-label="Quantity" className="w-28" inputMode="decimal" value={quantity} disabled={locked} onChange={e=>setQuantity(e.target.value)} placeholder="Qty"/><Button variant="outline" disabled={locked||busy} onClick={add}>Add item</Button></div>
   {lines.map(l=><div className="flex items-center gap-2 rounded-md border p-2 text-sm" key={l.variantId}><span className="flex-1">{l.label}</span><span className="tabular-nums">{l.quantity}</span><Button size="sm" variant="ghost" disabled={locked} onClick={()=>setLines(old=>old.filter(x=>x.variantId!==l.variantId))}>Remove</Button></div>)}
   {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}{notice?<p role="status" className="text-sm">{notice}</p>:null}
   <Button disabled={saving||busy||(!uncertain&&(!destination||!lines.length))} onClick={()=>void submit()}>{saving?"Submitting…":uncertain?"Retry same requisition":"Submit requisition"}</Button>
  </div>
 </details>;
}

export function TransferActions({row,options,onReload}:{row:InternalTransferRow;options:TransferOptions;onReload:()=>Promise<void>}){
 const [action,setAction]=useState<TransferAction|null>(null),[source,setSource]=useState(""),[note,setNote]=useState(""),[reference,setReference]=useState(""),[error,setError]=useState(""),[saving,setSaving]=useState(false);
 const inFlight=useRef(false);
 const actions=availableTransferActions(row,options);
 const valid=!!action&&(action!=="authorize"||!!source)&&(action!=="reject"&&action!=="cancel"||!!note.trim())&&(action!=="dispatch"||!!reference.trim());
 function open(a:TransferAction){setAction(a);setSource("");setNote("");setReference("");setError("");}
 async function confirm(){
  if(!action||!valid||inFlight.current||!actions.includes(action))return;
  inFlight.current=true;setSaving(true);setError("");
  const body=action==="authorize"?{action,version:1,sourceId:source,note}:action==="reject"?{action,version:1,note}:action==="reserve"?{version:2}:action==="cancel"?{version:3,note}:{version:3,handoverReference:reference};
  try{await apiOps.actOnInternalTransfer(row.id,action,body);setAction(null);await onReload();}
  catch(e){setError(message(e)+" Refresh the transfer before attempting another action.");}
  finally{inFlight.current=false;setSaving(false);}
 }
 if(!actions.length&&!action)return null;
 return <><div className="flex flex-wrap gap-2">{actions.map(a=><Button key={a} size="sm" variant={a==="reject"||a==="cancel"?"outline":"default"} onClick={()=>open(a)}>{titles[a]}</Button>)}</div>
 <Dialog open={action!==null} onOpenChange={v=>{if(!v&&!saving)setAction(null);}}>
  <DialogContent><DialogHeader><DialogTitle>{action?titles[action]:"Transfer action"}</DialogTitle><DialogDescription>{action?descriptions[action]:""}</DialogDescription></DialogHeader>
   {action==="authorize"?<label className="text-sm">Supplying branch<select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={source} disabled={saving} onChange={e=>setSource(e.target.value)}><option value="">Choose branch</option>{options.locations.filter(l=>l.id!==row.destinationId).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>:null}
   {action==="authorize"||action==="reject"||action==="cancel"?<label className="text-sm">Decision note<Textarea value={note} maxLength={500} disabled={saving} onChange={e=>setNote(e.target.value)}/></label>:null}
   {action==="dispatch"?<label className="text-sm">Physical handover reference<Input value={reference} maxLength={128} disabled={saving} onChange={e=>setReference(e.target.value)}/></label>:null}
   {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
   <DialogFooter><Button variant="outline" disabled={saving} onClick={()=>setAction(null)}>Cancel</Button><Button disabled={!valid||saving||!!error||!action||!actions.includes(action)} onClick={()=>void confirm()}>{saving?"Confirming…":"Confirm"}</Button></DialogFooter>
  </DialogContent>
 </Dialog></>;
}
