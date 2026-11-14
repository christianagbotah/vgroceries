"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical, LockKeyhole, Mail, Store, UserRound, ArrowRight, ShoppingBag } from "lucide-react";
import { ApiError, apiOps } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UAT_DEMO_ACCOUNTS } from "@/features/staff/uat-demo-accounts";
import type { StaffRole } from "@/types/domain";
import { ROLE_LABELS } from "@/types/domain";
import { clearDemoStaffSession, clearDemoCustomerSession, isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";

export function StaffLoginForm({ demoEnabled = false, uatAccounts = [] }: {
  demoEnabled?: boolean;
  uatAccounts?: { id: string; label: string; email: string }[];
}) {
  const router = useRouter();
  const [returnPath, setReturnPath] = useState("/admin");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("next");
    const safeReturnPath = candidate === "/staff/cashier" || candidate === "/staff/pos" ? candidate
      : candidate && /^\/admin(?:\/|$)/.test(candidate) ? candidate : "/admin";
    setReturnPath(safeReturnPath);

    // The cashier workspace always checks real server sessions, never mock identities.
    if (isDemoStaffSessionActive()) {
      // Visiting the chooser intentionally means the tester wants to switch
      // roles. Never bounce them back to the previous demo automatically.
      return;
    }

    let active = true;
    apiOps.staffSession().then((session) => {
      if (!active) return;
      if (session.actor.role === "cashier") {
        router.replace(safeReturnPath === "/staff/pos" ? "/staff/pos" : "/staff/cashier");
      } else if (session.actor.role === "admin" || session.actor.role === "inventory_manager") {
        router.replace(safeReturnPath);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Real sign-in must never inherit an old demo-only adapter session.
      clearDemoStaffSession();
      clearDemoCustomerSession();
      const session = await apiOps.staffLogin(email, password);
      if (session.actor.role === "cashier") {
        router.replace(returnPath === "/staff/pos" ? "/staff/pos" : "/staff/cashier");
      } else if (session.actor.role === "admin" || session.actor.role === "inventory_manager") {
        router.replace(session.actor.role === "inventory_manager" && returnPath === "/staff/pos" ? "/admin" : returnPath);
      } else {
        await apiOps.staffLogout().catch(() => undefined);
        setError("This account does not have staff access.");
        return;
      }
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
          <p className="mt-1 text-sm text-muted-foreground">Sign in securely with your own staff password. No separate browser password is needed.</p>
        </div>

        {demoEnabled && UAT_DEMO_ACCOUNTS.length > 0 ? (
          <Card className="border-primary/25 bg-primary/[0.03]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FlaskConical className="size-5 text-primary" aria-hidden /> One-click role demos
              </CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                No password needed for these <strong>sample profiles</strong>.
                Explore each role, its menus and sample workflows; changes affect demo data only,
                never real stock, orders, customers or payments.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  "owner_admin", "cashier", "finance_reviewer", "customer",
                  "operations_manager", "inventory_officer", "picker_packer", "dispatcher",
                ].map((value) => {
                  const role = value as StaffRole | "customer";
                  const account = role === "customer" ? null : UAT_DEMO_ACCOUNTS.find((a) => a.role === role);
                  if (role !== "customer" && !account) return null;
                  const title = role === "owner_admin" ? "System Administrator"
                    : role === "finance_reviewer" ? "Accountant / Finance"
                    : role === "customer" ? "Customer"
                    : ROLE_LABELS[role];
                  return (
                    <Link key={role} href={`/staff/demo/${role}`} data-role-demo={role}
                      className="group flex min-h-18 items-center justify-between gap-2 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                      <span className="min-w-0">
                        <span className="block font-semibold">{title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {role === "customer" ? "Sample shopper account" : account?.name}
                        </span>
                        <span className="mt-1 block text-[11px] font-medium text-primary">One click · No password</span>
                      </span>
                      {role === "customer" ? <ShoppingBag className="size-5 shrink-0 text-primary" aria-hidden />
                        : <ArrowRight className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" aria-hidden />}
                    </Link>
                  );
                })}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                <strong>Demo mode:</strong> permissions shown are previews, not live staff privileges.
                Real transactions require an authorised individual account below.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {uatAccounts.length > 0 ? (
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Choose a staging test account</CardTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Select an authorised test profile, then enter its own password below.
                Only designated synthetic UAT accounts are shown here, not private customer or staff directories.
              </p>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {uatAccounts.map((account) => (
                <button key={account.id} type="button"
                  aria-pressed={selectedAccountId === account.id}
                  className={`min-h-16 rounded-xl border p-3 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selectedAccountId === account.id ? "border-primary bg-primary/10" : "bg-background"}`}
                  onClick={() => { setSelectedAccountId(account.id); setEmail(account.email); setPassword(""); setError(null); }}>
                  <span className="block font-semibold">{account.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Password required</span>
                </button>
              ))}
              <button type="button" aria-pressed={selectedAccountId === "other"}
                className={`min-h-16 rounded-xl border p-3 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selectedAccountId === "other" ? "border-primary bg-primary/10" : "bg-background"}`}
                onClick={() => { setSelectedAccountId("other"); setEmail(""); setPassword(""); setError(null); }}>
                <span className="block font-semibold">Another authorised account</span>
                <span className="mt-1 block text-xs text-muted-foreground">Enter your own email</span>
              </button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Real staff sign in</CardTitle>
            <p className="text-sm text-muted-foreground">Use your own password to work with the actual inventory, orders and customers.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="staff-email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="staff-email" type="email" autoComplete="username" className="h-11 pl-9" value={email} onChange={(event) => { setEmail(event.target.value); setSelectedAccountId(""); }} required autoFocus />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-password">Password</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="staff-password" type="password" autoComplete="current-password" className="h-11 pl-9" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </div>
              </div>
              <div className="text-right"><Link href="/forgot-password" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">Forgot password?</Link></div>
              {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
              <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/account/login" className="inline-flex items-center gap-1 font-medium hover:underline"><UserRound className="size-4" aria-hidden /> Customer sign in</Link>
          <span className="mx-2">·</span>
          <Link href="/" className="inline-flex items-center gap-1.5 font-medium hover:underline"><Store className="size-4" aria-hidden /> Browse groceries without signing in</Link>
        </p>
      </div>
    </div>
  );
}
