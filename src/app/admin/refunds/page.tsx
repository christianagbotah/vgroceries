"use client";

import Link from "next/link";
import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Check, Play, RotateCcw } from "lucide-react";

type RefundRow = Awaited<ReturnType<typeof apiOps.refunds>>[number];

export default function AdminRefundsPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.refunds(), []);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: "approve" | "execute" | "retry", note: string) => {
    setBusy(id + action);
    try {
      await apiOps.refundAction(id, action, user.id);
      await reload();
      toast({ title: note });
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingState rows={4} label="Loading refunds" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Refunds</h1>
        <p className="text-sm text-muted-foreground">
          Approval, execution and outcome tracking. Cumulative refunds never exceed the original
          paid balance — the service enforces the limit.
        </p>
      </div>

      {!rows.length ? (
        <EmptyState icon={CreditCard} title="No refunds yet" description="Refund requests appear here after a return is approved." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-semibold">Refund</th>
                  <th className="p-3 font-semibold">Order / return</th>
                  <th className="p-3 text-right font-semibold">Amount</th>
                  <th className="p-3 font-semibold">Method</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="hidden p-3 font-semibold lg:table-cell">Provider</th>
                  <th className="p-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: RefundRow) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="whitespace-nowrap p-3">
                      <p className="font-medium">{r.createdAtLabel} UTC</p>
                      <p className="text-xs text-muted-foreground">requested by {r.requestedBy}</p>
                    </td>
                    <td className="p-3">
                      {r.returnReference ? (
                        <Link href={`/admin/returns/${r.returnReference}`} className="text-primary hover:underline focus-visible:underline">{r.returnReference}</Link>
                      ) : (
                        <Link href="/admin/orders" className="text-primary hover:underline">{r.orderReference}</Link>
                      )}
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums">{r.amountLabel}</td>
                    <td className="p-3 text-xs">
                      {r.method === "manual_recording" ? (
                        <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 font-semibold">manual recording</span>
                      ) : (
                        r.method.replace(/_/g, " ")
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge kind="refund" status={r.status} />
                      {r.retryCount > 0 ? <p className="mt-0.5 text-xs text-muted-foreground">{r.retryCount} attempt(s)</p> : null}
                    </td>
                    <td className="hidden p-3 lg:table-cell">
                      {r.providerRef ? <span className="font-mono text-xs">{r.providerRef}</span> : r.method === "manual_recording" ? <span className="text-xs text-muted-foreground">not a provider transfer</span> : "—"}
                      <p className="text-xs text-muted-foreground">transfer: {r.providerTransferState.replace(/_/g, " ")}</p>
                    </td>
                    <td className="p-3 text-right">
                      <span className="inline-flex flex-wrap justify-end gap-1.5">
                        {r.status === "awaiting_approval" && can("refunds.approve") ? (
                          <Button size="sm" className="h-9" disabled={busy !== null} onClick={() => act(r.id, "approve", "Refund approved — ready to execute")}>
                            <Check className="size-3.5" aria-hidden /> Approve
                          </Button>
                        ) : null}
                        {r.status === "processing" && can("refunds.approve") ? (
                          <Button size="sm" className="h-9" disabled={busy !== null} onClick={() => act(r.id, "execute", "Refund executed via provider")}>
                            <Play className="size-3.5" aria-hidden /> Execute
                          </Button>
                        ) : null}
                        {r.status === "failed" && can("refunds.approve") ? (
                          <Button size="sm" variant="outline" className="h-9" disabled={busy !== null} onClick={() => act(r.id, "retry", "Retrying the refund")}>
                            <RotateCcw className="size-3.5" aria-hidden /> Retry
                          </Button>
                        ) : null}
                        {r.status === "requires_review" ? (
                          <span className="text-xs text-muted-foreground">needs finance reviewer</span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        Demo behaviour: the first provider execution attempt fails with a retryable timeout so the
        retry path can be exercised. A payment-provider refund is distinct from any unrelated payout;
        manual refund recording stays clearly identified and permission-controlled.
      </p>
    </div>
  );
}
