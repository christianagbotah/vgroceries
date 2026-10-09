"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiOps, ApiError, type RiderJobView } from "@/services/client";
import { useRiderSession } from "@/components/layout/rider-shell";
import { ErrorState, LoadingState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { relativeTime } from "@/lib/format";
import { Banknote, Check, MapPin, Package, Phone } from "lucide-react";

export default function RiderHomePage() {
  const { riderId, ready } = useRiderSession();
  const [data, setData] = useState<{ jobs: RiderJobView[]; rider: { name: string; isAvailable: boolean; lastLocationAt?: string; lastLocationLabel?: string } | null; remittance: { totalMinor: number; totalLabel: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!riderId) {
      window.location.href = "/rider/login";
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const d = await apiOps.riderJobs(riderId);
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load your jobs.");
      }
    };
    load();
    const interval = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [riderId, ready]);

  if (!ready || (!data && !error)) return <LoadingState rows={3} label="Loading today's work" />;
  if (error) return <ErrorState message={error} />;

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <h1 className="text-lg font-bold">Today&apos;s work</h1>
        <p className="text-sm text-muted-foreground">
          {data.jobs.length} assigned job{data.jobs.length === 1 ? "" : "s"}
          {data.rider ? ` · you are ${data.rider.isAvailable ? "available" : "busy"}` : ""}
        </p>
        {data.rider?.lastLocationLabel ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Location shared: {data.rider.lastLocationLabel} ({data.rider.lastLocationAt ? relativeTime(data.rider.lastLocationAt) : ""}) — demo
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Location not shared (optional)</p>
        )}
      </div>

      {data.remittance.totalMinor > 0 ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <Banknote className="size-4" aria-hidden />
          <p>
            <strong>{data.remittance.totalLabel}</strong> collected cash awaiting remittance. Hand it
            to the dispatcher or cash office.
          </p>
        </div>
      ) : null}

      {!data.jobs.length ? (
        <EmptyState
          icon={Package}
          title="No jobs right now"
          description="New assignments appear here automatically — this page refreshes itself."
        />
      ) : (
        <ul className="space-y-3">
          {data.jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/rider/jobs/${job.id}`}
                className="block rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{job.orderReference}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {job.address ? job.address.line1 : "Address in job"}
                    </p>
                    <p className="text-sm">{job.items.length} item{job.items.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge kind="delivery" status={job.status} />
                    {job.cashToCollectLabel ? (
                      <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold">
                        collect {job.cashToCollectLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-sm text-primary">
                  <span className="flex items-center gap-1"><MapPin className="size-4" aria-hidden /> Open job</span>
                  {job.customerPhone ? (
                    <span className="flex items-center gap-1"><Phone className="size-4" aria-hidden /> Call customer</span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Button asChild variant="outline" className="h-12 w-full">
        <Link href="/rider/history">
          <Check className="size-4" aria-hidden /> Completed jobs
        </Link>
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {formatMoney(0) && "Cash you collect is recorded separately from delivery — remit it at the store."}
      </p>
    </div>
  );
}
