"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail, Store } from "lucide-react";
import { ApiError, apiOps } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UatDemoAccountView } from "@/services/contracts";

export function StaffLoginForm() {
  const router = useRouter();
  const [returnPath, setReturnPath] = useState("/admin");
  const [demoAccounts, setDemoAccounts] = useState<UatDemoAccountView[]>([]);
  const [demoAccountId, setDemoAccountId] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("next");
    const safeReturnPath = candidate?.startsWith("/admin") && !candidate.startsWith("//") ? candidate : "/admin";
    setReturnPath(safeReturnPath);

    let active = true;
    apiOps.staffSession().then((session) => {
      if (!active) return;
      if (session.actor.role === "admin" || session.actor.role === "inventory_manager") {
        router.replace(safeReturnPath);
      }
    }).catch(() => undefined);
    apiOps.staffDemoAccounts().then((accounts) => {
      if (!active) return;
      setDemoAccounts(accounts);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  const selectedDemoAccount = demoAccounts.find((item) => item.id === demoAccountId);

  const continueAsDemo = async () => {
    if (!selectedDemoAccount) return;
    setDemoBusy(true);
    setError(null);
    try {
      const session = await apiOps.staffDemoLogin(selectedDemoAccount.id);
      if (session.actor.role !== "admin" && session.actor.role !== "inventory_manager") {
        await apiOps.staffLogout().catch(() => undefined);
        setError("This demo account does not have back-office access.");
        return;
      }
      router.replace(returnPath);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not start the demo session. Please try again.");
    } finally {
      setDemoBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await apiOps.staffLogin(email, password);
      if (session.actor.role !== "admin" && session.actor.role !== "inventory_manager") {
        await apiOps.staffLogout().catch(() => undefined);
        setError("This account does not have back-office access.");
        return;
      }
      router.replace(returnPath);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-xl bg-primary font-serif text-2xl font-bold text-primary-foreground" aria-hidden>V</span>
          <h1 className="mt-4 font-serif text-2xl font-bold">Variety Groceries staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to the secure back office.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Staff sign in</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              {demoAccounts.length > 0 ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="space-y-2">
                    <Label htmlFor="staff-demo-account">Demo users (UAT)</Label>
                    <Select value={demoAccountId} onValueChange={setDemoAccountId}>
                      <SelectTrigger id="staff-demo-account" className="h-11 w-full bg-background">
                        <SelectValue placeholder="Choose a demo user" />
                      </SelectTrigger>
                      <SelectContent>
                        {demoAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>{account.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="secondary" className="h-10 w-full" disabled={!selectedDemoAccount || demoBusy || busy} onClick={continueAsDemo}>
                      {demoBusy ? "Starting demo…" : selectedDemoAccount ? `Continue as ${selectedDemoAccount.label}` : "Continue as demo user"}
                    </Button>
                    <p className="text-xs leading-5 text-muted-foreground">UAT demo access uses a protected server-created session. No shared demo password is exposed in this page.</p>
                  </div>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="staff-email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="staff-email" type="email" autoComplete="username" className="h-11 pl-9" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-password">Password</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="staff-password" type="password" autoComplete="current-password" className="h-11 pl-9" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </div>
              </div>
              {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
              <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/" className="inline-flex items-center gap-1.5 font-medium hover:underline"><Store className="size-4" aria-hidden /> Back to the storefront</Link>
        </p>
      </div>
    </div>
  );
}
