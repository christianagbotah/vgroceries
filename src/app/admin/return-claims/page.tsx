"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {ClipboardCheck} from "lucide-react";
import {apiOps,ApiError} from "@/services/client";
import {customerReturnClaimDecisionSchema} from "@/services/contracts";
import type {CustomerReturnClaimView,CustomerReturnClaimsList,
  CustomerReturnClaimDecision} from "@/services/contracts";
import {useStaff} from "@/features/staff/role-context";
import {Button} from "@/components/ui/button";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";

const friendly=(x:unknown)=>x instanceof ApiError?x.message:"Could not verify this request.";
export default function AdminCustomerReturnClaimsPage(){
  const {can}=useStaff();
  const isAdmin=can("returns.decide");
  const [list,setList]=useState<CustomerReturnClaimsList|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [selected,setSelected]=useState<CustomerReturnClaimView|null>(null);
  const [decision,setDecision]=useState<"accept"|"reject">("reject");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const intent=useRef<{hash:string;key:string}|null>(null);
  const refresh=useCallback(async()=>{
    try{setList(await apiOps.adminReturnClaims({perPage:50}));setError(null);}
    catch(e){setError(friendly(e));}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{if(isAdmin)void refresh();else setLoading(false);},[isAdmin,refresh]);
  function start(row:CustomerReturnClaimView){
    setSelected(row);setDecision("reject");setNote("");setNotice(null);setError(null);
  }
  async function decide(){
    if(!selected||!isAdmin||!list?.enabled||busy)return;
    const body:CustomerReturnClaimDecision={decision,reviewNote:note.trim()};
    const parsed=customerReturnClaimDecisionSchema.safeParse(body);
    if(!parsed.success){setError(parsed.error.issues.map(x=>x.message).join("; "));return;}
    const hash=JSON.stringify({id:selected.id,...parsed.data});
    if(intent.current?.hash!==hash)intent.current={hash,key:crypto.randomUUID()};
    setBusy(true);setError(null);
    try{
      const updated=await apiOps.adminReturnClaimDecision(selected.id,parsed.data,intent.current.key);
      intent.current=null;setSelected(null);setNote("");
      setNotice(updated.status==="accepted"?
        "Request accepted for staff handling. No physical receipt, refund, stock restoration or payment operation was created.":
        "Request rejected with a recorded customer-safe reason. No stock or money changed.");
      await refresh();
    }catch(e){setError(friendly(e));}
    finally{setBusy(false);}
  }
  return <div className="min-w-0 space-y-4 pb-10">
    <h1 className="flex items-center gap-2 font-serif text-2xl font-bold">
      <ClipboardCheck className="size-6"/> Customer return requests
    </h1>
    <p className="text-sm text-muted-foreground">
      Review authenticated customer claims against completed orders and original
      stock quantities. Acceptance is authorization to investigate and receive goods,
      not a refund or proof that any goods were returned.
    </p>
    <Link href="/admin/physical-returns" className="inline-flex min-h-10 items-center text-sm text-primary underline">
      Go to separate physical receipt and inspection
    </Link>
    {!isAdmin?<p className="rounded-md border p-3 text-sm" role="alert">Administrator approval is required.</p>:null}
    {loading?<p role="status">Loading verified claims…</p>:null}
    {error?<p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive" role="alert">{error}</p>:null}
    {notice?<p className="rounded-md border p-3 text-sm" role="status">{notice}</p>:null}
    {list&&!list.enabled?<p className="rounded-lg border p-4 text-sm text-muted-foreground" role="status">
      Authenticated return claims are not activated. No pending claim can be approved here.
    </p>:null}
    {list?.items.length===0?<p className="rounded-lg border p-4 text-sm text-muted-foreground">No verified return claims are recorded.</p>:null}
    {list?.items.map(claim=><article key={claim.id} className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div><h2 className="font-semibold">{claim.reference}</h2>
          <p className="text-xs text-muted-foreground">{claim.orderReference} · {new Date(claim.createdAt).toLocaleString("en-GH")}</p>
        </div>
        <span className="self-start rounded-md border px-2 py-1 text-xs font-medium">{claim.status}</span>
      </div>
      <p className="text-sm">{claim.reason}</p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {claim.lines.map(line=><li key={line.orderLineId}>{line.quantity} {line.unit} of {line.productName}: {line.reason}</li>)}
      </ul>
      {claim.reviewNote?<p className="rounded-md bg-muted p-2 text-sm">Decision: {claim.reviewNote}</p>:null}
      {isAdmin&&list.enabled&&claim.status==="requested"?
        <Button type="button" variant="outline" size="sm" disabled={busy}
          onClick={()=>start(claim)}>Review request</Button>:null}
    </article>)}
    {selected&&list?.enabled?<section className="space-y-3 rounded-xl border bg-card p-4"
      aria-label="Review customer return claim">
      <h2 className="font-semibold">Decide {selected.reference}</h2>
      <div><Label htmlFor="claim-decision">Decision</Label>
        <select id="claim-decision" className="mt-1 h-11 w-full rounded-md border bg-background px-2 text-sm"
          value={decision} disabled={busy} onChange={e=>setDecision(e.target.value as "accept"|"reject")}>
          <option value="reject">Reject with explanation</option>
          <option value="accept">Accept for further staff inspection</option>
        </select>
      </div>
      <div><Label htmlFor="claim-decision-note">Customer-safe explanation (20–1000 characters)</Label>
        <Textarea id="claim-decision-note" rows={3} disabled={busy} maxLength={1000}
          value={note} onChange={e=>setNote(e.target.value)}
          placeholder="Explain the staff review decision; do not include payment or private staff details."/>
      </div>
      <p className="text-xs text-muted-foreground">
        Even if accepted, returned products remain off-sale and no money is
        refunded until separately verified stock receipt and refund approval.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={()=>void decide()} disabled={busy||note.trim().length<20}>
          {busy?"Recording…":"Record final review decision"}
        </Button>
        <Button type="button" variant="outline" onClick={()=>setSelected(null)} disabled={busy}>Cancel</Button>
      </div>
    </section>:null}
  </div>;
}
