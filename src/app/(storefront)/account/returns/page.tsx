"use client";

import {Suspense,useCallback,useEffect,useRef,useState} from "react";
import {useSearchParams} from "next/navigation";
import Link from "next/link";
import {RotateCcw,ShieldCheck} from "lucide-react";
import {apiOps,ApiError} from "@/services/client";
import {customerReturnClaimRequestSchema} from "@/services/contracts";
import type {
  CustomerReturnClaimRequest,CustomerReturnClaimsList,
  CustomerReturnClaimEligibility,AccountOrderRow,
} from "@/services/contracts";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";

const errorMessage=(err:unknown)=>err instanceof ApiError?
  err.message:"The return request could not be verified. No request has been created.";
function useReplay(){
  const saved=useRef<{body:string;key:string}|null>(null);
  return {
    key(value:unknown){
      const body=JSON.stringify(value);
      if(saved.current?.body!==body)saved.current={body,key:crypto.randomUUID()};
      return saved.current.key;
    },
    clear(){saved.current=null;},
  };
}

export default function CustomerReturnsPage(){
  return <Suspense fallback={<p role="status">Loading verified return requests…</p>}>
    <CustomerReturnsWorkspace/>
  </Suspense>;
}
function CustomerReturnsWorkspace(){
  const params=useSearchParams();
  const requestReplay=useReplay();
  const cancelReplay=useReplay();
  const [claims,setClaims]=useState<CustomerReturnClaimsList|null>(null);
  const [orders,setOrders]=useState<AccountOrderRow[]>([]);
  const [selectedOrder,setSelectedOrder]=useState("");
  const [eligibility,setEligibility]=useState<CustomerReturnClaimEligibility|null>(null);
  const [quantities,setQuantities]=useState<Record<string,string>>({});
  const [lineReasons,setLineReasons]=useState<Record<string,string>>({});
  const [reason,setReason]=useState("");
  const [evidence,setEvidence]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    const [r,o]=await Promise.all([
      apiOps.customerReturnClaims({perPage:50}),apiOps.accountOrders(),
    ]);
    setClaims(r);setOrders(o);
  },[]);
  useEffect(()=>{
    let active=true;
    void refresh().catch(err=>{if(active)setError(errorMessage(err));})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[refresh]);
  useEffect(()=>{
    if(!orders.length||selectedOrder)return;
    const requested=params.get("orderId")??"";
    if(requested&&orders.some(o=>o.id===requested&&["delivered","collected"].includes(o.fulfilmentStatus)))
      setSelectedOrder(requested);
  },[orders,params,selectedOrder]);
  useEffect(()=>{
    if(!selectedOrder||!claims?.enabled){setEligibility(null);return;}
    let active=true;
    void apiOps.customerReturnClaimEligibility(selectedOrder).then(result=>{
      if(active){setEligibility(result);setQuantities({});setLineReasons({});}
    }).catch(err=>{if(active){setEligibility(null);setError(errorMessage(err));}});
    return()=>{active=false;};
  },[claims?.enabled,selectedOrder]);
  async function submit(){
    if(!claims?.enabled||busy||!selectedOrder)return;
    const payload:CustomerReturnClaimRequest={
      orderId:selectedOrder,reason:reason.trim(),
      ...(evidence.trim()?{evidenceNote:evidence.trim()}:{}),
      lines:(eligibility?.lines??[]).map(line=>({
        orderLineId:line.orderLineId,quantity:quantities[line.orderLineId]??"0",
        reason:lineReasons[line.orderLineId]?.trim()??"",
      })).filter(line=>Number(line.quantity)>0),
    };
    const p=customerReturnClaimRequestSchema.safeParse(payload);
    if(!p.success){setError(p.error.issues.map(x=>x.message).join("; "));return;}
    setBusy(true);setError(null);setNotice(null);
    try{
      const created=await apiOps.customerReturnClaimCreate(p.data,requestReplay.key(p.data));
      requestReplay.clear();
      setReason("");setEvidence("");setSelectedOrder("");setEligibility(null);
      setNotice(`Request ${created.reference} received for staff review. This is not a refund approval or evidence that goods were physically returned.`);
      await refresh();
    }catch(err){setError(errorMessage(err));}
    finally{setBusy(false);}
  }
  async function cancel(id:string){
    if(busy)return;
    setBusy(true);setNotice(null);setError(null);
    try{
      await apiOps.customerReturnClaimCancel(id,cancelReplay.key({id}));
      cancelReplay.clear();setNotice("Pending request cancelled. No refund, payment or stock adjustment was made.");
      await refresh();
    }catch(err){setError(errorMessage(err));}
    finally{setBusy(false);}
  }
  const eligibleOrders=orders.filter(x=>["delivered","collected"].includes(x.fulfilmentStatus));
  return <div className="min-w-0 space-y-5 pb-10">
    <header className="space-y-2">
      <h1 className="flex items-center gap-2 font-serif text-2xl font-bold">
        <RotateCcw className="size-6"/> Returns and requests
      </h1>
      <p className="text-sm text-muted-foreground">
        Request a review of goods from a completed order. We verify the original
        quantity and previous returns. A request does not guarantee a refund or
        count as a physical stock return.
      </p>
    </header>
    {error?<p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>:null}
    {notice?<p role="status" className="rounded-lg border bg-card p-3 text-sm">{notice}</p>:null}
    {loading?<p role="status" className="rounded-lg border p-4 text-sm">Checking your return request history…</p>:null}
    {claims&&!claims.enabled?<section className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5"/> Verified return requests are not open yet</h2>
      <p className="text-sm text-muted-foreground">
        Our customer return authority has not been activated for this store.
        No return request, stock receipt or refund will be recorded through
        this page while it is disabled. For order assistance, use the help page.
      </p>
      <Link href="/help" className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline">Contact support</Link>
    </section>:null}
    {claims?.enabled?<section aria-label="Submit verified return claim" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="font-semibold">Request a review</h2>
      <div><Label htmlFor="return-source-order">Completed order</Label>
        <select id="return-source-order" className="mt-1 h-11 w-full rounded-md border bg-background px-2 text-sm"
          value={selectedOrder} disabled={busy} onChange={e=>{setSelectedOrder(e.target.value);setEligibility(null);}}>
          <option value="">Choose a delivered or collected order</option>
          {eligibleOrders.map(order=><option key={order.id} value={order.id}>{order.reference} · {order.totalLabel}</option>)}
        </select>
      </div>
      {selectedOrder&&!eligibility?<p role="status" className="text-sm text-muted-foreground">
        Checking actual stock handover and remaining quantities…
      </p>:null}
      {eligibility?.lines.map(line=><div className="space-y-2 rounded-lg border p-3" key={line.orderLineId}>
        <div className="flex flex-wrap items-center justify-between gap-1 text-sm">
          <p className="font-medium">{line.productName} ({line.variantName})</p>
          <span className="text-muted-foreground">
            Remaining: {line.availableQuantity} {line.unit}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor={`qty-${line.orderLineId}`}>Quantity to review</Label>
            <Input id={`qty-${line.orderLineId}`} type="number" min="0" step={["kg","litre"].includes(line.unit)?"0.001":"1"}
              max={line.availableQuantity} disabled={busy||Number(line.availableQuantity)<=0}
              value={quantities[line.orderLineId]??"0"}
              onChange={e=>setQuantities(prev=>({...prev,[line.orderLineId]:e.target.value}))}/>
          </div>
          <div><Label htmlFor={`reason-${line.orderLineId}`}>Item-specific reason</Label>
            <Input id={`reason-${line.orderLineId}`} maxLength={400} disabled={busy}
              placeholder="What happened to this item?" value={lineReasons[line.orderLineId]??""}
              onChange={e=>setLineReasons(prev=>({...prev,[line.orderLineId]:e.target.value}))}/>
          </div>
        </div>
      </div>)}
      <div><Label htmlFor="customer-return-reason">Overall reason (10–600 characters)</Label>
        <Textarea id="customer-return-reason" rows={3} disabled={busy}
          maxLength={600} value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="Describe the issue with your order and what review you are requesting."/>
      </div>
      <div><Label htmlFor="customer-return-evidence">Additional evidence (optional, text only)</Label>
        <Textarea id="customer-return-evidence" rows={2} disabled={busy}
          maxLength={1500} value={evidence} onChange={e=>setEvidence(e.target.value)}
          placeholder="Add the pack/batch details or other factual information."/>
      </div>
      <p className="text-xs text-muted-foreground">
        This is a review request only. A staff decision does not mean money
        has been refunded. Refunds require separately verified captured payment
        and approval; goods are only physically received by staff.
      </p>
      <Button type="button" disabled={busy||!eligibility||!eligibleOrders.length}
        onClick={()=>void submit()}>{busy?"Submitting…":"Submit verified request"}</Button>
    </section>:null}
    {claims?<section aria-label="Your verified return requests" className="space-y-3">
      <h2 className="font-semibold">Your return history</h2>
      {claims.items.length===0?<p className="rounded-lg border p-4 text-sm text-muted-foreground">
        No verified return requests have been recorded on your account.
      </p>:claims.items.map(claim=><article key={claim.id} className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap justify-between gap-2">
          <div><p className="font-semibold">{claim.reference}</p>
            <p className="text-xs text-muted-foreground">
              {claim.orderReference} · {new Date(claim.createdAt).toLocaleDateString("en-GH")}
            </p>
          </div>
          <span className="rounded-md border px-2 py-1 text-xs font-medium">{claim.status}</span>
        </div>
        <p className="mt-2 text-sm">{claim.reason}</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {claim.lines.map(line=><li key={line.orderLineId}>
            {line.quantity} {line.unit} · {line.productName} — {line.reason}
          </li>)}
        </ul>
        {claim.reviewNote?<p className="mt-2 rounded-md bg-muted p-2 text-sm">
          Staff response: {claim.reviewNote}
        </p>:null}
        {claim.status==="requested"&&claims.enabled?<Button type="button" variant="outline"
          className="mt-3" size="sm" disabled={busy}
          onClick={()=>void cancel(claim.id)}>Cancel pending request</Button>:null}
      </article>)}
    </section>:null}
  </div>;
}
