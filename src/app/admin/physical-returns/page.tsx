"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ClipboardCheck, PackageOpen, ShieldCheck, RefreshCw } from "lucide-react";
import { apiOps, ApiError } from "@/services/client";
import type { PublicOrder, PhysicalReturnInspect, PhysicalReturnList,
  PhysicalReturnReceive, PhysicalReturnView,PhysicalReturnQuarantineRequest,
  PhysicalReturnResalePropose,PhysicalReturnResaleDecision } from "@/services/contracts";
import { physicalReturnReceiveSchema, physicalReturnInspectSchema,
  physicalReturnQuarantineRequestSchema,
  physicalReturnResaleProposeSchema,physicalReturnResaleDecisionSchema } from "@/services/contracts";
import { useStaff } from "@/features/staff/role-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const friendly=(e:unknown)=>e instanceof ApiError?e.message:"The request could not be verified. No receipt has been assumed.";
type DraftLine={selected:boolean;quantity:string;condition:"sealed"|"opened"|"damaged"|"unknown"};
type InspectionLine={disposition:"quarantine"|"destroy";note:string};
const defaultLine=():DraftLine=>({selected:false,quantity:"1",condition:"unknown"});
const defaultInspection=():InspectionLine=>({disposition:"quarantine",note:""});
function useReplayIntent(){
  const ref=useRef<{hash:string;key:string}|null>(null);
  return {
    key(payload:unknown){
      const hash=JSON.stringify(payload);
      if(ref.current?.hash!==hash)ref.current={hash,key:crypto.randomUUID()};
      return ref.current.key;
    },
    clear(){ref.current=null;},
  };
}
export default function PhysicalReturnsPage(){
  return <Suspense fallback={<p role="status" className="rounded-lg border p-4 text-sm">Loading physical returns…</p>}>
    <PhysicalReturnsWorkspace />
  </Suspense>;
}
function PhysicalReturnsWorkspace(){
  const params=useSearchParams();
  const {can}=useStaff();
  const isAdmin=can("returns.decide");
  const [orderId,setOrderId]=useState(params.get("orderId")??"");
  const [customerClaimId,setCustomerClaimId]=useState(params.get("customerClaimId")??"");
  const [order,setOrder]=useState<PublicOrder|null>(null);
  const [orderError,setOrderError]=useState<string|null>(null);
  const [orderLoading,setOrderLoading]=useState(false);
  const [lines,setLines]=useState<Record<string,DraftLine>>({});
  const [reason,setReason]=useState("");
  const [evidence,setEvidence]=useState("");
  const [physicallyPresent,setPhysicallyPresent]=useState(false);
  const [list,setList]=useState<PhysicalReturnList|null>(null);
  const [busy,setBusy]=useState(false);
  const [listLoading,setListLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [target,setTarget]=useState<PhysicalReturnView|null>(null);
  const [inspection,setInspection]=useState<Record<string,InspectionLine>>({});
  const [summary,setSummary]=useState("");
  const [custodyItem,setCustodyItem]=useState<PhysicalReturnView["lines"][number]|null>(null);
  const [custodyNote,setCustodyNote]=useState("");
  const [custodyAcknowledged,setCustodyAcknowledged]=useState(false);
  const [resaleItem,setResaleItem]=useState<PhysicalReturnView["lines"][number]|null>(null);
  const [resaleMode,setResaleMode]=useState<"propose"|"decide">("propose");
  const [resaleEvidence,setResaleEvidence]=useState("");
  const [resaleDecision,setResaleDecision]=useState<"approve"|"reject">("reject");
  const [resaleConfirmed,setResaleConfirmed]=useState(false);


  const receiveReplay=useReplayIntent();
  const inspectReplay=useReplayIntent();
  const custodyReplay=useReplayIntent();
  const resaleReplay=useReplayIntent();
  const enabled=list?.enabled===true;
  const canMutate=isAdmin&&enabled;
  const canReceiveForClaim=!customerClaimId.trim()||list?.claimLinkEnabled===true;
  const canRecordCustody=canMutate&&list?.custodyEnabled===true;
  const canReviewResale=canMutate&&list?.resaleEnabled===true;

  const refresh=useCallback(async()=>{
    try {
      const response=await apiOps.physicalReturns({perPage:50});
      setList(response);setError(null);
    }catch(e){setError(friendly(e));}
    finally{setListLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const lookupOrder=useCallback(async(id:string)=>{
    if(!id.trim())return;
    setOrderLoading(true);setOrderError(null);setOrder(null);setLines({});
    try{
      const result=await apiOps.order(id.trim());
      setOrder(result.order);
      setLines(Object.fromEntries(result.order.lines.map(line=>[line.id,defaultLine()])));
    }catch(e){setOrderError(friendly(e));}
    finally{setOrderLoading(false);}
  },[]);
  useEffect(()=>{
    const id=params.get("orderId");
    if(id)void lookupOrder(id);
  },[params,lookupOrder]);

  async function receive(){
    if(!order||busy||!canMutate||!physicallyPresent||!canReceiveForClaim)return;
    const payload:PhysicalReturnReceive={
      orderId:order.id,
      ...(customerClaimId.trim()?{customerClaimId:customerClaimId.trim()}:{}),
      reason:reason.trim(),evidenceNote:evidence.trim(),
      lines:order.lines.filter(l=>lines[l.id]?.selected).map(l=>({
        orderLineId:l.id,quantity:lines[l.id].quantity.trim(),condition:lines[l.id].condition,
      })),
    };
    const parsed=physicalReturnReceiveSchema.safeParse(payload);
    if(!parsed.success){
      setError(parsed.error.issues.map(i=>i.message).join("; "));return;
    }
    setBusy(true);setError(null);setNotice(null);
    try{
      const receipt=await apiOps.physicalReturnReceive(parsed.data,receiveReplay.key(parsed.data));
      receiveReplay.clear();setReason("");setEvidence("");setPhysicallyPresent(false);
      setCustomerClaimId("");
      setOrder(null);setLines({});
      setNotice(`Physical receipt ${receipt.reference} recorded. All goods remain off-sale pending inspection; no refund or stock addition was made.`);
      await refresh();
    }catch(e){setError(friendly(e));}
    finally{setBusy(false);}
  }
  function startInspection(r:PhysicalReturnView){
    setTarget(r);setSummary("");
    setInspection(Object.fromEntries(r.lines.map(l=>[l.id,defaultInspection()])));
    setError(null);setNotice(null);
  }
  async function inspect(){
    if(!target||busy||!canMutate)return;
    const payload:PhysicalReturnInspect={
      summary:summary.trim(),lines:target.lines.map(l=>({
        itemId:l.id,disposition:inspection[l.id]?.disposition??"quarantine",
        note:inspection[l.id]?.note.trim()??"",
      })),
    };
    const parsed=physicalReturnInspectSchema.safeParse(payload);
    if(!parsed.success){
      setError(parsed.error.issues.map(i=>i.message).join("; "));return;
    }
    setBusy(true);setError(null);setNotice(null);
    try{
      const receipt=await apiOps.physicalReturnInspect(target.id,parsed.data,
        inspectReplay.key({returnId:target.id,...parsed.data}));
      inspectReplay.clear();setTarget(null);
      setNotice(`Inspection for ${receipt.reference} saved. Quarantined and destroyed goods are not saleable stock. No refund was issued.`);
      await refresh();
    }catch(e){setError(friendly(e));}
    finally{setBusy(false);}
  }
  function startCustody(item:PhysicalReturnView["lines"][number]){
    if(!canRecordCustody||busy||item.disposition!=="quarantine"||item.custody)return;
    setCustodyItem(item);setCustodyNote("");setCustodyAcknowledged(false);
    setNotice(null);setError(null);
  }
  async function recordCustody(){
    if(!custodyItem||!custodyAcknowledged||!canRecordCustody||busy)return;
    const payload:PhysicalReturnQuarantineRequest={custodyNote:custodyNote.trim()};
    const parsed=physicalReturnQuarantineRequestSchema.safeParse(payload);
    if(!parsed.success){
      setError(parsed.error.issues.map(x=>x.message).join("; "));return;
    }
    setBusy(true);setError(null);setNotice(null);
    try{
      const evidence=await apiOps.physicalReturnQuarantine(custodyItem.id,parsed.data,
        custodyReplay.key({itemId:custodyItem.id,...parsed.data}));
      custodyReplay.clear();setCustodyItem(null);setCustodyNote("");setCustodyAcknowledged(false);
      setNotice(`Custody confirmed: ${evidence.quantity} units recorded in quarantined lot ${evidence.quarantineLotNumber}. These goods are NOT available to sell; no refund or stock release was made.`);
      await refresh();
    }catch(e){setError(friendly(e));}
    finally{setBusy(false);}
  }
  function openResale(item:PhysicalReturnView["lines"][number],mode:"propose"|"decide"){
    if(!canReviewResale||busy)return;
    setResaleItem(item);setResaleMode(mode);setResaleEvidence("");
    setResaleDecision("reject");setResaleConfirmed(false);
    setError(null);setNotice(null);
  }
  async function submitResale(){
    if(!resaleItem||busy||!canReviewResale||!resaleConfirmed)return;
    setError(null);setNotice(null);
    if(resaleMode==="propose"){
      const payload:PhysicalReturnResalePropose={
        safetyClassification:"non_food_factory_sealed",
        factorySealIntact:true,tamperAndContaminationAbsent:true,
        sourceTraceabilityVerified:true,expiryAndStorageVerified:true,
        evidenceNote:resaleEvidence.trim(),
      };
      const parsed=physicalReturnResaleProposeSchema.safeParse(payload);
      if(!parsed.success){setError(parsed.error.issues.map(x=>x.message).join("; "));return;}
      setBusy(true);
      try{
        await apiOps.physicalReturnResalePropose(resaleItem.id,parsed.data,
          resaleReplay.key({itemId:resaleItem.id,mode:"propose",...parsed.data}));
        resaleReplay.clear();setResaleItem(null);setResaleConfirmed(false);
        setNotice("Safety review proposed. The goods remain quarantined and are NOT saleable until a different administrator explicitly approves.");
        await refresh();
      }catch(e){setError(friendly(e));}
      finally{setBusy(false);}
    }else{
      const payload:PhysicalReturnResaleDecision={
        decision:resaleDecision,decisionNote:resaleEvidence.trim(),
      };
      const parsed=physicalReturnResaleDecisionSchema.safeParse(payload);
      if(!parsed.success){setError(parsed.error.issues.map(x=>x.message).join("; "));return;}
      setBusy(true);
      try{
        await apiOps.physicalReturnResaleDecision(resaleItem.id,parsed.data,
          resaleReplay.key({itemId:resaleItem.id,mode:"decide",...parsed.data}));
        resaleReplay.clear();setResaleItem(null);setResaleConfirmed(false);
        setNotice(resaleDecision==="approve"?
          "Independent approval recorded. The entire inspected non-food quantity was transferred from quarantine to a new saleable lot. No customer refund was issued.":
          "Independent review rejected. The goods remain in quarantine, not available to sell; no refund was issued.");
        await refresh();
      }catch(e){setError(friendly(e));}
      finally{setBusy(false);}
    }
  }
  return <div className="min-w-0 space-y-5 pb-12">
    <Link href="/admin/return-claims" className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-medium text-primary hover:bg-muted">
      Verified customer return requests
    </Link>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/admin/returns" className="underline-offset-2 hover:underline">Returns</Link> / Physical receipts
        </nav>
        <h1 className="mt-2 flex items-center gap-2 font-serif text-2xl font-bold">
          <PackageOpen className="size-6" aria-hidden/> Physical returns
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Verify returned goods against the original stock-depleted order and record a final condition inspection.
          This workflow never creates refunds, increases saleable stock, or settles cash on delivery.
        </p>
      </div>
      <Button variant="outline" onClick={()=>void refresh()} disabled={busy||listLoading}>
        <RefreshCw className="size-4" aria-hidden/> Refresh
      </Button>
    </header>
    {listLoading?<p role="status" className="rounded-lg border p-4 text-sm">Checking physical returns authority…</p>:null}
    {!enabled?<div className="rounded-xl border border-amber-500/40 p-4 text-sm" role="status">
      <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" aria-hidden/>
        Physical returns intake is not activated</p>
      <p className="mt-2 text-muted-foreground">
        The server controls activation. No goods may be marked received, inspected, restocked or refunded from this workspace
        until the rollout has been approved. Historical receipts remain readable by administrators.
      </p>
    </div>:null}
    {enabled&&list?.custodyEnabled&&!list?.resaleEnabled?
      <p className="rounded-lg border p-3 text-sm text-muted-foreground" role="status">
        Independent non-food resale review is not activated. No quarantined return can be released to the shop.
      </p>:null}
    {enabled&&!list?.custodyEnabled?<p className="rounded-lg border p-3 text-sm text-muted-foreground" role="status">
      Quarantine stock custody is not activated. Inspected goods cannot be added to inventory until this separate server authority is approved.
    </p>:null}
    {error?<p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>:null}
    {notice?<p className="rounded-lg border bg-muted/40 p-3 text-sm" role="status">{notice}</p>:null}

    <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="return-intake-heading">
      <h2 id="return-intake-heading" className="font-semibold">Record physically received goods</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        An administrator must have the actual goods. The order must already be delivered or collected,
        with documented stock handover; the original inventory location is derived by the server.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1"><Label htmlFor="physical-source-order">Original order ID</Label>
          <Input id="physical-source-order" className="mt-1" value={orderId}
            disabled={busy||!canMutate} onChange={e=>setOrderId(e.target.value)}
            placeholder="Paste order ID from the order detail"/></div>
        <Button variant="outline" disabled={!canMutate||orderLoading||!orderId.trim()}
          onClick={()=>void lookupOrder(orderId)}>{orderLoading?"Checking…":"Load order"}</Button>
      </div>
      {orderError?<p role="alert" className="mt-3 text-sm text-destructive">{orderError}</p>:null}
      {customerClaimId.trim()&&!list?.claimLinkEnabled?<p role="status"
        className="mt-3 rounded-md border border-amber-400/50 p-3 text-sm">
        Linking customer requests is disabled by the server. This accepted request cannot
        be recorded against a physical receipt until that authority is approved.
      </p>:null}
      {list?.claimLinkEnabled?<div className="mt-3">
        <Label htmlFor="physical-customer-claim">Accepted customer return request ID (optional)</Label>
        <Input id="physical-customer-claim" className="mt-1" value={customerClaimId}
          disabled={!canMutate||busy} onChange={e=>setCustomerClaimId(e.target.value)}
          placeholder="Paste the accepted return request ID"/>
        <p className="mt-1 text-xs text-muted-foreground">
          Use the exact accepted request from the admin queue. The server checks order ownership,
          item identities and cumulative quantities. No refund is created.
        </p>
      </div>:null}
      {order?<div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
          <div><p className="font-semibold">{order.reference}</p>
            <p className="text-muted-foreground">Fulfilment: {order.fulfilmentStatus} · Stock handover: {order.stockConsumedAt?"recorded":"not recorded"}</p></div>
          <Link href={`/admin/orders/${order.id}`} className="text-primary underline">View order</Link>
        </div>
        <fieldset className="space-y-2">
          <legend className="font-medium">Items physically handed back</legend>
          {order.lines.map(l=><div key={l.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,.7fr)_minmax(0,1fr)] sm:items-center">
            <Checkbox checked={lines[l.id]?.selected??false} disabled={!canMutate||busy}
              aria-label={`Include ${l.productName}`}
              onCheckedChange={v=>setLines(p=>({...p,[l.id]:{...(p[l.id]??defaultLine()),selected:v===true}}))}/>
            <div className="text-sm"><p className="font-medium">{l.productName} · {l.variantName}</p>
              <p className="text-xs text-muted-foreground">Originally {l.quantity} {l.unit}</p></div>
            <div><Label htmlFor={`physical-qty-${l.id}`}>Returned quantity</Label>
              <Input id={`physical-qty-${l.id}`} type="text" inputMode="decimal"
                disabled={!canMutate||busy||!lines[l.id]?.selected}
                value={lines[l.id]?.quantity??"1"} onChange={e=>setLines(p=>({...p,[l.id]:{...(p[l.id]??defaultLine()),quantity:e.target.value}}))}/></div>
            <div><Label htmlFor={`physical-condition-${l.id}`}>As received</Label>
              <select id={`physical-condition-${l.id}`} className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                disabled={!canMutate||busy||!lines[l.id]?.selected}
                value={lines[l.id]?.condition??"unknown"}
                onChange={e=>setLines(p=>({...p,[l.id]:{...(p[l.id]??defaultLine()),condition:e.target.value as DraftLine["condition"]}}))}>
                <option value="unknown">Not verified</option><option value="sealed">Sealed</option>
                <option value="opened">Opened</option><option value="damaged">Damaged</option>
              </select></div>
          </div>)}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="physical-reason">Return reason</Label>
            <Textarea id="physical-reason" className="mt-1" rows={3} value={reason} maxLength={400}
              disabled={!canMutate||busy} onChange={e=>setReason(e.target.value)}
              placeholder="Reason given and verified by receiving staff"/></div>
          <div><Label htmlFor="physical-evidence">Physical receipt evidence (required)</Label>
            <Textarea id="physical-evidence" className="mt-1" rows={3} value={evidence} maxLength={1000}
              disabled={!canMutate||busy} onChange={e=>setEvidence(e.target.value)}
              placeholder="Condition, packaging, counting and handover details"/></div>
        </div>
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <Checkbox checked={physicallyPresent} disabled={!canMutate||busy} onCheckedChange={v=>setPhysicallyPresent(v===true)}/>
          <span>I confirm the goods are physically present and the quantities have been checked. This does not approve resale or refund.</span>
        </label>
        <Button disabled={!canMutate||busy||!canReceiveForClaim||!physicallyPresent||!order.lines.some(l=>lines[l.id]?.selected)}
          onClick={()=>void receive()}>{busy?"Recording…":"Record received goods"}</Button>
      </div>:null}
    </section>

    <section className="min-w-0 space-y-3" aria-labelledby="physical-receipt-list">
      <h2 id="physical-receipt-list" className="font-semibold">Recorded physical receipts</h2>
      {!list?.items.length?<p className="rounded-lg border p-4 text-sm text-muted-foreground">
        No verified physical receipts have been recorded in this environment.
      </p>:list.items.map(r=><article key={r.id} className="min-w-0 space-y-2 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="font-semibold">{r.reference}</p>
            <p className="text-sm text-muted-foreground">Order {r.orderReference} · {r.locationId} · {r.status}</p>
            {r.customerClaimId?<p className="text-xs text-muted-foreground break-all">
              Linked request: {r.customerClaimId} · physically received only, no refund</p>:null}
            <p className="text-xs text-muted-foreground">Received {new Date(r.receivedAt).toLocaleString("en-GH")}</p></div>
          {r.status==="received"&&canMutate?
            <Button size="sm" onClick={()=>startInspection(r)} disabled={busy}>
              <ClipboardCheck className="size-4" aria-hidden/> Inspect items
            </Button>:
            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
              <ShieldCheck className="size-3" aria-hidden/>{r.status==="inspected"?"Inspected":"Awaiting inspection"}
            </span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-1">Item</th>
              <th className="py-1">Quantity</th><th className="py-1">Condition</th><th className="py-1">Disposition / custody</th></tr></thead>
            <tbody>{r.lines.map(l=><tr key={l.id} className="border-b last:border-0">
              <td className="py-2">{l.productName} · {l.variantName}</td>
              <td className="py-2">{l.quantity} {l.unit}</td>
              <td className="py-2">{l.condition}</td>
              <td className="py-2">
                <span className="block">{l.disposition.replaceAll("_"," ")}</span>
                {l.custody?<span className="mt-1 block break-all text-xs text-muted-foreground">
                  Off-sale quarantine lot: {l.custody.quarantineLotNumber} · original lot {l.custody.sourceLotNumber}
                </span>:r.status==="inspected"&&l.disposition==="quarantine"&&canRecordCustody?
                  <Button type="button" variant="outline" size="sm" className="mt-2 min-h-9 whitespace-normal text-left"
                    disabled={busy} onClick={()=>startCustody(l)}>Record quarantine custody</Button>:null}
                {l.resaleReview?<span className="mt-1 block text-xs font-medium">
                  Resale review: {l.resaleReview.status.replaceAll("_"," ")}
                  {l.resaleReview.status==="pending"&&canReviewResale?
                    <Button type="button" variant="outline" size="sm" className="mt-2 min-h-9 whitespace-normal"
                      disabled={busy} onClick={()=>openResale(l,"decide")}>
                      Independent decision
                    </Button>:null}
                  {l.resaleReview.status==="approved"?
                    <span className="block break-all text-xs text-muted-foreground">
                      Released lot: {l.resaleReview.saleableLotId}
                    </span>:null}
                </span>:l.custody&&l.resaleEligible&&canReviewResale?
                  <Button type="button" size="sm" variant="outline" className="mt-2 min-h-9 whitespace-normal"
                    disabled={busy} onClick={()=>openResale(l,"propose")}>
                    Request non-food resale review
                  </Button>:null}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        {r.inspectionSummary?<p className="text-xs text-muted-foreground">Inspection: {r.inspectionSummary}</p>:null}
      </article>)}
    </section>
    {resaleItem?<section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
      aria-label="Independent returned-goods resale review">
      <h2 className="font-semibold">{resaleMode==="propose"?"Propose non-food resale release":"Independent resale decision"}</h2>
      <p className="text-sm text-muted-foreground">
        {resaleItem.productName} · {resaleItem.quantity} {resaleItem.unit}.
        Only verified factory-sealed, uncontaminated, traceable non-food goods with
        an original recorded expiry at least 30 days ahead can qualify.
        Food, opened goods and perishable groceries must remain unavailable for resale.
      </p>
      {resaleMode==="decide"?
        <div><Label htmlFor="physical-resale-decision">Reviewer decision</Label>
          <select id="physical-resale-decision" className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
            value={resaleDecision} disabled={!canReviewResale||busy}
            onChange={e=>setResaleDecision(e.target.value as "approve"|"reject")}>
            <option value="reject">Reject — keep in quarantine</option>
            <option value="approve">Approve — transfer complete quantity to saleable lot</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            The proposer, physical receiver, inspector and custodian cannot approve their own goods.
            The server will independently recheck all eligibility and expiry conditions.
          </p>
        </div>:null}
      <div><Label htmlFor="physical-resale-evidence">
        {resaleMode==="propose"?"Verified safety and traceability evidence (30–1500 characters)":
          "Independent decision evidence (20–1000 characters)"}
        </Label>
        <Textarea id="physical-resale-evidence" className="mt-1" rows={4}
          maxLength={resaleMode==="propose"?1500:1000}
          value={resaleEvidence} disabled={!canReviewResale||busy}
          onChange={e=>setResaleEvidence(e.target.value)}
          placeholder="Specify sealed pack verification, original lot/expiry, contamination check and storage condition."/>
      </div>
      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <Checkbox checked={resaleConfirmed} disabled={!canReviewResale||busy}
          onCheckedChange={v=>setResaleConfirmed(v===true)}/>
        <span>{resaleMode==="propose"?
          "I physically verified an intact factory seal, no tampering/contamination, source lot traceability and sufficient verified shelf life. I confirm this is a non-food product.":
          "I am an independent administrator, different from the proposer, receiver, inspector and custodian. I have personally rechecked the evidence and understand that approval immediately makes the verified non-food quantity saleable."}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!canReviewResale||busy||!resaleConfirmed||resaleEvidence.trim().length<(resaleMode==="propose"?30:20)}
          onClick={()=>void submitResale()}>
          {busy?"Recording…":resaleMode==="propose"?"Submit for independent review":
            resaleDecision==="approve"?"Approve and transfer to saleable lot":"Reject resale release"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={()=>setResaleItem(null)}>Cancel</Button>
      </div>
    </section>:null}
    {custodyItem?<section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
      aria-label="Confirm non-saleable quarantine stock custody">
      <h2 className="font-semibold">Record off-sale quarantine custody</h2>
      <p className="text-sm text-muted-foreground">
        {custodyItem.productName} · {custodyItem.quantity} {custodyItem.unit}. This records
        inspected goods in a new quarantined lot linked to the original stock handover.
        It does not restock saleable inventory, approve a refund, or mark cash collected.
      </p>
      <div><Label htmlFor="return-custody-note">Physical storage evidence (15–1000 characters)</Label>
        <Textarea id="return-custody-note" className="mt-1" rows={3} maxLength={1000}
          disabled={!canRecordCustody||busy} value={custodyNote}
          onChange={e=>setCustodyNote(e.target.value)}
          placeholder="Describe the sealed quarantine shelf/location, counted quantity and custody handover."/>
      </div>
      <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
        <Checkbox checked={custodyAcknowledged} disabled={!canRecordCustody||busy}
          onCheckedChange={v=>setCustodyAcknowledged(v===true)}/>
        <span>I have physically secured the inspected goods in a separate quarantine area.
          They must not be selected for customer orders or resold.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!canRecordCustody||busy||!custodyAcknowledged||custodyNote.trim().length<15}
          onClick={()=>void recordCustody()}>{busy?"Recording…":"Confirm off-sale custody"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={()=>setCustodyItem(null)}>Cancel</Button>
      </div>
    </section>:null}
    {target?<section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5" aria-label="Final return inspection">
      <div><h2 className="font-semibold">Final inspection · {target.reference}</h2>
        <p className="text-xs text-muted-foreground">
          Inspect every physically received line. Only quarantine and controlled destruction are available in this first authority.
          Saleable restocking and refunds require separate future approval.
        </p></div>
      {target.lines.map(l=><div key={l.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_2fr] sm:items-end">
        <p className="text-sm font-medium">{l.productName}<span className="block text-xs font-normal text-muted-foreground">{l.quantity} {l.unit}</span></p>
        <div><Label htmlFor={`disposition-${l.id}`}>Disposition</Label>
          <select id={`disposition-${l.id}`} className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
            value={inspection[l.id]?.disposition??"quarantine"} disabled={busy}
            onChange={e=>setInspection(p=>({...p,[l.id]:{...(p[l.id]??defaultInspection()),disposition:e.target.value as InspectionLine["disposition"]}}))}>
            <option value="quarantine">Keep quarantined</option><option value="destroy">Controlled destruction</option>
          </select></div>
        <div><Label htmlFor={`disposition-note-${l.id}`}>Inspection evidence</Label>
          <Textarea id={`disposition-note-${l.id}`} className="mt-1" rows={2} maxLength={1000}
            value={inspection[l.id]?.note??""} disabled={busy}
            onChange={e=>setInspection(p=>({...p,[l.id]:{...(p[l.id]??defaultInspection()),note:e.target.value}}))}/></div>
      </div>)}
      <div><Label htmlFor="physical-inspection-summary">Inspection summary</Label>
        <Textarea id="physical-inspection-summary" className="mt-1" rows={2} maxLength={1000}
          value={summary} disabled={busy} onChange={e=>setSummary(e.target.value)}/></div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!canMutate||busy} onClick={()=>void inspect()}>
          {busy?"Recording…":"Confirm final inspection"}</Button>
        <Button variant="outline" disabled={busy} onClick={()=>setTarget(null)}>Cancel</Button>
      </div>
    </section>:null}
  </div>;
}
