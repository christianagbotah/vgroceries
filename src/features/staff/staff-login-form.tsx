"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical, LockKeyhole, Mail, Store } from "lucide-react";
import { ApiError, apiOps } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UAT_DEMO_ACCOUNTS } from "@/features/staff/uat-demo-accounts";
import { isDemoStaffSessionActive, startDemoStaffSession } from "@/features/staff/staff-demo-session";

export function StaffLoginForm({ demoEnabled = false }: { demoEnabled?: boolean }) {
  const router = useRouter();
  const [returnPath, setReturnPath] = useState("/admin");
  const [demoAccountId, setDemoAccountId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("next");
    const safeReturnPath = candidate?.startsWith("/admin") && !candidate.startsWith("//") ? candidate : "/admin";
    setReturnPath(safeReturnPath);

    if (isDemoStaffSessionActive()) {
      router.replace(safeReturnPath);
      return;
    }

    let active = true;
    apiOps.staffSession().then((session) => {
      if (!active) return;
      if (session.actor.role === "admin" || session.actor.role === "inventory_manager") {
        router.replace(safeReturnPath);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  const continueDemo = () => {
    const account = UAT_DEMO_ACCOUNTS.find((item) => item.id === demoAccountId);
    if (!account) return;
    startDemoStaffSession(account.role);
    setError(null);
    router.replace(returnPath);
    router.refresh();
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
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-xl bg-primary font-serif text-2xl font-bold text-primary-foreground" aria-hidden>V</span>
          <h1 className="mt-4 font-serif text-2xl font-bold">Variety Groceries staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">Open the back office with a demo role or sign in as real staff.</p>
        </div>

        {demoEnabled && UAT_DEMO_ACCOUNTS.length > 0 ? (
          <Card className="border-primary/25 bg-primary/[0.03]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FlaskConical className="size-5 text-primary" aria-hidden /> Demo access
              </CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                Choose a fictional staff user to preview the role-based back office. Mock data only — demo actions do not change live UAT records.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="staff-demo-account">Demo user</Label>
                <Select value={demoAccountId} onValueChange={setDemoAccountId}>
                  <SelectTrigger id="staff-demo-account" className="h-11 w-full bg-background">
                    <SelectValue placeholder="Choose a demo user" />
                  </SelectTrigger>
                  <SelectContent>
                    {UAT_DEMO_ACCOUNTS.map((account) => (
                      <SelectItem key={account.id} value={account.id}>{account.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" className="h-11 w-full" onClick={continueDemo} disabled={!demoAccountId}>
                Continue with demo user
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                No demo password is exposed. Demo access is isolated from the production API and is available only when UAT demo mode is enabled.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader><CardTitle className="text-lg">Staff sign in</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
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
