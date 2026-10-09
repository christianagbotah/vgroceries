"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiOps, ApiError, type AwaitedOrder } from "@/services/account-types";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, RotateCcw, ShoppingBag, MapPin, UserRound } from "lucide-react";

export default function AccountPage() {
  const [data, setData] = useState<AwaitedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setData(await apiOps.accountSummary());
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load your account.");
      }
    })();
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState rows={4} label="Loading account" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-5 text-primary" aria-hidden /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium">{data.customer.name}</p>
          <p className="text-muted-foreground">{data.customer.phone}</p>
          <p className="text-muted-foreground">{data.customer.email}</p>
          <p className="pt-1 text-xs text-muted-foreground">
            Guest checkout keeps working without an account — this demo profile is fictional.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/account/orders" className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBag className="size-4 text-primary" aria-hidden /> {data.ordersCount} orders
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{data.openOrders} currently open · view history</p>
        </Link>
        <Link href="/account/returns" className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <RotateCcw className="size-4 text-primary" aria-hidden /> {data.returnsCount} returns
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Requests and refund progress</p>
        </Link>
        <Link href="/account/addresses" className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="size-4 text-primary" aria-hidden /> {data.addresses.length} addresses
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Saved delivery addresses</p>
        </Link>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Recent orders</h2>
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href="/account/orders">View all</Link>
          </Button>
        </div>
        <ul className="divide-y">
          {data.recentOrders.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              No orders yet —{" "}
              <Link href="/shop" className="text-primary underline hover:no-underline">
                start shopping
              </Link>
              .
            </li>
          ) : (
            data.recentOrders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <Link href={`/account/orders/${o.id}`} className="font-medium hover:underline focus-visible:underline">
                  {o.reference}
                </Link>
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="payment" status={o.paymentStatus} />
                  <StatusBadge kind="fulfilment" status={o.fulfilmentStatus} />
                  <span className="text-muted-foreground">{o.createdAtLabel}</span>
                  <span className="font-semibold tabular-nums">{o.totalLabel}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        <Package className="mt-0.5 size-4 shrink-0" aria-hidden />
        Prefer not to sign in? Orders placed as a guest can be tracked any time from{" "}
        <Link href="/track" className="text-primary underline hover:no-underline">the tracking page</Link>.
      </p>
    </div>
  );
}
