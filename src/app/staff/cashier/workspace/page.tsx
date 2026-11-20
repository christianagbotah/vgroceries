"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CashierWorkspace } from "@/services/contracts";
import { apiOps, ApiError } from "@/services/client";
import { isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifiedPosCustomerPicker } from "@/features/staff/verified-pos-customer-picker";
import { posCustomerLookupUatEnabled } from "@/features/staff/verified-pos-customer-lookup";

const when = (value: string) => new Date(value).toLocaleString("en-GB", {
  timeZone: "Africa/Accra", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true,
});

export default function CashierWorkspacePage() {
  const router = useRouter();
  const [data, setData] = useState<CashierWorkspace | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (isDemoStaffSessionActive())
        throw new ApiError("DEMO_ONLY", "Exit the sample session and sign in with a real cashier account.");
      const session = await apiOps.staffSession();
      if (session.actor.role !== "cashier")
        throw new ApiError("FORBIDDEN", "A real, branch-assigned cashier account is required.");
      setName(session.actor.name);
      setData(await apiOps.cashierWorkspace());
    } catch (e) {
      setData(null);
      setError(e instanceof ApiError ? e.message : "Unable to load your cashier records.");
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const signOut = async () => {
    await apiOps.staffLogout().catch(() => undefined);
    router.replace("/staff/login");
    router.refresh();
  };
  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-5 px-4 py-7 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-primary">Variety Groceries</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" asChild><Link href="/manual">User manual</Link></Button>
          <Button variant="outline" className="min-h-11" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </header>
      <div>
        <p className="text-sm font-semibold text-primary">Authenticated · Read only</p>
        <h1 className="mt-1 font-serif text-3xl font-bold">Cashier workspace</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {name ? "Signed in as " + name + ". " : ""}
          Your assigned branches and recorded till activity. Sales, refunds,
          cash movements and inventory changes cannot be performed here.
        </p>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" disabled={busy} className="min-h-11" onClick={() => void refresh()}>
          {busy ? "Refreshing…" : "Refresh records"}
        </Button>
      </div>
      {busy ? <p role="status" className="rounded-lg border p-4 text-sm">Checking your current branch permissions…</p> : null}
      {error ? (
        <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm">
          <p className="font-semibold">Cashier records unavailable</p>
          <p>{error}</p>
          <Link href="/staff/login" className="inline-flex min-h-11 items-center text-primary hover:underline">Sign in as cashier</Link>
        </div>
      ) : null}
      {data && !busy ? (
        <>
          {!data.enabled ? <p role="status" className="rounded-lg border p-4 text-sm">Counter till operations are disabled in this environment.</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-lg">Assigned branches</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.locations.map((location) => <p key={location.id} className="rounded-lg border p-3 text-sm">{location.name}</p>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Open tills</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.openTills.length === 0 ? <p className="text-sm text-muted-foreground">No open tills at your assigned branches.</p> : data.openTills.map((till) => (
                  <div key={till.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-semibold">{till.tillCode}</p>
                    <p className="text-muted-foreground">{data.locations.find((x) => x.id === till.locationId)?.name ?? "Assigned branch"}</p>
                    <p className="text-xs text-muted-foreground">Opened {when(till.openedAt)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          {posCustomerLookupUatEnabled ? <VerifiedPosCustomerPicker /> : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">My recent cash sales</CardTitle>
              <p className="text-xs text-muted-foreground">Up to 25 sales recorded by this cashier. Not a payment settlement or tax statement.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {!data.cashSalesEnabled ? <p className="text-sm">Cash sales are currently disabled.</p> :
                data.ownRecentCashSales.length === 0 ? <p className="text-sm text-muted-foreground">No recorded cash sales.</p> :
                data.ownRecentCashSales.map((sale) => (
                  <div key={sale.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <p className="break-all text-sm font-semibold">{sale.reference}</p>
                      <p className="text-xs text-muted-foreground">{when(sale.createdAt)}</p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatMoney(sale.subtotalMinor)}</span>
                  </div>
                ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </main>
  );
}
