"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldAlert } from "lucide-react";
import { codExceptionInboxSchema, type CodExceptionInbox } from "@variety/contracts";
import { apiOps } from "@/services/client";
import { isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";

const PER_PAGE = 25;
type Phase = "all" | "delivered" | "in_transit";
const phases: { key: Phase; label: string }[] = [
  { key: "all", label: "All COD exceptions" },
  { key: "delivered", label: "Delivered" },
  { key: "in_transit", label: "Not delivered" },
];
const statusLabel: Record<string, string> = {
  delivery_incomplete: "Delivery not completed",
  delivered_collection_unverified: "Delivered · cash unverified",
  payment_state_requires_review: "Payment status needs review",
};

function stageMessage(status: number): string {
  if (status === 401 || status === 403) return "A genuine administrator session is required to view COD exceptions.";
  if (status === 404) return "The COD exception report has not been deployed to this API. No cash evidence is available here.";
  return "Could not verify COD exceptions from the live staging authority. No amounts have been assumed.";
}

export default function CodExceptionsPage() {
  const [phase, setPhase] = useState<Phase>("all");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState<CodExceptionInbox | null>(null);
  const reload = useCallback(() => setRefresh(n => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    setReport(null);
    void (async () => {
      try {
        // A demonstration role is never authority to read customer commerce.
        if (isDemoStaffSessionActive()) {
          throw new Error("Sign in with a real administrator account. Demo sessions cannot access COD reconciliation.");
        }
        const session = await apiOps.staffSession();
        if (session.actor.role !== "admin") {
          throw new Error("Only a genuine administrator can review COD collection exceptions.");
        }
        if (controller.signal.aborted) return;
        // Same-origin /api/v1 is the public gateway to the real NestJS API.
        // Never substitute the /api/mock/v1 prototype or load a stored ledger.
        const query = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE), phase });
        const response = await fetch(`/api/v1/admin/dispatch/cod-exceptions?${query.toString()}`, {
          method: "GET", credentials: "include", cache: "no-store",
          headers: { Accept: "application/json" }, signal: controller.signal,
        });
        if (!response.ok) throw new Error(stageMessage(response.status));
        const json: unknown = await response.json();
        if (!json || typeof json !== "object" || !("ok" in json) || json.ok !== true || !("data" in json)) {
          throw new Error("The COD reporting authority returned an invalid response. No figures can be trusted.");
        }
        const parsed = codExceptionInboxSchema.safeParse(json.data);
        if (!parsed.success) throw new Error("The COD report did not match its verified contract. No figures can be trusted.");
        if (active) setReport(parsed.data);
      } catch (cause) {
        if (!active || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Unable to load the COD report.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [phase, page, refresh]);

  return (
    <main className="mx-auto max-w-6xl space-y-5 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/dispatch" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Dispatch
          </Link>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">COD collection exceptions</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Administrator-only investigation queue. This is not a payment ledger or a rider debt statement.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={loading} onClick={reload} className="min-h-11 gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh report
        </Button>
      </div>

      <section role="note" className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm leading-6">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div>
          <strong>Cash is not verified by delivery.</strong> Variety Groceries does not yet have an authorised COD collection and rider-remittance ledger.
          A delivered parcel, cash-on-delivery payment method, or a successful payment-status label must never be treated as proof of cash received or handed over.
          Do not use this report for payout, debt deduction, settlement, refund, or inventory adjustments.
        </div>
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label="COD delivery phase">
        {phases.map(option => (
          <Button key={option.key} type="button" size="sm" variant={phase === option.key ? "default" : "outline"}
            aria-pressed={phase === option.key} onClick={() => { setPhase(option.key); setPage(1); }} className="min-h-11">
            {option.label}
          </Button>
        ))}
      </div>

      {loading && <p role="status" className="rounded-xl border p-5 text-sm">Verifying the COD exception queue…</p>}
      {!loading && error && <section role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-5 text-sm">
        <p className="font-semibold">COD reporting unavailable</p>
        <p>{error}</p>
        <Button type="button" variant="outline" onClick={reload}>Retry verification</Button>
      </section>}
      {!loading && report && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Orders requiring investigation</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{report.total.toLocaleString("en-GH")}</p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Gross order face value · not confirmed collected</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(report.totalOrderFaceValueMinor)}</p>
          </div>
        </div>
        {report.items.length === 0 ? (
          <section className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
            No matching COD orders were found in this delivery phase. This does not verify collection or remittance.
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Order</th>
                    <th scope="col" className="px-4 py-3 font-medium">Delivery status</th>
                    <th scope="col" className="px-4 py-3 font-medium">Reconciliation exception</th>
                    <th scope="col" className="px-4 py-3 font-medium">Recorded cash evidence</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Gross face value</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.items.map(item => (
                    <tr key={item.orderId} className="align-top">
                      <td className="px-4 py-4 font-medium">{item.orderReference}</td>
                      <td className="px-4 py-4 capitalize">{item.deliveryStatus.replaceAll("_", " ")}</td>
                      <td className="px-4 py-4">
                        <span className="font-medium">{statusLabel[item.exception] ?? "Requires review"}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">Payment status: {item.paymentStatus}</span>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">Collection not recorded<br />Remittance not recorded</td>
                      <td className="px-4 py-4 text-right font-medium tabular-nums">{formatMoney(item.orderFaceValueMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">Page {report.page} · {report.total.toLocaleString("en-GH")} orders · read-only</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => setPage(n => Math.max(1, n - 1))}>Previous</Button>
            <Button type="button" variant="outline" disabled={loading || report.page * report.perPage >= report.total} onClick={() => setPage(n => n + 1)}>Next</Button>
          </div>
        </div>
      </>}
    </main>
  );
}
