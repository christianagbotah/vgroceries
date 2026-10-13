"use client";

/**
 * Rider dashboard (mobile-first) — today's assigned jobs.
 *
 * - The rider only ever sees their own jobs (scoped by the session rider).
 * - COD amounts are read-only context: collection authority pending. Cash is
 *   handed to the dispatcher; no financial event is recorded here.
 * - No live GPS, no ETA. Location is an optional consent-based label.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiOps, ApiError, type RiderJobView } from "@/services/client";
import { useRiderSession } from "@/components/layout/rider-shell";
import { ErrorState, LoadingState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { Banknote, Check, MapPin, Package, Phone } from "lucide-react";

type RiderJobsData = {
  jobs: RiderJobView[];
  rider: { name: string; isAvailable: boolean; lastLocationAt?: string; lastLocationLabel?: string } | null;
  codCash: { jobsWithCash: number; totalDueLabel: string; note: string };
};

const NEXT_ACTION_LABELS: Record<string, string> = {
  assigned: "Accept job",
  accepted: "Confirm pickup from store",
  picked_up: "Start delivery",
  out_for_delivery: "Mark delivered (proof required)",
  rescheduled: "Awaiting new window — dispatch decides",
  failed: "Reported — dispatch decides next step",
};

export default function RiderHomePage() {
  const { riderId, ready } = useRiderSession();
  const [data, setData] = useState<RiderJobsData | null>(null);
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
        if (!cancelled) {
          setData(d);
          setError(null);
        }
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
            Location shared: {data.rider.lastLocationLabel} ({data.rider.lastLocationAt ? relativeTime(data.rider.lastLocationAt) : ""}) — demo label, not GPS
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Location not shared (optional, consent-based)</p>
        )}
      </div>

      {data.codCash.jobsWithCash > 0 ? (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <Banknote className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>{data.codCash.totalDueLabel} in cash due across {data.codCash.jobsWithCash} job{data.codCash.jobsWithCash === 1 ? "" : "s"}.</strong>{" "}
            {data.codCash.note}
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
                    <p className="text-sm">{job.items.length} item{job.items.length === 1 ? "" : "s"}{job.zone ? ` · ${job.zone}` : ""}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge kind="delivery" status={job.status} />
                    {job.cashToCollectLabel ? (
                      <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold" title="COD — collection authority pending">
                        {job.cashToCollectLabel} due on delivery
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
                <p className="mt-2 text-xs font-medium text-muted-foreground">
                  Next: {NEXT_ACTION_LABELS[job.status] ?? "See job detail"}
                </p>
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
        Goods are handed over from the store before each job — your actions never change stock.
      </p>
    </div>
  );
}
