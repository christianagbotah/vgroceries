"use client";

/**
 * Dispatch control centre — operational workspace for delivery custody.
 *
 * Domain boundaries (Fulfilment + Stock Handover Authority #12):
 * - The "Awaiting assignment" queue contains orders that have ALREADY passed
 *   the authoritative fulfilment handover (stock consumed exactly once).
 *   Assignment is a dispatch-custody action that never touches stock.
 * - COD amounts are read-only operational context: "collection authority
 *   pending" — no collection or remittance is claimed or recorded here.
 * - Actions render from backend-derived `allowedActions` / `blockers` when
 *   supplied; the local status fallback exists only for demo parity.
 * - No GPS, no ETA, no fake provider status is invented.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Banknote, Bike, CalendarClock, ClipboardList, Landmark, MapPin, PackageCheck,
  Phone, RotateCw, Truck, Undo2, UserX, Users,
} from "lucide-react";
import type { DispatchJobAllowedAction, DispatchJobRow, DispatchProviderRow, DispatchReadyRow, DispatchRiderRow } from "@/services/contracts/dispatch";

type Queue = Awaited<ReturnType<typeof apiOps.dispatchQueue>>;

/** Human milestone labels for active delivery statuses. */
const MILESTONE_LABELS: Record<string, string> = {
  assigned: "Awaiting rider acceptance",
  accepted: "Rider accepted — awaiting store pickup",
  picked_up: "Picked up — awaiting departure",
  out_for_delivery: "Out for delivery",
  rescheduled: "Waiting for the new delivery window",
  failed: "Failure reported — dispatch decides next step",
  delivered: "Delivered",
  return_to_store: "Returned to store",
  unassigned: "Back in assignment queue",
};

const ACTIVE_JOB_STATUSES = ["assigned", "accepted", "picked_up", "out_for_delivery"];
const EXCEPTION_JOB_STATUSES = ["failed", "rescheduled"];

/** Fallback permitted actions when the server does not supply allowedActions. */
function fallbackAllowed(job: DispatchJobRow): DispatchJobAllowedAction[] {
  const out: DispatchJobAllowedAction[] = [];
  if (["assigned", "accepted"].includes(job.status)) out.push("unassign", "reassign");
  if (["failed", "rescheduled"].includes(job.status)) out.push("reassign", "reschedule", "return_to_store");
  if (["picked_up", "out_for_delivery"].includes(job.status)) out.push("return_to_store");
  return out;
}

const allowed = (job: DispatchJobRow, action: DispatchJobAllowedAction): boolean =>
  job.allowedActions && job.allowedActions.length ? job.allowedActions.includes(action) : fallbackAllowed(job).includes(action);

/** Friendly blocker text for ready orders. */
function blockerLabel(blocker: string): string {
  if (blocker.startsWith("payment_pending")) return "Payment still pending — do not dispatch yet";
  if (blocker.startsWith("payment_requires_review")) return "Payment under review — resolve before dispatching";
  return blocker;
}

export default function AdminDispatchPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.dispatchQueue(), []);

  /* ---- assignment dialog state (preserved across recoverable errors) ---- */
  const [assignTarget, setAssignTarget] = useState<DispatchReadyRow | null>(null);
  const [assignRider, setAssignRider] = useState<string>("");
  const [assignProvider, setAssignProvider] = useState<string>("");
  const [busy, setBusy] = useState(false);

  /* ---- manage-job dialog state ---- */
  const [jobTarget, setJobTarget] = useState<DispatchJobRow | null>(null);
  const [jobAction, setJobAction] = useState<"unassign" | "reschedule" | "return_to_store" | "reassign">("reschedule");
  const [jobWhen, setJobWhen] = useState("");
  const [jobNote, setJobNote] = useState("");
  const [jobRider, setJobRider] = useState("");

  const assign = async () => {
    if (!assignTarget) return;
    if (!assignRider && !assignProvider) {
      toast({ title: "Choose a rider or a provider booking", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiOps.dispatchAssign(
        assignTarget.id,
        assignRider ? { riderId: assignRider } : { providerId: assignProvider, manual: true },
        user.id
      );
      await reload();
      setAssignTarget(null);
      setAssignRider("");
      setAssignProvider("");
      toast({ title: "Assignment recorded", description: "The rider sees it immediately in their workspace. Inventory was already consumed at the fulfilment handover." });
    } catch (e) {
      // Choices are preserved in state; the dispatcher can adjust and retry.
      toast({ title: "Assignment failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const jobAct = async () => {
    if (!jobTarget) return;
    if (jobAction === "reschedule" && !jobWhen.trim()) {
      toast({ title: "Enter the new delivery window", variant: "destructive" });
      return;
    }
    if (jobAction === "reassign" && !jobRider) {
      toast({ title: "Choose a rider for the reassignment", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiOps.dispatchJobAction({
        action: jobAction,
        jobId: jobTarget.id,
        ...(jobAction === "reschedule" ? { when: jobWhen.trim() } : {}),
        ...(jobAction === "return_to_store" ? { note: jobNote.trim() || "Returned to store" } : {}),
        ...(jobAction === "reassign" ? { riderId: jobRider } : {}),
        ...(jobAction === "unassign" ? { note: jobNote.trim() || undefined } : {}),
        actor: user.id,
      });
      const descriptions: Record<typeof jobAction, string> = {
        unassign: "The rider is released; the order returns to the assignment queue. Stock was already consumed at handover.",
        reschedule: "Goods stay with the order for re-delivery — sellable stock is unchanged.",
        return_to_store: "Goods await Returns inspection — sellable stock is NOT re-added.",
        reassign: "The previous rider is released and the new rider takes over.",
      };
      toast({ title: `Job ${jobAction === "unassign" ? "unassigned" : jobAction === "reassign" ? "reassigned" : jobAction === "reschedule" ? "rescheduled" : "returned to store"}`, description: descriptions[jobAction] });
      await reload();
      setJobTarget(null);
      setJobWhen("");
      setJobNote("");
      setJobRider("");
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Deep link: /admin/dispatch?order=<id> pre-opens the assignment dialog
  // (used by the fulfilment handover queue). Runs once when data lands.
  useEffect(() => {
    if (!data) return;
    const target = new URLSearchParams(window.location.search).get("order");
    if (target) {
      const row = data.ready.find((o) => o.id === target);
      if (row) setAssignTarget(row);
    }
  }, [data]);

  const { readyOrders, activeJobs, exceptionJobs, doneJobs, codInFlight } = useMemo(() => {
    if (!data) return { readyOrders: [], activeJobs: [], exceptionJobs: [], doneJobs: [], codInFlight: false };
    const readyOrders = data.ready;
    const activeJobs = data.jobs.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status));
    const exceptionJobs = data.jobs.filter((j) => EXCEPTION_JOB_STATUSES.includes(j.status));
    const doneJobs = data.jobs.filter((j) => ["delivered", "return_to_store"].includes(j.status));
    const codInFlight = data.jobs.some((j) => j.cashToCollectLabel && ACTIVE_JOB_STATUSES.includes(j.status)) || readyOrders.some((o) => o.codAmountMinor > 0);
    return { readyOrders, activeJobs, exceptionJobs, doneJobs, codInFlight };
  }, [data]);

  const availableRiders = data?.riders.filter((r) => r.isAvailable) ?? [];
  const busyRiders = data?.riders.filter((r) => !r.isAvailable && r.activeJobId) ?? [];
  const offRiders = data?.riders.filter((r) => !r.isAvailable && !r.activeJobId) ?? [];

  const openManage = (job: DispatchJobRow, action: "unassign" | "reschedule" | "return_to_store" | "reassign") => {
    setJobTarget(job);
    setJobAction(action);
    setJobWhen("");
    setJobNote("");
    setJobRider("");
  };

  if (loading) return <LoadingState rows={6} label="Loading dispatch" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Dispatch</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Handed-over delivery orders waiting for assignment, active deliveries and exceptions.
            Inventory handover completed before each dispatch job — rider actions never alter sellable stock.
          </p>
        </div>
        <Button variant="outline" className="h-10" onClick={reload}>
          <RotateCw className="size-4" aria-hidden /> Refresh
        </Button>
      </div>

      {codInFlight ? (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <Banknote className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>COD — collection authority pending.</strong> Amounts shown below are operational context
            only. The cash ledger is not yet connected: no collection or rider remittance is recorded in this
            system.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-inmax(0,1fr)_330px] xl:grid-cols-inmax(0,1fr)_360px]">
        {/* ---------------- MAIN: the dispatch queue ---------------- */}
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="ds-ready">
            <h2 id="ds-ready" className="flex items-center gap-2 font-serif text-lg font-bold">
              <PackageCheck className="size-5 text-primary" aria-hidden /> Awaiting assignment
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{readyOrders.length}</span>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Handed-over delivery orders waiting for a rider or provider. Stock was consumed exactly once at
              the fulfilment handover.
            </p>
            {!readyOrders.length ? (
              <div className="mt-3"><EmptyState icon={PackageCheck} title="Nothing awaiting assignment" description="Orders appear here after the fulfilment handover to dispatch custody." /></div>
            ) : (
              <div className="mt-3 space-y-3">
                {readyOrders.map((o) => {
                  const blocked = (o.blockers ?? []).length > 0;
                  const canAssign = (o.allowedActions ?? ["assign"]).includes("assign") && !blocked;
                  return (
                    <article key={o.id} className="space-y-2 rounded-xl border bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline focus-visible:underline">{o.reference}</Link>
                          <p className="text-sm text-muted-foreground">
                            {o.customerName} · <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{o.zone ?? "—"}</span>
                          </p>
                          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" aria-hidden />{o.slotLabel ?? "no slot"}</span>
                            <span>{o.lineCount} lines</span>
                            <span>{o.totalLabel}</span>
                            {o.handedOverAt ? <span>handed over {formatDateTime(o.handedOverAt)} UTC</span> : null}
                            <a className="inline-flex items-center gap-1 text-primary hover:underline focus-visible:underline" href={`tel:${o.customerPhone.replace(/\s/g, "")}`}>
                              <Phone className="size-3.5" aria-hidden />{o.customerPhone}
                            </a>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <StatusBadge kind="payment" status={o.paymentStatus} />
                          {o.codAmountMinor > 0 ? (
                            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold" title="COD — collection authority pending; cash ledger not connected">
                              COD · collection authority pending
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {blocked ? (
                        <p role="status" className="flex items-center gap-2 rounded-lg bg-muted/70 px-3 py-2 text-sm text-muted-foreground">
                          <UserX className="size-4 shrink-0" aria-hidden />
                          {(o.blockers ?? []).map(blockerLabel).join(" · ")}
                        </p>
                      ) : null}
                      {can("dispatch.assign") && canAssign ? (
                        <Button className="h-10 w-full sm:w-auto" onClick={() => setAssignTarget(o)}>
                          <Truck className="size-4" aria-hidden /> Assign rider or provider
                        </Button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="ds-active">
            <h2 id="ds-active" className="flex items-center gap-2 font-serif text-lg font-bold">
              <Truck className="size-5 text-primary" aria-hidden /> Active deliveries
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{activeJobs.length}</span>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Accepted, picked-up and out-for-delivery jobs.</p>
            {!activeJobs.length ? (
              <div className="mt-3"><EmptyState icon={Truck} title="No active deliveries" /></div>
            ) : (
              <div className="mt-3 space-y-3">
                {activeJobs.map((j) => (
                  <article key={j.id} className="rounded-xl border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {j.orderReference} <span className="font-normal text-muted-foreground">· {j.customerName}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {j.riderName ? `Rider: ${j.riderName}` : j.providerName ? `Provider: ${j.providerName} (manual)` : "Unassigned"}
                          {" · "}{j.zone}
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-primary">{MILESTONE_LABELS[j.status] ?? j.status}</p>
                        {j.cashToCollectLabel ? (
                          <p className="mt-0.5 text-xs text-muted-foreground" title="COD — collection authority pending">
                            {j.cashToCollectLabel} due on delivery · cash ledger not connected
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge kind="delivery" status={j.status} />
                        {can("dispatch.assign") && allowed(j, "unassign") ? (
                          <Button size="sm" variant="outline" className="h-9" onClick={() => openManage(j, "unassign")}>
                            <UserX className="size-3.5" aria-hidden /> Unassign
                          </Button>
                        ) : null}
                        {can("dispatch.assign") && allowed(j, "reassign") ? (
                          <Button size="sm" variant="outline" className="h-9" onClick={() => openManage(j, "reassign")}>
                            <Users className="size-3.5" aria-hidden /> Reassign
                          </Button>
                        ) : null}
                        {can("dispatch.assign") && allowed(j, "return_to_store") ? (
                          <Button size="sm" variant="outline" className="h-9" onClick={() => openManage(j, "return_to_store")}>
                            <Undo2 className="size-3.5" aria-hidden /> Return to store
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="p-4">
                      <ol className="space-y-1.5 text-sm">
                        {j.events.slice(-4).reverse().map((e, i) => (
                          <li key={i} className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-muted-foreground">
                            <span>{e.action}</span>
                            <span className="whitespace-nowrap text-xs">{e.atLabel} UTC</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="ds-exceptions">
            <h2 id="ds-exceptions" className="flex items-center gap-2 font-serif text-lg font-bold">
              <CalendarClock className="size-5 text-primary" aria-hidden /> Exceptions
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{exceptionJobs.length}</span>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Failed and rescheduled deliveries. Dispatch decides: reschedule, reassign or return to store.
              Inventory is never re-added automatically.
            </p>
            {!exceptionJobs.length ? (
              <div className="mt-3"><EmptyState icon={CalendarClock} title="No exceptions" description="Failed or rescheduled deliveries appear here." /></div>
            ) : (
              <div className="mt-3 space-y-3">
                {exceptionJobs.map((j) => (
                  <article key={j.id} className="rounded-xl border border-warning/50 bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/30 p-4">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {j.orderReference} <span className="font-normal text-muted-foreground">· {j.customerName}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {j.riderName ? `Rider: ${j.riderName}` : "Rider released"}{" · "}{j.zone}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge kind="delivery" status={j.status} />
                        {can("dispatch.assign") && allowed(j, "reschedule") ? (
                          <Button size="sm" variant="outline" className="h-9" onClick={() => openManage(j, "reschedule")}>
                            <CalendarClock className="size-3.5" aria-hidden /> Reschedule
                          </Button>
                        ) : null}
                        {can("dispatch.assign") && allowed(j, "reassign") ? (
                          <Button size="sm" variant="outline" className="h-9" onClick={() => openManage(j, "reassign")}>
                            <Users className="size-3.5" aria-hidden /> Reassign
                          </Button>
                        ) : null}
                        {can("dispatch.assign") && allowed(j, "return_to_store") ? (
                          <Button size="sm" variant="outline" className="h-9" onClick={() => openManage(j, "return_to_store")}>
                            <Undo2 className="size-3.5" aria-hidden /> Return to store
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {j.failureReason ? (
                      <p className="border-b border-warning/30 bg-destructive/5 p-3 text-sm text-destructive">
                        Failed: {j.failureReason}
                      </p>
                    ) : null}
                    {j.rescheduledFor ? (
                      <p className="border-b border-warning/30 bg-muted/40 p-3 text-sm">
                        <span className="font-medium">Rescheduled for {formatDateTime(j.rescheduledFor)} UTC</span>
                        {j.failureReason ? <span className="text-muted-foreground"> — prior reason: {j.failureReason}</span> : null}
                      </p>
                    ) : null}
                    <div className="p-4">
                      <ol className="space-y-1.5 text-sm">
                        {j.events.slice(-4).reverse().map((e, i) => (
                          <li key={i} className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-muted-foreground">
                            <span>{e.action}</span>
                            <span className="whitespace-nowrap text-xs">{e.atLabel} UTC</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="ds-history">
            <h2 id="ds-history" className="flex items-center gap-2 font-serif text-lg font-bold">
              <ClipboardList className="size-5 text-primary" aria-hidden /> Completed
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{doneJobs.length}</span>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Delivered jobs with proof of delivery, and terminal return-to-store outcomes.</p>
            {!doneJobs.length ? (
              <div className="mt-3"><EmptyState title="No completed jobs yet" /></div>
            ) : (
              <div className="mt-3 overflow-hidden rounded-xl border bg-card">
                <div className="table-scroll">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left">
                      <tr>
                        <th className="p-3 font-semibold">Order</th>
                        <th className="p-3 font-semibold">Outcome</th>
                        <th className="p-3 font-semibold">Proof</th>
                        <th className="p-3 font-semibold">COD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doneJobs.map((j) => (
                        <tr key={j.id} className="border-t">
                          <td className="p-3 font-medium">
                            <Link href={`/admin/orders/${j.orderId}`} className="hover:underline focus-visible:underline">{j.orderReference}</Link>
                            <p className="text-xs text-muted-foreground">{j.riderName}</p>
                          </td>
                          <td className="p-3">
                            <StatusBadge kind="delivery" status={j.status} />
                            {j.status === "return_to_store" ? (
                              <p className="mt-1 text-xs text-muted-foreground">Awaiting Returns inspection</p>
                            ) : null}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {j.proof ? `${j.proof.method}: ${j.proof.detail}` : "—"}
                          </td>
                          <td className="p-3 text-xs">
                            {j.cashToCollectLabel ? (
                              <span className="text-muted-foreground" title="COD — collection authority pending; cash ledger not connected">
                                due on delivery · authority pending
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ---------------- SIDEBOARD: riders & providers ---------------- */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start" aria-label="Fleet and providers">
          <section aria-labelledby="ds-riders" className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b p-3">
              <h2 id="ds-riders" className="flex items-center gap-2 font-semibold">
                <Users className="size-4 text-primary" aria-hidden /> Riders
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {availableRiders.length} free · {busyRiders.length} on job · {offRiders.length} off
              </span>
            </div>
            <ul className="divide-y">
              {data.riders.map((r: DispatchRiderRow) => (
                <li key={r.id} className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {r.name}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{r.kind.replace(/_/g, " ")}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.vehicle} · {r.zones.join(", ")}
                      {typeof r.completedJobs === "number" ? ` · ${r.completedJobs} completed` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
                      r.isAvailable
                        ? "border-success/40 bg-success/10 text-success"
                        : r.activeJobId
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-muted text-muted-foreground"
                    )}
                    title={r.unavailableReason}
                  >
                    {r.isAvailable ? "Available" : r.activeJobId ? "On a job" : "Off"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="p-3 text-xs text-muted-foreground">
              Rider location sharing is optional and consent-based. No live tracking is claimed.
            </p>
          </section>

          <section aria-labelledby="ds-providers" className="rounded-xl border bg-card">
            <div className="border-b p-3">
              <h2 id="ds-providers" className="flex items-center gap-2 font-semibold">
                <Landmark className="size-4 text-primary" aria-hidden /> External providers
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Manual bookings only — no provider API is connected.</p>
            </div>
            <ul className="divide-y">
              {data.providers.filter((p: DispatchProviderRow) => p.id !== "prv_inhouse").map((p: DispatchProviderRow) => (
                <li key={p.id} className="p-3">
                  <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                    {p.name}
                    <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {p.status === "not_connected" ? "Not connected" : p.status}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.capabilities.join(" · ")}</p>
                  <p className="text-xs text-muted-foreground">{p.notes}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="ds-stocknote" className="rounded-xl border border-dashed bg-muted/30 p-3">
            <h2 id="ds-stocknote" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <PackageCheck className="size-4" aria-hidden /> Inventory boundary
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Stock is consumed exactly once at the fulfilment handover — before assignment. Unassigning,
              failing or returning to store never re-adds sellable stock; returned goods await Returns
              inspection.
            </p>
          </section>
        </aside>
      </div>

      {/* assign dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign {assignTarget?.reference}</DialogTitle>
            <DialogDescription>
              {assignTarget?.zone} · {assignTarget?.customerName} · {assignTarget?.slotLabel}
              {assignTarget?.handedOverAt ? ` · handed over ${formatDateTime(assignTarget.handedOverAt)} UTC` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="assign-rider">In-house or contracted rider</Label>
              <Select value={assignRider} onValueChange={(v) => { setAssignRider(v === "none" ? "" : v); setAssignProvider(""); }}>
                <SelectTrigger id="assign-rider" className="h-11 w-full"><SelectValue placeholder="Choose an available rider" /></SelectTrigger>
                <SelectContent>
                  {availableRiders.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} · {r.kind.replace(/_/g, " ")} · {r.zones.join(", ")}
                    </SelectItem>
                  ))}
                  {!availableRiders.length ? <SelectItem value="none" disabled>No riders available</SelectItem> : null}
                </SelectContent>
              </Select>
              {busyRiders.length || offRiders.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {busyRiders.length ? `${busyRiders.length} rider${busyRiders.length === 1 ? "" : "s"} on an active delivery` : ""}
                  {busyRiders.length && offRiders.length ? " · " : ""}
                  {offRiders.length ? `${offRiders.length} off duty` : ""}
                  {" — not selectable."}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex-1 border-t" aria-hidden /> or book externally <span className="flex-1 border-t" aria-hidden />
            </div>
            <div>
              <Label htmlFor="assign-provider">External provider (manual booking)</Label>
              <Select value={assignProvider} onValueChange={(v) => { setAssignProvider(v); setAssignRider(""); }}>
                <SelectTrigger id="assign-provider" className="h-11 w-full"><SelectValue placeholder="Choose a provider" /></SelectTrigger>
                <SelectContent>
                  {data.providers.filter((p) => p.id !== "prv_inhouse").map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.status === "not_connected" ? "manual booking (not integrated)" : "configured"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Provider APIs are not connected. A manual booking records the handover; staff update the
                status themselves.
              </p>
            </div>
            <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
              Inventory handover completed before this dispatch job. Assigning a rider does not alter
              sellable stock.
            </p>
          </div>
          <DialogFooter>
            <Button className="h-11" onClick={assign} disabled={busy || (!assignRider && !assignProvider)}>
              {busy ? "Assigning…" : "Assign job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* manage job dialog — unassign / reschedule / reassign / return to store */}
      <Dialog open={!!jobTarget} onOpenChange={(o) => !o && setJobTarget(null)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage job {jobTarget?.orderReference}</DialogTitle>
            <DialogDescription>
              Choose the next dispatch action. Stock was consumed at the fulfilment handover — none of these
              actions change sellable inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="job-action">Action</Label>
              <Select value={jobAction} onValueChange={(v) => setJobAction(v as typeof jobAction)}>
                <SelectTrigger id="job-action" className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassign" disabled={!jobTarget || !allowed(jobTarget, "unassign")}>
                    Unassign rider {jobTarget && !allowed(jobTarget, "unassign") ? "(only while assigned/accepted)" : ""}
                  </SelectItem>
                  <SelectItem value="reassign" disabled={!jobTarget || !allowed(jobTarget, "reassign")}>
                    Reassign to another rider {jobTarget && !allowed(jobTarget, "reassign") ? "(not permitted now)" : ""}
                  </SelectItem>
                  <SelectItem value="reschedule" disabled={!jobTarget || !allowed(jobTarget, "reschedule")}>
                    Reschedule to a new window {jobTarget && !allowed(jobTarget, "reschedule") ? "(not permitted now)" : ""}
                  </SelectItem>
                  <SelectItem value="return_to_store" disabled={!jobTarget || !allowed(jobTarget, "return_to_store")}>
                    Return goods to store (await inspection)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {jobAction === "reschedule" ? (
              <div>
                <Label htmlFor="job-when">New window</Label>
                <Input id="job-when" className="h-11" value={jobWhen} onChange={(e) => setJobWhen(e.target.value)} placeholder="e.g. tomorrow 16:00–18:00" />
                {jobTarget?.rescheduledFor ? (
                  <p className="mt-1 text-xs text-muted-foreground">Currently scheduled for {formatDateTime(jobTarget.rescheduledFor)} UTC.</p>
                ) : null}
                {jobTarget?.failureReason ? (
                  <p className="mt-1 text-xs text-muted-foreground">Prior failure: {jobTarget.failureReason}</p>
                ) : null}
              </div>
            ) : jobAction === "reassign" ? (
              <div>
                <Label htmlFor="job-rider">New rider</Label>
                <Select value={jobRider} onValueChange={setJobRider}>
                  <SelectTrigger id="job-rider" className="h-11 w-full"><SelectValue placeholder="Choose an available rider" /></SelectTrigger>
                  <SelectContent>
                    {availableRiders.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} · {r.zones.join(", ")}
                      </SelectItem>
                    ))}
                    {!availableRiders.length ? <SelectItem value="none" disabled>No riders available</SelectItem> : null}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  The current rider is released and becomes available again.
                </p>
              </div>
            ) : jobAction === "return_to_store" ? (
              <div>
                <Label htmlFor="job-note">Note</Label>
                <Input id="job-note" className="h-11" value={jobNote} onChange={(e) => setJobNote(e.target.value)} placeholder="e.g. customer unreachable after two attempts" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Returned goods await Returns inspection — restock, quarantine or damage is decided there.
                  Sellable stock is <strong>not</strong> automatically restored.
                </p>
              </div>
            ) : (
              <div>
                <Label htmlFor="job-unassign-note">Note (optional)</Label>
                <Input id="job-unassign-note" className="h-11" value={jobNote} onChange={(e) => setJobNote(e.target.value)} placeholder="e.g. rider unavailable for this window" />
                <p className="mt-1 text-xs text-muted-foreground">
                  The order returns to the assignment queue. The rider becomes available for other jobs.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant={jobAction === "return_to_store" ? "destructive" : "default"}
              className="h-11"
              onClick={jobAct}
              disabled={busy || (jobAction === "reschedule" && !jobWhen.trim()) || (jobAction === "reassign" && !jobRider)}
            >
              {busy ? "Working…" : jobAction === "return_to_store" ? (
                <><Undo2 className="size-4" aria-hidden /> Return to store</>
              ) : jobAction === "reassign" ? (
                <><Users className="size-4" aria-hidden /> Reassign</>
              ) : jobAction === "unassign" ? (
                <><UserX className="size-4" aria-hidden /> Unassign</>
              ) : (
                <><CalendarClock className="size-4" aria-hidden /> Reschedule</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
