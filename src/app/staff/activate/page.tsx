"use client";

import { useState } from "react";
import Link from "next/link";
import { apiOps, ApiError } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const enabled = process.env.NEXT_PUBLIC_STAFF_ONBOARDING_UAT === "1";

export default function StaffActivatePage() {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState("");

  if (!enabled) return <main className="mx-auto max-w-xl space-y-4 p-6 py-12">
    <h1 className="font-serif text-3xl font-bold">Staff activation is currently closed</h1>
    <p className="text-sm">Cashier invitations will be available only after private staff onboarding has been approved.</p>
    <Link href="/staff/login" className="text-primary underline">Staff sign-in</Link>
  </main>;

  async function activate() {
    setBusy(true); setError("");
    try {
      await apiOps.staffAcceptInvitation({code, password});
      setActivated(true);
      setCode(""); setPassword(""); setConfirmation("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not activate cashier invitation.");
    } finally {setBusy(false);}
  }

  return <main className="mx-auto max-w-xl space-y-6 p-4 py-10 sm:p-8">
    <div>
      <p className="text-sm font-semibold text-primary">Variety Groceries · Private staff onboarding</p>
      <h1 className="mt-2 font-serif text-3xl font-bold">Activate cashier account</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter the private, one-time code given to you by a Variety Groceries administrator. Choose your own password, which your administrator should not know. Codes expire 48 hours after issue.</p>
    </div>
    <p className="rounded-lg border p-4 text-sm">UAT only. An invitation is not payment or identity verification. Do not share your password with anyone.</p>
    {activated ? <section role="status" className="space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Account activated</h2>
      <p className="text-sm">Your code has been used. Sign in with your cashier email and new password to reach the restricted cashier workspace.</p>
      <Link className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" href="/staff/login">Continue to sign-in</Link>
    </section> : <form className="space-y-4 rounded-xl border bg-card p-5" onSubmit={e => {e.preventDefault(); void activate();}}>
      <label className="block space-y-2 text-sm font-medium">One-time activation code
        <Input value={code} onChange={e => setCode(e.target.value.toLowerCase().trim())}
          autoComplete="off" maxLength={64} disabled={busy} required placeholder="64-character code" />
      </label>
      <label className="block space-y-2 text-sm font-medium">New password
        <Input type="password" autoComplete="new-password" minLength={12} maxLength={256}
          value={password} onChange={e => setPassword(e.target.value)} disabled={busy} required />
      </label>
      <label className="block space-y-2 text-sm font-medium">Confirm password
        <Input type="password" autoComplete="new-password"
          value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} required />
      </label>
      {password && confirmation && password !== confirmation ? <p role="status" className="text-sm text-destructive">Passwords do not match.</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button className="min-h-11" type="submit" disabled={busy || !/^[a-f0-9]{64}$/.test(code) || password.length<12 || password.length>256 || password!==confirmation}>
        {busy ? "Activating…" : "Set password and activate"}
      </Button>
      <p className="text-xs text-muted-foreground">Expired or used codes cannot be redeemed again. Ask your administrator to reissue the invitation.</p>
    </form>}
  </main>;
}
