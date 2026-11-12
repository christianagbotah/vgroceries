"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptCashierInvitation } from "./verified-staff-transport";
import { ApiError } from "@/services/adapters/types";

const enabled = process.env.NEXT_PUBLIC_POS_COUNTER_UAT === "1";

export function CashierActivation() {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState("");

  if (!enabled) return <main className="mx-auto max-w-xl p-6">
    <h1 className="text-2xl font-bold">Staff activation is disabled</h1>
    <p className="mt-2 text-sm">Staff invitations are currently available only on the private testing site.</p>
  </main>;

  async function redeem() {
    setBusy(true); setError("");
    try {
      await acceptCashierInvitation(code.trim(), password);
      setActivated(true);
      setCode(""); setPassword(""); setConfirmation("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message :
        cause instanceof Error ? cause.message : "The invitation could not be accepted.");
    } finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-xl space-y-5 p-4 py-10 sm:p-8">
    <div>
      <p className="text-sm font-semibold text-primary">Variety Groceries · Staff onboarding</p>
      <h1 className="mt-2 font-serif text-2xl font-bold sm:text-3xl">Activate your cashier account</h1>
      <p className="mt-2 text-sm text-muted-foreground">Enter the one-time code provided privately by your administrator.
        Choose a new password that your administrator does not know. Your code expires 48 hours after issue.</p>
    </div>
    <p className="rounded-xl border p-3 text-sm">This is a protected test environment.
      Only use synthetic accounts here. The invitation is redeemed once; it is not a payment or identity verification.</p>
    {activated ? <section className="space-y-3 rounded-xl border bg-card p-5" role="status">
      <h2 className="text-lg font-semibold">Cashier account activated</h2>
      <p className="text-sm">Your invitation is consumed. Sign in using your staff email and new password.</p>
      <Link href="/staff/login?next=%2Fstaff%2Fcashier"
        className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium">
        Go to staff sign-in
      </Link>
    </section> : <form className="space-y-4 rounded-xl border bg-card p-5"
      onSubmit={event => { event.preventDefault(); void redeem(); }}>
      <label className="block space-y-1 text-sm font-medium">
        <span>One-time activation code</span>
        <Input autoComplete="off" value={code} disabled={busy} maxLength={64}
          onChange={event => setCode(event.target.value.trim().toLowerCase())}
          placeholder="64-character invitation code" />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        <span>New password (12–256 characters)</span>
        <Input type="password" autoComplete="new-password" minLength={12} maxLength={256}
          value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        <span>Confirm new password</span>
        <Input type="password" autoComplete="new-password"
          value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
      </label>
      {password && confirmation && password !== confirmation &&
        <p role="status" className="text-sm text-destructive">The two passwords must match.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || !/^[a-f0-9]{64}$/.test(code.trim()) ||
        password.length < 12 || password.length > 256 || password !== confirmation}>
        {busy ? "Activating…" : "Set password and activate"}
      </Button>
      <p className="text-xs text-muted-foreground">If the code is expired or already used,
        request a new invitation from your administrator. Never share your chosen password.</p>
    </form>}
  </main>;
}
