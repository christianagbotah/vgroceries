"use client";

import Link from "next/link";
import { useState } from "react";
import { apiOps } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Search } from "lucide-react";

type PaymentRow = Awaited<ReturnType<typeof apiOps.payments>>[number];

export default function AdminPaymentsPage() {
  const [status, setStatus] = useState("all");
  const [settlement, setSettlement] = useState("all");
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useApiData(() => apiOps.payments(), []);

  if (loading) return <LoadingState rows={5} label="Loading payments" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const all = data ?? [];
  const rows = all.filter((p: PaymentRow) =>
    (status === "all" || p.status === status) &&
    (settlement === "all" || p.settlementState === settlement) &&
    (!q || `${p.orderReference} ${p.providerRef ?? ""}`.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Attempts, settlement state and reconciliation exceptions. Callbacks are counted — a
          duplicate callback never double-marks an order.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Attempts", value: all.length },
          { label: "Settled / reconciled", value: all.filter((p: PaymentRow) => ["settled", "reconciled"].includes(p.settlementState)).length },
          { label: "Unsettled", value: all.filter((p: PaymentRow) => p.settlementState === "unsettled").length },
          { label: "Exceptions", value: all.filter((p: PaymentRow) => p.settlementState === "exception").length },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-bold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:min-w-56">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" className="h-11 pl-9" placeholder="Order reference or provider ref…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search payments" />
        </div>
        <Select value={status} onValueChange={setStatus} aria-label="Filter by status">
          <SelectTrigger className="h-11 w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {["initiated", "pending", "succeeded", "failed", "expired"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={settlement} onValueChange={setSettlement} aria-label="Filter by settlement">
          <SelectTrigger className="h-11 w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any settlement</SelectItem>
            {["unsettled", "settled", "reconciled", "exception"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!rows.length ? (
        <EmptyState icon={CreditCard} title="No payment attempts match" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-semibold">Order</th>
                  <th className="p-3 font-semibold">Method</th>
                  <th className="p-3 text-right font-semibold">Amount</th>
                  <th className="p-3 font-semibold">Attempt</th>
                  <th className="p-3 font-semibold">Callbacks</th>
                  <th className="p-3 font-semibold">Settlement</th>
                  <th className="hidden p-3 font-semibold lg:table-cell">Provider ref</th>
                  <th className="hidden p-3 font-semibold xl:table-cell">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p: PaymentRow) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3 font-medium">
                      <Link href={`/admin/orders/${p.orderId}`} className="hover:underline focus-visible:underline">{p.orderReference}</Link>
                      <p className="text-xs capitalize text-muted-foreground">{p.channel}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.method.replace(/_/g, " ")}</td>
                    <td className="p-3 text-right font-medium tabular-nums">{p.amountLabel}</td>
                    <td className="p-3">
                      <StatusBadge kind="generic" status={p.status} label={p.status} />
                      {p.failureReason ? <p className="mt-0.5 text-xs text-destructive">{p.failureReason}</p> : null}
                    </td>
                    <td className="p-3 tabular-nums text-muted-foreground">{p.callbackCount}</td>
                    <td className="p-3">
                      <StatusBadge kind="generic" status={p.settlementState === "exception" ? "failed" : p.settlementState === "reconciled" ? "approved" : p.settlementState === "settled" ? "sent" : "pending"} label={p.settlementState.replace(/_/g, " ")} />
                    </td>
                    <td className="hidden p-3 font-mono text-xs text-muted-foreground lg:table-cell">{p.providerRef ?? "—"}</td>
                    <td className="hidden p-3 text-muted-foreground xl:table-cell">{p.createdAtLabel} UTC</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        Reconciliation duties for the backend: verify provider outcomes through their supported
        mechanisms, keep idempotency keys, and resolve pending attempts with the provider rather
        than re-charging customers. Settlement states here derive from the demo fixtures.
      </p>
    </div>
  );
}
