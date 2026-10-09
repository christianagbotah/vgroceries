"use client";

import Link from "next/link";
import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import { Bike, PackageCheck, Truck, Users, RotateCw, Banknote, Undo2, CalendarClock } from "lucide-react";

type Queue = Awaited<ReturnType<typeof apiOps.dispatchQueue>>;
type ReadyOrder = Queue["ready"][number];
type Job = Queue["jobs"][number];
type RiderRow = Queue["riders"][number];

export default function AdminDispatchPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.dispatchQueue(), []);

  const [assignTarget, setAssignTarget] = useState<ReadyOrder | null>(null);
  const [assignRider, setAssignRider] = useState<string>("");
  const [assignProvider, setAssignProvider] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // reschedule / return-to-store dialog
  const [jobTarget, setJobTarget] = useState<Job | null>(null);
  const [jobAction, setJobAction] = useState<"reschedule" | "return_to_store">("reschedule");
  const [jobWhen, setJobWhen] = useState("");
  const [jobNote, setJobNote] = useState("");

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
      toast({ title: "Job assigned", description: "The rider sees it immediately in their workspace." });
    } catch (e) {
      toast({ title: "Assignment failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const jobAct = async () => {
    if (!jobTarget) return;
    setBusy(true);
    try {
      if (jobAction === "reschedule") {
        await apiOps.dispatchJobAction({ action: "reschedule", jobId: jobTarget.id, when: jobWhen || "next available window", actor: user.id });
        toast({ title: "Job rescheduled", description: "Goods stay with the order — no stock re-add." });
      } else {
        await apiOps.dispatchJobAction({ action: "return_to_store", jobId: jobTarget.id, note: jobNote || "Returned to store", actor: user.id });
        toast({ title: "Returned to store", description: "Goods quarantined for inspection — not resold automatically." });
      }
      await reload();
      setJobTarget(null);
      setJobWhen("");
      setJobNote("");
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState rows={6} label="Loading dispatch" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const activeJobs = data.jobs.filter((j) => !["delivered", "return_to_store"].includes(j.status));
  const doneJobs = data.jobs.filter((j) => ["delivered", "return_to_store"].includes(j.status));
  const unremitted = data.riders.filter((r) => r.pendingRemittanceMinor > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Dispatch</h1>
          <p className="text-sm text-muted-foreground">
            Assign packed orders to in-house or contracted riders, or book external providers
            manually. Failed deliveries can be rescheduled or returned to store.
          </p>
        </div>
        <Button variant="outline" className="h-10" onClick={reload}>
          <RotateCw className="size-4" aria-hidden /> Refresh
        </Button>
      </div>

      {unremitted.length ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <Banknote className="size-4" aria-hidden />
          <p>
            <strong>Remittance pending:</strong>{" "}
            {unremitted.map((r) => `${r.name} (${r.pendingRemittanceLabel})`).join(" · ")} — collect and
            reconcile at the rider screen.
          </p>
        </div>
      ) : null}

      <Tabs defaultValue="ready">
        <TabsList className="h-12 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="ready" className="gap-1.5 px-4"><PackageCheck className="size-4" aria-hidden /> Ready to assign ({data.ready.length})</TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5 px-4"><Truck className="size-4" aria-hidden /> Active jobs ({activeJobs.length})</TabsTrigger>
          <TabsTrigger value="riders" className="gap-1.5 px-4"><Users className="size-4" aria-hidden /> Riders</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 px-4"><Bike className="size-4" aria-hidden /> History ({doneJobs.length})</TabsTrigger>
        </TabsList>

        {/* ready to assign */}
        <TabsContent value="ready" className="mt-4">
          {!data.ready.length ? (
            <EmptyState icon={PackageCheck} title="Nothing ready to dispatch" description="Packed delivery orders appear here for assignment." />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.ready.map((o) => (
                <article key={o.id} className="space-y-2 rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline focus-visible:underline">{o.reference}</Link>
                      <p className="text-sm text-muted-foreground">{o.customerName} · {o.zone}</p>
                      <p className="text-xs text-muted-foreground">{o.slotLabel ?? ""} · {o.lineCount} lines · {o.totalLabel}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <StatusBadge kind="payment" status={o.paymentStatus} />
                      {o.codAmountMinor > 0 ? (
                        <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold">
                          COD to collect
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {can("dispatch.assign") ? (
                    <Button className="h-10 w-full sm:w-auto" onClick={() => setAssignTarget(o)}>
                      <Truck className="size-4" aria-hidden /> Assign rider or provider
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        {/* active jobs */}
        <TabsContent value="jobs" className="mt-4">
          {!activeJobs.length ? (
            <EmptyState icon={Truck} title="No active jobs" />
          ) : (
            <div className="space-y-3">
              {activeJobs.map((j) => (
                <article key={j.id} className="rounded-xl border bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                    <div>
                      <p className="font-semibold">
                        {j.orderReference} <span className="font-normal text-muted-foreground">· {j.customerName}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {j.riderName ? `Rider: ${j.riderName}` : j.providerName ? `Provider: ${j.providerName} (manual)` : "Unassigned"}
                        {" · "}
                        {j.zone}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge kind="delivery" status={j.status} />
                      {j.cashToCollectLabel ? (
                        <span className="text-xs text-muted-foreground">
                          {j.cashToCollectLabel}
                          {j.cashCollectedAt ? " collected" : " to collect"}
                          {j.remittedAt ? " · remitted" : ""}
                        </span>
                      ) : null}
                      {can("dispatch.assign") && ["failed", "rescheduled", "out_for_delivery", "picked_up"].includes(j.status) ? (
                        <Button size="sm" variant="outline" className="h-9" onClick={() => { setJobTarget(j); setJobAction(j.status === "failed" ? "reschedule" : "return_to_store"); }}>
                          <CalendarClock className="size-3.5" aria-hidden /> Manage
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {j.failureReason ? (
                    <p className="border-b bg-destructive/5 p-3 text-sm text-destructive">Failed: {j.failureReason}{j.rescheduledFor ? ` · rescheduled for ${formatDateTime(j.rescheduledFor)} UTC` : ""}</p>
                  ) : null}
                  <div className="p-4">
                    <ol className="space-y-1.5 text-sm">
                      {j.events.slice(-4).reverse().map((e, i) => (
                        <li key={i} className="flex justify-between gap-2 text-muted-foreground">
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
        </TabsContent>

        {/* riders */}
        <TabsContent value="riders" className="mt-4">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="p-3 font-semibold">Rider</th>
                    <th className="p-3 font-semibold">Type</th>
                    <th className="p-3 font-semibold">Zones</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 text-right font-semibold">Unremitted cash</th>
                  </tr>
                </thead>
                <tbody>
                  {data.riders.map((r: RiderRow) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">
                        <p className="font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.phone} · {r.vehicle}</p>
                      </td>
                      <td className="p-3 capitalize text-muted-foreground">{r.kind.replace(/_/g, " ")}</td>
                      <td className="p-3 text-muted-foreground">{r.zones.join(", ")}</td>
                      <td className="p-3">
                        {r.isAvailable ? (
                          <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Available</span>
                        ) : (
                          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            {r.activeJobId ? "On a job" : "Off"}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-medium tabular-nums">{r.pendingRemittanceLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Rider location sharing is permission-based and optional — see the rider workspace.
          </p>
        </TabsContent>

        {/* history */}
        <TabsContent value="history" className="mt-4">
          {!doneJobs.length ? (
            <EmptyState title="No completed jobs yet" />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left">
                    <tr>
                      <th className="p-3 font-semibold">Order</th>
                      <th className="p-3 font-semibold">Outcome</th>
                      <th className="p-3 font-semibold">Proof</th>
                      <th className="p-3 font-semibold">Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doneJobs.map((j) => (
                      <tr key={j.id} className="border-t">
                        <td className="p-3 font-medium">
                          <Link href={`/admin/orders/${j.orderId}`} className="hover:underline focus-visible:underline">{j.orderReference}</Link>
                          <p className="text-xs text-muted-foreground">{j.riderName}</p>
                        </td>
                        <td className="p-3"><StatusBadge kind="delivery" status={j.status} /></td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {j.proof ? `${j.proof.method}: ${j.proof.detail}` : "—"}
                        </td>
                        <td className="p-3 text-xs">
                          {j.cashToCollectLabel ? (
                            j.remittedAt ? <span className="text-success">collected &amp; remitted</span> : j.cashCollectedAt ? <span className="text-[color:var(--warning-foreground)]">collected, awaiting remittance</span> : "not collected"
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* assign dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign {assignTarget?.reference}</DialogTitle>
            <DialogDescription>
              {assignTarget?.zone} · {assignTarget?.customerName} · {assignTarget?.slotLabel}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>In-house or contracted rider</Label>
              <Select value={assignRider} onValueChange={(v) => { setAssignRider(v); setAssignProvider(""); }}>
                <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Choose an available rider" /></SelectTrigger>
                <SelectContent>
                  {data.riders.filter((r) => r.isAvailable).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} · {r.kind.replace(/_/g, " ")} · {r.zones.join(", ")}
                    </SelectItem>
                  ))}
                  {!data.riders.some((r) => r.isAvailable) ? <SelectItem value="none" disabled>No riders available</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex-1 border-t" aria-hidden /> or book externally <span className="flex-1 border-t" aria-hidden />
            </div>
            <div>
              <Label>External provider (manual booking)</Label>
              <Select value={assignProvider} onValueChange={(v) => { setAssignProvider(v); setAssignRider(""); }}>
                <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Choose a provider" /></SelectTrigger>
                <SelectContent>
                  {data.providers.filter((p) => p.id !== "prv_inhouse").map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.status === "not_connected" ? "manual booking (not integrated)" : "configured"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Provider APIs are not connected. Manual booking records the handover; status is
                updated by staff.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button className="h-11" onClick={assign} disabled={busy || (!assignRider && !assignProvider)}>
              {busy ? "Assigning…" : "Assign job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* manage job dialog */}
      <Dialog open={!!jobTarget} onOpenChange={(o) => !o && setJobTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage job {jobTarget?.orderReference}</DialogTitle>
            <DialogDescription>Failed deliveries can be rescheduled or returned to store.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Action</Label>
              <Select value={jobAction} onValueChange={(v) => setJobAction(v as typeof jobAction)}>
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reschedule">Reschedule to a new window</SelectItem>
                  <SelectItem value="return_to_store">Return goods to store (quarantine)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {jobAction === "reschedule" ? (
              <div>
                <Label htmlFor="job-when">New window</Label>
                <Input id="job-when" className="h-11" value={jobWhen} onChange={(e) => setJobWhen(e.target.value)} placeholder="e.g. tomorrow 16:00–18:00" />
              </div>
            ) : (
              <div>
                <Label htmlFor="job-note">Note</Label>
                <Input id="job-note" className="h-11" value={jobNote} onChange={(e) => setJobNote(e.target.value)} placeholder="e.g. customer unreachable after two attempts" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Returning to store does <strong>not</strong> re-add stock — the goods enter
                  quarantine for inspection.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant={jobAction === "return_to_store" ? "destructive" : "default"} className="h-11" onClick={jobAct} disabled={busy}>
              {jobAction === "return_to_store" ? <><Undo2 className="size-4" aria-hidden /> Return to store</> : <><CalendarClock className="size-4" aria-hidden /> Reschedule</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
