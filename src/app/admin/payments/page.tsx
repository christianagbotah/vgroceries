"use client";

import Link from "next/link";
import { useState } from "react";
import { apiOps } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { settlementEvidence } from "@/features/staff/payment-evidence";
import { paymentLedgerPageCsv } from "@/features/staff/payment-ledger-csv";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Download, RefreshCcw, Search } from "lucide-react";

type PaymentRow = Awaited<ReturnType<typeof apiOps.paymentLedger>>["items"][number];
const PER_PAGE = 25;

export default function AdminPaymentsPage() {
  const [status, setStatus] = useState("all");
  const [settlement, setSettlement] = useState("all");
  const [referenceDraft, setReferenceDraft] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApiData(() => apiOps.paymentLedger({
    page, perPage: PER_PAGE,
    status: status === "all" ? undefined : status,
    settlementState: settlement === "all" ? undefined : settlement,
    orderReference: orderReference || undefined,
  }), [page, status, settlement, orderReference]);
  // A separate server-scoped read returns an authoritative count across ALL
  // payment attempts, independent of the filters and page shown below.
  // Never fabricate zero when this request fails.
  const {
    data: exceptionSummary, loading: exceptionLoading,
    error: exceptionError, reload: refreshExceptions,
  } = useApiData(() => apiOps.paymentLedger({
    page: 1, perPage: 1, settlementState: "exception",
  }), []);

  const runSearch = () => {
    setPage(1);
    setOrderReference(referenceDraft.trim());
  };

  if (loading) return <LoadingState rows={5} label="Loading payments" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PER_PAGE));
  const globalExceptions = exceptionError || !exceptionSummary ? null : exceptionSummary.total;

  function exportVisiblePage() {
    if (!data || !data.items.length || loading) return;
    const csv = paymentLedgerPageCsv(data, {
      status: status === "all" ? undefined : status,
      settlementState: settlement === "all" ? undefined : settlement,
      orderReference: orderReference || undefined,
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `variety-payment-attempts-visible-page-${page}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Server-owned payment attempts, provider observations and reconciliation status. Filters
          apply to the full ledger; the exception queue has its own server-reported count. Other status breakdowns count only the visible page.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Matching attempts (all pages)", value: data?.total ?? 0 },
          { label: "Verification exceptions (all attempts)", value: exceptionLoading ? "…" : globalExceptions === null ? "Unavailable" : globalExceptions.toLocaleString() },
          { label: "Reconciled (this page)", value: rows.filter((p: PaymentRow) => p.settlementState === "reconciled").length },
          { label: "Unsettled (this page)", value: rows.filter((p: PaymentRow) => p.settlementState === "unsettled").length },
          { label: "Exceptions (this page)", value: rows.filter((p: PaymentRow) => p.settlementState === "exception").length },
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
          <Input type="search" className="h-11 pl-9" placeholder="Exact order reference…" value={referenceDraft} onChange={(e) => setReferenceDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }} aria-label="Exact order reference" />
        </div>
        <Button type="button" variant="outline" className="h-11" onClick={runSearch}>Search ledger</Button>
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }} aria-label="Filter by status">
          <SelectTrigger className="h-11 w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {["initiated", "pending", "succeeded", "failed", "expired"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant={settlement === "exception" ? "default" : "outline"} className="h-11" onClick={() => { setStatus("all"); setReferenceDraft(""); setOrderReference(""); setSettlement("exception"); setPage(1); }}>Review exceptions{globalExceptions === null ? "" : ` (${globalExceptions.toLocaleString()})`}</Button>
        <Select value={settlement} onValueChange={(value) => { setSettlement(value); setPage(1); }} aria-label="Filter by settlement">
          <SelectTrigger className="h-11 w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any settlement</SelectItem>
            {["unsettled", "settled", "reconciled", "exception"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p role="status">{exceptionError ? "Full exception count unavailable. Review the filtered queue; do not assume zero." : "The global exception count is independent of current filters and pages."}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading || exceptionLoading} onClick={() => { void reload(); void refreshExceptions(); }}><RefreshCcw className="size-4" aria-hidden /> Refresh counts</Button>
          <Button type="button" variant="outline" size="sm" disabled={loading || rows.length === 0} onClick={exportVisiblePage}><Download className="size-4" aria-hidden /> Export visible page CSV</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground" role="status">
        <p>{data?.total.toLocaleString() ?? "0"} matching attempts · page {page} of {pageCount}</p>
        <p>{data?.isDemo ? "Demo ledger" : "Production ledger"} · {rows.length} shown</p>
      </div>

      {!rows.length ? (
        <EmptyState icon={CreditCard} title="No payment attempts match" />
      ) : (
        <>
          {/* mobile: card list */}
          <ul className="space-y-2 md:hidden" aria-label="Payments">
            {rows.map((p: PaymentRow) => (
              <li key={p.id} className="rounded-xl border bg-card p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/orders/${p.orderId}`} className="font-semibold hover:underline focus-visible:underline">{p.orderReference}</Link>
                  <span className="font-semibold tabular-nums">{p.amountLabel}</span>
                </div>
                <p className="mt-0.5 text-xs capitalize text-muted-foreground">{p.channel ? `${p.channel} · ` : ""}{p.provider ? `${p.provider} · ` : ""}{p.method.replace(/_/g, " ")} · {p.callbackCount} callback{p.callbackCount === 1 ? "" : "s"}</p>
                {p.settledChannel ? <p className="mt-0.5 text-xs capitalize text-muted-foreground">Settled via {p.settledChannel.replace(/_/g, " ")}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusBadge kind="payment" status={p.status} />
                  <StatusBadge kind="payment" status={settlementEvidence(p.settlementState).badgeStatus} label={settlementEvidence(p.settlementState).label} />
                </div>
                {p.initiationState === "uncertain" ? <p className="mt-1 text-xs font-semibold text-[color:var(--warning-foreground)]">Initiation uncertain — verify with provider</p> : null}
                {p.settlementState === "exception" ? <p className="mt-1 text-xs text-muted-foreground">{settlementEvidence(p.settlementState).explanation}</p> : null}
                {p.failureReason ? <p className="mt-1 text-xs text-destructive">{p.failureReason}</p> : null}
              </li>
            ))}
          </ul>
          {/* md+: table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
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
                    <td className="p-3 text-muted-foreground"><span>{p.method.replace(/_/g, " ")}</span>{p.settledChannel ? <span className="block text-xs capitalize">Settled via {p.settledChannel.replace(/_/g, " ")}</span> : null}</td>
                    <td className="p-3 text-right font-medium tabular-nums">{p.amountLabel}</td>
                    <td className="p-3">
                      <StatusBadge kind="payment" status={p.status} />
                      {p.initiationState === "uncertain" ? <p className="mt-1 text-xs font-semibold text-[color:var(--warning-foreground)]">Initiation uncertain — verify with provider</p> : null}
                      {p.failureReason ? <p className="mt-0.5 text-xs text-destructive">{p.failureReason}</p> : null}
                    </td>
                    <td className="p-3 tabular-nums text-muted-foreground">{p.callbackCount}</td>
                    <td className="p-3">
                      <StatusBadge kind="payment" status={settlementEvidence(p.settlementState).badgeStatus} label={settlementEvidence(p.settlementState).label} />
                      {p.settlementState === "exception" ? <p className="mt-1 max-w-72 text-xs text-muted-foreground">{settlementEvidence(p.settlementState).explanation}</p> : null}
                    </td>
                    <td className="hidden p-3 font-mono text-xs text-muted-foreground lg:table-cell">{p.providerRef ?? "—"}</td>
                    <td className="hidden p-3 text-muted-foreground xl:table-cell">{p.createdAtLabel} UTC</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3" aria-label="Payment ledger pagination">
        <p className="text-sm text-muted-foreground">Showing {rows.length} of {data?.total.toLocaleString() ?? "0"} matching attempts. Filters use the full ledger, not just the visible page.</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>Previous page</Button>
          <Button type="button" variant="outline" disabled={page >= pageCount} onClick={() => setPage((n) => Math.min(pageCount, n + 1))}>Next page</Button>
        </div>
      </div>
      <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        CSV export contains only the visible page, not every matching attempt. An exception or uncertain initiation is not a payment failure. Provider observations and reconciliation do not independently prove a bank deposit or cashier receipt. Investigate with independently verified provider records; never re-charge a customer while payment verification is unresolved.
      </p>
    </div>
  );
}
