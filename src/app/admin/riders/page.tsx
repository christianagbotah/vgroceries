"use client";

/**
 * Riders admin — fleet roster with availability control.
 *
 * - A rider with an active job is BUSY (not merely "unavailable"): the UI
 *   must never present a busy rider as assignable.
 * - Availability changes that could affect future assignments ask for
 *   confirmation; toggles have loading / disabled / error-recovery states.
 * - Last location is shown ONLY when a real (consented, demo-labelled)
 *   update exists — no location is fabricated.
 * - COD/remittance state is intentionally absent: the cash ledger is not
 *   connected (future COD cash authority).
 */

import Link from "next/link";
import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Bike, Link2, MapPin, Truck, Users } from "lucide-react";
import type { AdminRiderRow } from "@/services/contracts/dispatch";

type Rider = AdminRiderRow;

function StatusPill({ rider }: { rider: Rider }) {
  const busy = !rider.isAvailable && !!rider.activeJobId;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        rider.isAvailable
          ? "border-success/40 bg-success/10 text-success"
          : busy
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border bg-muted text-muted-foreground"
      )}
    >
      {!rider.isAvailable && busy ? <Truck className="size-3" aria-hidden /> : null}
      {rider.isAvailable ? "Available" : busy ? "Busy — on delivery" : "Off duty"}
    </span>
  );
}

export default function AdminRidersPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.riders(), []);
  const [busy, setBusy] = useState<string | null>(null);

  /* confirmation guard: turning an available rider OFF affects assignments */
  const [confirmTarget, setConfirmTarget] = useState<Rider | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const toggle = async (rider: Rider, available: boolean) => {
    setBusy(rider.id);
    try {
      await apiOps.riderToggle(rider.id, available, user.id);
      await reload();
      toast({ title: `${rider.name} marked ${available ? "available" : "off duty"}` });
    } catch (e) {
      toast({ title: "Could not update rider", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const confirmOff = async () => {
    if (!confirmTarget) return;
    setConfirmBusy(true);
    try {
      await toggle(confirmTarget, false);
      setConfirmTarget(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading riders" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const inHouse = data.filter((r) => r.kind === "in_house");
  const contracted = data.filter((r) => r.kind === "contracted");

  const RiderTable = ({ rows }: { rows: Rider[] }) => (
    <>
      {/* desktop table */}
      <div className="table-scroll hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="p-3 font-semibold">Rider</th>
              <th className="p-3 font-semibold">Zones</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="hidden p-3 font-semibold lg:table-cell">Active job</th>
              <th className="hidden p-3 font-semibold md:table-cell">Last location</th>
              <th className="p-3 font-semibold">Completed</th>
              <th className="p-3 text-right font-semibold">Availability</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  <p className="font-medium">{r.name} {r.isDemo ? <span className="text-xs text-muted-foreground">(demo)</span> : null}</p>
                  <p className="text-xs text-muted-foreground">{r.phone} · {r.vehicle.replace(/_/g, " ")}</p>
                </td>
                <td className="p-3 text-muted-foreground">{r.zoneNames}</td>
                <td className="p-3"><StatusPill rider={r} /></td>
                <td className="hidden p-3 lg:table-cell">
                  {r.activeJobId && r.activeJobReference ? (
                    <Link href={`/admin/dispatch`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:underline">
                      <Link2 className="size-3.5" aria-hidden /> {r.activeJobReference}
                    </Link>
                  ) : r.activeJobId ? (
                    <span className="text-xs text-muted-foreground">On a job</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="hidden p-3 md:table-cell">
                  {r.lastLocationLabel ? (
                    <p className="text-xs text-muted-foreground">
                      <MapPin className="mr-1 inline size-3" aria-hidden />
                      {r.lastLocationLabel} · {r.lastLocationAt ? relativeTime(r.lastLocationAt) : ""}
                    </p>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not shared</span>
                  )}
                </td>
                <td className="p-3 tabular-nums text-muted-foreground">{r.completedJobs}</td>
                <td className="p-3 text-right">
                  {can("riders.manage") ? (
                    <Button
                      size="sm"
                      variant={r.isAvailable ? "outline" : "secondary"}
                      className="h-9"
                      disabled={busy === r.id || !!r.activeJobId}
                      onClick={() => (r.isAvailable ? setConfirmTarget(r) : toggle(r, true))}
                    >
                      {busy === r.id ? "Updating…" : r.activeJobId ? "Busy" : r.isAvailable ? "Mark off" : "Mark available"}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="divide-y md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {r.name} {r.isDemo ? <span className="text-xs text-muted-foreground">(demo)</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">{r.phone} · {r.vehicle.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">{r.zoneNames}</p>
              </div>
              <StatusPill rider={r} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {r.activeJobId && r.activeJobReference
                  ? `Active: ${r.activeJobReference}`
                  : r.activeJobId
                    ? "On a job"
                    : "No active job"}
                {` · ${r.completedJobs} completed`}
              </span>
              {r.lastLocationLabel ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden />
                  {r.lastLocationLabel}
                </span>
              ) : null}
            </div>
            {can("riders.manage") ? (
              <Button
                size="sm"
                variant={r.isAvailable ? "outline" : "secondary"}
                className="h-10 w-full"
                disabled={busy === r.id || !!r.activeJobId}
                onClick={() => (r.isAvailable ? setConfirmTarget(r) : toggle(r, true))}
              >
                {busy === r.id ? "Updating…" : r.activeJobId ? "Busy — cannot change while on a job" : r.isAvailable ? "Mark off duty" : "Mark available"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Riders</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          In-house and contracted riders, availability and active jobs. A rider with an active job is busy —
          the dispatch screen will not offer them for assignment. Riders only ever see their own jobs.
        </p>
      </div>

      {[
        { title: "In-house", icon: Bike, rows: inHouse },
        { title: "Contracted", icon: Users, rows: contracted },
      ].map((group) => (
        <section key={group.title} aria-labelledby={`riders-${group.title}`} className="overflow-hidden rounded-xl border bg-card">
          <h2 id={`riders-${group.title}`} className="flex items-center gap-2 border-b p-4 font-semibold">
            <group.icon className="size-5 text-primary" aria-hidden /> {group.title} riders ({group.rows.length})
          </h2>
          <RiderTable rows={group.rows} />
        </section>
      ))}

      <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        Location labels are consent-based demo values with their last update time — tracking is optional and
        never assumed. COD cash handling is not modelled here (cash ledger not yet connected). Riders log in
        at <span className="font-mono text-xs">/rider/login</span>.
      </p>

      {/* confirm marking a rider off duty */}
      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark {confirmTarget?.name} off duty?</DialogTitle>
            <DialogDescription>
              Available riders are offered for new assignments in Dispatch. Marking this rider off means
              they will not be offered jobs until marked available again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" className="h-11" onClick={() => setConfirmTarget(null)} disabled={confirmBusy}>
              Keep available
            </Button>
            <Button variant="secondary" className="h-11" onClick={confirmOff} disabled={confirmBusy}>
              {confirmBusy ? "Updating…" : "Mark off duty"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
