"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { apiOps } from "@/services/client";
import { useStaff } from "@/features/staff/role-context";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";

type Detail = Awaited<ReturnType<typeof apiOps.returnDetail>>;

export default function AdminReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const { data: detail, loading, error, reload } = useApiData(() => apiOps.returnDetail(id), [id]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !detail) return <LoadingState rows={4} label="Loading return" />;

  const dispositionCopy: Record<string, string> = {
    restock_saleable: "Saleable — restocked (new recorded lot)",
    damaged_unsaleable: "Damaged / unsafe — loss recorded, never resold",
    quarantine_pending: "Held in quarantine pending further inspection",
    not_returned: "Never physically returned — stock unchanged",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/admin/returns" className="hover:underline focus-visible:underline">Returns</Link>
          <span aria-hidden> / </span> <span>{detail.reference}</span>
        </nav>
        <div className="flex gap-2">
          <StatusBadge kind="return" status={detail.status} />
          {detail.refunds[0] ? <StatusBadge kind="refund" status={detail.refunds[0].status} /> : null}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">Summary</h2>
        <p className="mt-1 text-muted-foreground">
          Order <Link href={`/admin/orders/${detail.orderId}`} className="text-primary hover:underline">{detail.orderReference}</Link> ·{" "}
          {detail.channel === "pos" ? "Counter sale" : "Online order"} · requested by {detail.requestedBy} · {detail.createdAtLabel} UTC
        </p>
        {detail.evidenceNote ? <p className="mt-1 rounded-lg bg-muted/50 p-2 text-xs">Evidence: {detail.evidenceNote}</p> : null}
        {detail.receivedAt ? <p className="mt-1 text-xs text-muted-foreground">Received at store</p> : null}
        {detail.inspectedAt ? <p className="text-xs text-muted-foreground">Inspected</p> : null}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Lines</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {detail.lines.map((l) => (
            <li key={l.id} className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0">
              <span>
                {l.quantity} × {l.productName} <span className="text-muted-foreground">({l.variantName})</span>
                <span className="block text-xs text-muted-foreground">Reason: {l.reason}</span>
              </span>
              <span className="text-right">
                <span className="block font-medium tabular-nums">{l.approvedRefundLabel ?? l.requestedRefundLabel}</span>
                {l.approvedRefundLabel && l.approvedRefundLabel !== l.requestedRefundLabel ? (
                  <span className="block text-xs text-muted-foreground line-through">{l.requestedRefundLabel}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {detail.disposition ? (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="font-semibold">Disposition</h2>
          <p className="mt-1 font-medium">{dispositionCopy[detail.disposition.kind] ?? detail.disposition.kind}</p>
          <p className="text-muted-foreground">{detail.disposition.note}</p>
          <p className="mt-1 text-xs text-muted-foreground">By {detail.disposition.by}</p>
        </div>
      ) : null}

      {detail.refunds.length ? (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Refunds</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {detail.refunds.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-2.5">
                <span>
                  {f.method === "manual_recording" ? "Manual recording" : "Provider refund"} ·{" "}
                  <StatusBadge kind="refund" status={f.status} />
                  {f.providerRef ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{f.providerRef}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  {f.retryCount > 0 ? <span className="text-xs text-muted-foreground">{f.retryCount} attempt(s)</span> : null}
                  <span className="font-semibold tabular-nums">{f.amountLabel}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            A refund approval is not a completed money transfer. Provider refunds are executed from the
            refunds screen; manual recordings need finance sign-off.
          </p>
          {can("refunds.view") ? (
            <Button asChild variant="outline" size="sm" className="mt-3 h-10">
              <Link href="/admin/refunds">Open refunds workflow</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
