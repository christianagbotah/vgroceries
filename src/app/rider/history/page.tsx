"use client";

import { useEffect, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useRiderSession } from "@/components/layout/rider-shell";
import { ErrorState, LoadingState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Check, Clock } from "lucide-react";

type HistoryRow = Awaited<ReturnType<typeof apiOps.riderHistory>>[number];

export default function RiderHistoryPage() {
  const { riderId, ready } = useRiderSession();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!riderId) {
      window.location.href = "/rider/login";
      return;
    }
    (async () => {
      try {
        setRows(await apiOps.riderHistory(riderId));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load your history.");
      }
    })();
  }, [riderId, ready]);

  if (!ready || (!rows && !error)) return <LoadingState rows={3} label="Loading history" />;
  if (error) return <ErrorState message={error} />;
  if (!rows) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <h1 className="text-lg font-bold">Completed jobs</h1>
        <p className="text-sm text-muted-foreground">
          Delivery history and cash collection status. Remitted cash is reconciled at the store.
        </p>
      </div>

      {!rows.length ? (
        <EmptyState icon={Check} title="No completed jobs yet" description="Delivered and returned jobs will be listed here." />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.jobId} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{r.orderReference}</p>
                <div className="flex items-center gap-2">
                  <StatusBadge kind="delivery" status={r.status} />
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden /> {r.deliveredAtLabel}
                  </span>
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {r.cashToCollectMinor ? (
                  <p className={r.remitted ? "text-success" : "text-[color:var(--warning-foreground)]"}>
                    Cash: {r.remitted ? "collected and remitted" : r.cashCollected ? "collected — remit at the store" : "not collected"}
                  </p>
                ) : (
                  <p>No cash on this job</p>
                )}
                {r.proof ? <p>Proof: {r.proof.method}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
