"use client";
import {useEffect,useRef,useState} from "react";
import {apiOps,ApiError} from "@/services/client";
import {Button} from "@/components/ui/button";

export function OrderSmsPreference({orderId,onRevoked}:{orderId:string;onRevoked:()=>void}){
 const [state,setState]=useState<"requested"|"revoked"|"not_requested"|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const lock=useRef(false);
 const [reload,setReload]=useState(0);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let active=true;
  void apiOps.orderSmsUpdatesStatus(orderId).then(s=>{if(active){setState(s.state);setError("");}}).catch(()=>{if(active){setState(null);setError("SMS preference could not be loaded.");}}).finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[orderId,reload]);
 async function revoke(){
  if(lock.current||loading||state!=="requested")return;
  lock.current=true;setBusy(true);setError("");
  try{
   const result=await apiOps.revokeOrderSmsUpdates(orderId);
   if(result.revoked!==true)throw Error("Unexpected preference response.");
   setState("revoked");onRevoked();
  }catch(e){setError(e instanceof ApiError?e.message:"SMS preference could not be updated.");}
  finally{lock.current=false;setBusy(false);}
 }
 if(loading)return <p role="status" className="text-sm text-muted-foreground">Checking SMS update preference…</p>;
 if(state==="not_requested")return null;
 if(state===null&&!error)return null;
 return <section className="rounded-xl border bg-card p-4 space-y-2" aria-label="Order SMS preference">
  <h2 className="font-semibold">SMS updates</h2>
  {state==="revoked"?<p role="status" className="text-sm text-muted-foreground">SMS updates are turned off for this order.</p>:state==="requested"?<>
   <p className="text-sm text-muted-foreground">Turn off future order SMS updates without affecting payment or delivery. A message already being sent may still arrive.</p>
   <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void revoke()}>Turn off SMS updates</Button>
  </>:<Button type="button" size="sm" variant="outline" onClick={()=>{setLoading(true);setError("");setReload(v=>v+1);}}>Retry SMS preference</Button>}
  {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
 </section>;
}
