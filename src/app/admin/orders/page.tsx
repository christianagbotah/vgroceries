"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiOps } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart } from "lucide-react";
import type { FulfilmentStatus, PaymentStatus } from "@/types/domain";

type OrderRow = Awaited<ReturnType<typeof apiOps.orders>>[number];

export default function AdminOrdersPage() {
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, loading, error, reload } = useApiData(
    () => apiOps.orders({ channel: channel === "all" ? undefined : channel, status: status === "all" ? undefined : status, payment: payment === "all" ? undefined : payment, q: q || undefined }),
    [channel, status, payment, q]
  );

  const rows = useMemo(() => data ?? [], [data]);
  const filtering = channel !== "all" || status !== "all" || payment !== "all" || !!q;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Orders</h1>
        <p className="text-sm text-muted-foreground">Online and counter orders in one model.</p>
      </div>

      {/* filters: one desktop row, wrapping on mobile */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="relative min-w-0 flex-1 sm:min-w-56"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(searchInput.trim());
          }}
        >
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            className="h-11 pl-9"
            placeholder="Reference, customer or phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search orders"
            key={q}
          />
        </form>
        <Select value={channel} onValueChange={setChannel} aria-label="Filter by channel">
          <SelectTrigger className="h-11 w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="pos">Counter (POS)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus} aria-label="Filter by fulfilment status">
          <SelectTrigger className="h-11 w-full sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any fulfilment</SelectItem>
            {(Object.keys(STATUS_OPTIONS) as FulfilmentStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_OPTIONS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={payment} onValueChange={setPayment} aria-label="Filter by payment status">
          <SelectTrigger className="h-11 w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any payment</SelectItem>
            {(Object.keys(PAY_OPTIONS) as PaymentStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{PAY_OPTIONS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtering ? (
          <button
            type="button"
            className="h-11 rounded-lg border px-3 text-sm hover:bg-accent"
            onClick={() => {
              setChannel("all"); setStatus("all"); setPayment("all"); setQ(""); setSearchInput("");
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {loading ? (
        <LoadingState rows={6} label="Loading orders" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No orders match" description={filtering ? "Adjust or clear the filters." : "Orders will appear as customers check out."} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-semibold">Reference</th>
                  <th className="p-3 font-semibold">Customer</th>
                  <th className="hidden p-3 font-semibold sm:table-cell">Channel</th>
                  <th className="p-3 font-semibold">Payment</th>
                  <th className="hidden p-3 font-semibold md:table-cell">Fulfilment</th>
                  <th className="hidden p-3 font-semibold lg:table-cell">Type</th>
                  <th className="p-3 text-right font-semibold">Total</th>
                  <th className="hidden p-3 font-semibold lg:table-cell">Placed</th>
                  <th className="hidden p-3 font-semibold xl:table-cell">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o: OrderRow) => (
                  <tr key={o.id} className="border-t hover:bg-accent/50">
                    <td className="p-3 font-medium">
                      <Link href={`/admin/orders/${o.id}`} className="hover:underline focus-visible:underline">
                        {o.reference}
                      </Link>
                    </td>
                    <td className="max-w-44 truncate p-3">
                      <span className="block truncate">{o.customerName}</span>
                      <span className="block truncate text-xs text-muted-foreground">{o.customerPhone}</span>
                    </td>
                    <td className="hidden p-3 capitalize text-muted-foreground sm:table-cell">{o.channel}</td>
                    <td className="p-3"><StatusBadge kind="payment" status={o.paymentStatus} /></td>
                    <td className="hidden p-3 md:table-cell"><StatusBadge kind="fulfilment" status={o.fulfilmentStatus} /></td>
                    <td className="hidden p-3 capitalize text-muted-foreground lg:table-cell">{o.fulfilment}</td>
                    <td className="p-3 text-right font-medium tabular-nums">{o.totalLabel}</td>
                    <td className="hidden p-3 text-muted-foreground lg:table-cell">{o.createdAtLabel}</td>
                    <td className="hidden p-3 font-mono text-xs text-muted-foreground xl:table-cell">{o.posReceiptNo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_OPTIONS: Record<FulfilmentStatus, string> = {
  awaiting_confirmation: "Awaiting confirmation",
  confirmed: "Confirmed",
  picking: "Picking",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  ready_for_collection: "Ready for collection",
  collected: "Collected",
  cancelled: "Cancelled",
};

const PAY_OPTIONS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  pending: "Payment pending",
  succeeded: "Paid",
  failed: "Payment failed",
  expired: "Payment expired",
  partially_refunded: "Partially refunded",
  refund_pending: "Refund pending",
  refunded: "Refunded",
  requires_review: "Needs review",
};
