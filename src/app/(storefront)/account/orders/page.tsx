"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiOps, ApiError } from "@/services/client";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Package } from "lucide-react";

type OrderRow = Awaited<ReturnType<typeof apiOps.accountOrders>>[number];

export default function AccountOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setOrders(await apiOps.accountOrders());
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load your orders.");
      }
    })();
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!orders) return <LoadingState rows={5} label="Loading orders" />;

  if (!orders.length) {
    return (
      <EmptyState
        icon={Package}
        title="No orders yet"
        description="Your order history will appear here after your first checkout."
        action={{ label: "Start shopping", href: "/shop" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <ul className="divide-y">
        {orders.map((o) => (
          <li key={o.id}>
            <Link
              href={`/account/orders/${o.id}`}
              className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm transition-colors hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="font-semibold">{o.reference}</p>
                <p className="text-xs text-muted-foreground">
                  {o.createdAtLabel} UTC · {o.lineCount} {o.lineCount === 1 ? "line" : "lines"} ·{" "}
                  {o.fulfilment === "delivery" ? "Delivery" : "Collection"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="payment" status={o.paymentStatus} />
                <StatusBadge kind="fulfilment" status={o.fulfilmentStatus} />
                <span className="font-bold tabular-nums">{o.totalLabel}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
