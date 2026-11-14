"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, X, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Adjustment = Awaited<ReturnType<typeof apiOps.adjustments>>[number];
const liveAdjustment = Boolean(process.env.NEXT_PUBLIC_API_BASE_URL);
type Review = { row: Adjustment; decision: "approve" | "reject" };

export default function AdminAdjustmentsPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.adjustments(), []);
  const { data: lots, loading: lotsLoading } = useApiData(() => apiOps.lots(), []);
  const [lotId, setLotId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const retryKey = useRef<string | null>(null);

  const eligible = useMemo(() => (lots ?? []).filter((lot) =>
    lot.kind === "regular" && !lot.isQuarantined && !lot.expired), [lots]);
  const selectedLot = eligible.find((lot) => lot.id === lotId);
  const rows = useMemo(() => (data ?? []).filter((row) =>
    filter === "all" || row.status === filter), [data, filter]);
  const pending = (data ?? []).filter((row) => row.status === "pending_approval");
  const canApprove = user.role === "owner_admin";

  function fieldChanged() { retryKey.current = null; }
  async function request() {
    if (busy || !selectedLot) return;
    if (!/^[+-]?(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(delta) || Number(delta) === 0) {
      toast({ title: "Enter a non-zero signed quantity (maximum 3 decimals)", variant: "destructive" });
      return;
    }
    if (reason.trim().length < 8) {
      toast({ title: "Provide a clear reason (at least 8 characters)", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (!retryKey.current) retryKey.current = crypto.randomUUID();
      await apiOps.adjustmentCreate({
        variantId: selectedLot.variantId, lotId: selectedLot.id, delta,
        reason: reason.trim(), note: note.trim() || undefined,
        ...(!liveAdjustment ? { actor: user.id } : {}),
      }, retryKey.current);
      retryKey.current = null;
      setLotId("");
      setDelta("");
      setReason("");
      setNote("");
      await reload();
      toast({ title: "Correction requested", description: "Stock remains unchanged until a different administrator approves." });
    } catch (e) {
      toast({ title: "Request failed", description: e instanceof ApiError ? e.message : "The request was not confirmed. Retry without changing it.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function decide() {
    if (!review || busy) return;
    setBusy(true);
    try {
      await apiOps.adjustmentDecide(review.row.id, review.decision, user.id);
      await reload();
      toast({ title: review.decision === "approve"
        ? "Correction approved, applied and audited" : "Correction rejected — physical stock unchanged" });
      setReview(null);
    } catch (e) {
      toast({ title: "Decision failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState rows={5} label="Loading adjustment history" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Stock adjustments</h1>
          <p className="text-sm text-muted-foreground">
            Physical stock corrections require a documented reason and separate approval.
          </p>
        </div>
        <Button asChild variant="outline" className="h-11">
          <Link href="/admin/inventory"><ArrowLeft className="size-4" aria-hidden /> Stock overview</Link>
        </Button>
      </header>

      <div className="flex gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p>
          {liveAdjustment ? "Live approval control: " : "Demonstration control: "}
          a stock officer or administrator requests a correction. A <strong>different administrator</strong>
          must approve it. Reservations for active orders are protected, and every approved change
          creates a stock movement with before-and-after audit values.
        </p>
      </div>
      {pending.length > 0 ? (
        <div role="status" className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <strong>{pending.length} correction{pending.length !== 1 ? "s" : ""} awaiting a decision</strong>
        </div>
      ) : null}

      {can("inventory.adjust") ? (
        <section aria-labelledby="adjust-form-title" className="space-y-3 rounded-xl border bg-card p-4">
          <h2 id="adjust-form-title" className="font-semibold">Request a physical quantity correction</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="adjust-lot">Affected stock lot</Label>
              <Select value={lotId} onValueChange={(v) => { fieldChanged(); setLotId(v); }}>
                <SelectTrigger id="adjust-lot" className="h-11 w-full">
                  <SelectValue placeholder={lotsLoading ? "Loading recorded lots" : "Select an eligible lot"} />
                </SelectTrigger>
                <SelectContent>
                  {eligible.slice(0, 100).map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.productName} · {lot.variantName} · {lot.lotNumber} · {lot.quantity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="adjust-qty">Signed change (e.g. -2 or +3)</Label>
              <Input id="adjust-qty" className="h-11 font-mono" inputMode="decimal"
                value={delta} placeholder="-2"
                onChange={(e) => { fieldChanged(); setDelta(e.target.value); }} />
            </div>
            <div>
              <Label htmlFor="adjust-reason">Reason for correction</Label>
              <Input id="adjust-reason" className="h-11" maxLength={200}
                value={reason} placeholder="Physical recount discrepancy"
                onChange={(e) => { fieldChanged(); setReason(e.target.value); }} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="adjust-note">Supporting note (optional)</Label>
              <Textarea id="adjust-note" rows={2} maxLength={1000} value={note}
                placeholder="Evidence, physical recount, incident number and any relevant observations"
                onChange={(e) => { fieldChanged(); setNote(e.target.value); }} />
            </div>
          </div>
          <Button onClick={() => void request()} className="h-11" disabled={busy || !selectedLot}>
            {busy ? "Recording request…" : "Submit for independent approval"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Unsafe, expired, damaged or quarantined lots are excluded from regular adjustments.
            Those need a separate governed disposal or quarantine workflow.
          </p>
        </section>
      ) : (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          Your account cannot request physical stock corrections.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Adjustment history</h2>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-11 w-full sm:w-48" aria-label="Filter adjustments"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All requests</SelectItem>
            <SelectItem value="pending_approval">Pending approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No stock correction requests" description="New requests will appear here with their approval status." />
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const approveAllowed = canApprove && row.status === "pending_approval" &&
              (!liveAdjustment || row.requestedById !== user.id);
            return (
              <article key={row.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{row.productName} · {row.variantName}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Lot {row.lotNumber ?? "—"} · {row.atLabel} UTC · Requested by {row.requestedBy ?? "Unknown"}
                    </p>
                  </div>
                  <StatusBadge kind="generic" status={row.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <span className={cn("font-mono font-bold tabular-nums",
                    row.delta.startsWith("-") ? "text-destructive" : "text-success")}>
                    Change {row.delta.startsWith("-") ? row.delta : `+${row.delta}`}
                  </span>
                  {row.beforeQuantity ? <span>Before: <strong>{row.beforeQuantity}</strong></span> : null}
                  {row.afterQuantity ? <span>After: <strong>{row.afterQuantity}</strong></span> : null}
                  <span className="min-w-0 break-words">Reason: {row.reason}</span>
                </div>
                {row.note ? <p className="mt-2 text-sm text-muted-foreground">{row.note}</p> : null}
                {row.approvedBy ? <p className="mt-2 text-xs text-muted-foreground">Reviewed by {row.approvedBy}</p> : null}
                {approveAllowed ? (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" className="h-11" disabled={busy}
                      onClick={() => setReview({ row, decision: "reject" })}>
                      <X className="size-4" aria-hidden /> Reject
                    </Button>
                    <Button size="sm" className="h-11" disabled={busy}
                      onClick={() => setReview({ row, decision: "approve" })}>
                      <Check className="size-4" aria-hidden /> Approve
                    </Button>
                  </div>
                ) : row.status === "pending_approval" && row.requestedById === user.id ? (
                  <p className="mt-3 text-xs text-muted-foreground">Awaiting a different administrator’s decision.</p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(review)} onOpenChange={(open) => { if (!open && !busy) setReview(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {review?.decision === "approve" ? "Approve stock correction?" : "Reject stock correction?"}
            </DialogTitle>
            <DialogDescription>
              {review?.decision === "approve"
                ? "Approval will update the physical quantity and create an immutable movement and audit record."
                : "Rejection will leave physical stock unchanged and record your decision."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{review?.row.productName} · {review?.row.lotNumber}</p>
            <p className="mt-1 font-mono">{review?.row.delta}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" disabled={busy}
              onClick={() => setReview(null)}>Cancel</Button>
            <Button className="h-11" disabled={busy}
              variant={review?.decision === "reject" ? "destructive" : "default"}
              onClick={() => void decide()}>
              {busy ? "Recording…" : review?.decision === "approve" ? "Confirm approval" : "Confirm rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
