"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiOps, ApiError } from "@/services/client";
import type { AccountOrderRow, SessionLookupResponse } from "@/services/contracts";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Package, ShoppingBag, UserRound } from "lucide-react";

export default function AccountPage() {
  const [session, setSession] = useState<SessionLookupResponse | null>(null);
  const [orders, setOrders] = useState<AccountOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiOps.authMe(), apiOps.accountOrders()]).then(([identity, rows]) => {
      if (cancelled) return;
      setSession(identity);
      setOrders(rows);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load your account.");
    });
    return () => { cancelled = true; };
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!session || !orders) return <LoadingState rows={4} label="Loading account" />;
  const recentOrders = orders.slice(0, 5);

  return (
    <div className="space-y-6">
      <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-5 text-primary" aria-hidden /> Customer account</CardTitle></CardHeader><CardContent className="space-y-1 text-sm"><p className="font-medium">{session.actor.name}</p><p className="text-muted-foreground">Your identity is protected by the Variety Groceries secure account session.</p></CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/account/orders" className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"><p className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag className="size-4 text-primary" aria-hidden /> {orders.length} orders</p><p className="mt-1 text-xs text-muted-foreground">View order history and current status</p></Link>
        <Link href="/account/lists" className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"><p className="flex items-center gap-2 text-sm font-semibold"><Heart className="size-4 text-primary" aria-hidden /> Wishlist</p><p className="mt-1 text-xs text-muted-foreground">Products you saved while shopping</p></Link>
      </div>
      <div className="rounded-xl border bg-card"><div className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">Recent orders</h2><Button asChild variant="ghost" size="sm" className="h-9"><Link href="/account/orders">View all</Link></Button></div><ul className="divide-y">{recentOrders.length === 0 ? <li className="p-4 text-sm text-muted-foreground">No orders yet — <Link href="/shop" className="text-primary underline hover:no-underline">start shopping</Link>.</li> : recentOrders.map((order) => <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"><Link href={`/account/orders/${order.id}`} className="font-medium hover:underline focus-visible:underline">{order.reference}</Link><span className="flex flex-wrap items-center gap-2"><StatusBadge kind="payment" status={order.paymentStatus} /><StatusBadge kind="fulfilment" status={order.fulfilmentStatus} /><span className="text-muted-foreground">{order.createdAtLabel}</span><span className="font-semibold tabular-nums">{order.totalLabel}</span></span></li>)}</ul></div>
      <p className="flex items-start gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground"><Package className="mt-0.5 size-4 shrink-0" aria-hidden />Prefer not to sign in? Guest orders can still be tracked from <Link href="/track" className="text-primary underline hover:no-underline">the tracking page</Link>.</p>
    </div>
  );
}
