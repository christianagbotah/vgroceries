"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiOps, ApiError } from "@/services/client";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type ReturnDetail = Awaited<ReturnType<typeof apiOps.returnDetail>>;

export default function AccountReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ReturnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setDetail(await apiOps.returnDetail(id));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load this return.");
      }
    })();
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (!detail) return <LoadingState rows={3} label="Loading return" />;

  const dispositionCopy: Record<string, string> = {
    restock_saleable: "Approved for restock — the items went back into saleable stock.",
    damaged_unsaleable: "Unsaleable — recorded as damaged; not restocked.",
    quarantine_pending: "Under inspection — held in quarantine until a decision.",
    not_returned: "No physical return — stock unchanged.",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-bold">Return {detail.reference}</h2>
        <div className="flex gap-2">
          <StatusBadge kind="return" status={detail.status} />
          {detail.refunds[0] ? <StatusBadge kind="refund" status={detail.refunds[0].status} /> : null}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        On order <Link href={`/account/orders/${detail.orderId}`} className="text-primary underline hover:no-underline">{detail.orderReference}</Link>{" "}
        · requested {detail.createdAtLabel} UTC
      </p>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold">Items</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {detail.lines.map((l) => (
            <li key={l.id} className="flex flex-wrap justify-between gap-2">
              <span>
                {l.quantity} × {l.productName} <span className="text-muted-foreground">({l.variantName})</span> — {l.reason}
              </span>
              <span className="tabular-nums">{l.approvedRefundLabel ?? l.requestedRefundLabel}</span>
            </li>
          ))}
        </ul>
        {detail.evidenceNote ? (
          <p className="mt-3 rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">
            Evidence: {detail.evidenceNote}
          </p>
        ) : null}
      </div>

      {detail.refunds.length ? (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Refund</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {detail.refunds.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {f.method === "manual_recording" ? "Manual refund recording" : "Provider refund"} ·{" "}
                  <StatusBadge kind="refund" status={f.status} />
                </span>
                <span className="tabular-nums font-medium">{f.amountLabel}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            A refund request or approval is not a completed money transfer — status here reflects
            the provider result.
          </p>
        </div>
      ) : null}

      {detail.disposition ? (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Inspection outcome</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{dispositionCopy[detail.disposition.kind] ?? detail.disposition.note}</p>
        </div>
      ) : null}

      <Button asChild variant="outline" className="h-11">
        <Link href="/account/returns">Back to returns</Link>
      </Button>
    </div>
  );
}
