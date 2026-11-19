"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bike, LockKeyhole, ShieldCheck } from "lucide-react";
import { apiOps, ApiError } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyRiderCodEnvironment, verifiedRiderCodEnabled } from "@/features/rider/verified-cod-client";
import { clearDemoStaffSession, isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";

/** Genuine rider account sign-in, never the localStorage rider selector. */
export default function VerifiedRiderLogin() {
  const router=useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!verifiedRiderCodEnabled)return;
    let mounted=true;
    void apiOps.staffSession().then(session=>{
      if(mounted && session.actor.role==="rider")router.replace("/staff/rider/cod");
    }).catch(()=>undefined);
    return()=>{mounted=false;};
  },[router]);

  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(busy)return;
    setBusy(true);setError("");
    try{
      // Choosing real sign-in exits the mock persona; the backend still
      // independently authenticates the rider and never trusts demo identity.
      if (isDemoStaffSessionActive()) clearDemoStaffSession();
      verifyRiderCodEnvironment();
      const session=await apiOps.staffLogin(email,password);
      if(session.actor.role!=="rider"){
        await apiOps.staffLogout().catch(()=>undefined);
        throw new ApiError("FORBIDDEN","A genuine rider account is required.");
      }
      router.replace("/staff/rider/cod");
      router.refresh();
    }catch(cause){
      setError(cause instanceof ApiError ? cause.message : "Rider sign-in could not be verified.");
    }finally{setBusy(false);}
  }

  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-12">
    <header className="space-y-2 text-center">
      <Bike className="mx-auto size-11 text-primary" aria-hidden />
      <h1 className="text-2xl font-bold tracking-tight">Verified rider sign-in</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        A real rider session is required. Demo rider selections never grant access to customer orders or cash evidence.
      </p>
    </header>
    {!verifiedRiderCodEnabled ? <section role="status" className="rounded-xl border p-5 text-sm leading-6">
      Verified COD cash declarations are not enabled on this portal. No real cash actions are available.
    </section> : <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
      <div className="space-y-2"><Label htmlFor="rider-real-email">Rider email</Label>
        <Input id="rider-real-email" type="email" autoComplete="username" required
          className="h-12" value={email} onChange={event=>setEmail(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="rider-real-password">Password</Label>
        <Input id="rider-real-password" type="password" autoComplete="current-password" required
          className="h-12" value={password} onChange={event=>setPassword(event.target.value)} /></div>
      {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="h-12 w-full gap-2">
        <LockKeyhole className="size-4" aria-hidden />{busy?"Verifying account…":"Sign in as rider"}
      </Button>
    </form>}
    <p className="flex items-center justify-center gap-2 text-xs leading-5 text-muted-foreground">
      <ShieldCheck className="size-4" aria-hidden /> Cash declarations are not payment receipts or remittance confirmations.
    </p>
    <Link href="/rider/login" className="text-center text-sm text-primary hover:underline">Return to the demonstration rider workspace</Link>
  </main>;
}
