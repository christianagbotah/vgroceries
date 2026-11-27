"use client";

import {useEffect,useRef,useState} from "react";
import {apiOps,ApiError} from "@/services/client";
import type {OrderEmailUpdatesStatus,OrderEmailUpdatesAction} from "@/services/contracts";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";

export function OrderEmailVerification({orderId}:{orderId:string}){
 const [status,setStatus]=useState<OrderEmailUpdatesStatus|null>(null);
 const [challenge,setChallenge]=useState<{challengeId:string;expiresAt:string}|null>(null);
 const [code,setCode]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [until,setUntil]=useState(0);
 const [clock,setClock]=useState(0);
 const locked=useRef(false);
 const remaining=Math.max(0,Math.ceil((until-clock)/1000));
 const cooling=remaining>0;
 useEffect(()=>{
  let active=true;
  void apiOps.orderEmailUpdatesStatus(orderId).then(s=>{if(active)setStatus(s);}).catch(()=>{if(active)setError("Email preference status could not be loaded.");});
  return ()=>{active=false;};
 },[orderId]);
 useEffect(()=>{
  if(!cooling)return;
  const timer=window.setInterval(()=>setClock(Date.now()),1000);
  return ()=>window.clearInterval(timer);
 },[cooling]);

 async function action(body:OrderEmailUpdatesAction){
  if(locked.current)return;
  if(body.action==="request"&&remaining>0)return;
  locked.current=true;setBusy(true);setError("");
  try{
   const response=await apiOps.orderEmailUpdatesAction(orderId,body);
   if("revoked" in response){setStatus({state:"revoked",verificationAvailable:false});setChallenge(null);setCode("");return;}
   if(response.verified){setStatus(s=>({state:"verified",verificationAvailable:s?.verificationAvailable??false}));setChallenge(null);setCode("");return;}
   setChallenge({challengeId:response.challengeId,expiresAt:response.expiresAt});
   setCode("");const now=Date.now();setClock(now);setUntil(now+60000);
  }catch(e){setError(e instanceof ApiError?e.message:"Email preference could not be updated.");}
  finally{locked.current=false;setBusy(false);}
 }
 if(!status)return error?<p className="text-sm text-muted-foreground" role="status">{error}</p>:null;
 if(status.state==="not_requested")return null;
 return <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Order email updates">
  <h2 className="font-semibold">Email updates</h2>
  {status.state==="revoked"?<p role="status" className="text-sm text-muted-foreground">Email updates are turned off for this order.</p>:
   <>
    {status.state==="verified"?<p role="status" className="text-sm">Your email address is verified for this order.</p>:<>
     <p className="text-sm text-muted-foreground">Verify your email address to receive your itemised order and payment messages. Until verification is complete, these messages will wait. Your payment is unaffected.</p>
     {status.verificationAvailable?<Button type="button" variant="outline" disabled={busy||cooling} onClick={()=>void action({action:"request"})}>{cooling?`Resend in ${remaining}s`:challenge?"Resend email code":"Send email code"}</Button>:<p className="text-sm text-muted-foreground">Email verification is currently unavailable.</p>}
     {challenge&&status.verificationAvailable?<div className="space-y-2">
      <Label htmlFor="order-email-code">Email verification code</Label>
      <Input id="order-email-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6}/>
      <Button type="button" disabled={busy||code.length!==6} onClick={()=>{
       if(Date.parse(challenge.expiresAt)<=Date.now()){setChallenge(null);setCode("");setError("This code has expired. Request another code.");return;}
       void action({action:"verify",challengeId:challenge.challengeId,code});
      }}>Verify email</Button>
     </div>:null}
    </>}
    {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>void action({action:"revoke"})}>Turn off email updates</Button>
   </>}
 </section>;
}
