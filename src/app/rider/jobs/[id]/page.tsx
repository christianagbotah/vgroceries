"use client";

/**
 * Rider job detail (mobile-first operational screen).
 *
 * Lifecycle: assigned → accepted → picked_up → out_for_delivery → delivered
 * (with POD) or failed → dispatch decides reschedule / return-to-store.
 *
 * Boundaries:
 * - Stock was consumed exactly once at the fulfilment handover — every rider
 *   action here is custody/progress only and never touches inventory.
 * - "Mark delivered" requires proof and records a delivery event only. COD
 *   amounts are read-only context: collection authority pending.
 * - This rider only ever sees their own job (ownership enforced server-side;
 *   in production the backend derives identity from the session).
 * - No GPS, no ETA. The map link opens an external maps app search using the
 *   address data exactly as recorded — nothing is geocoded or tracked here.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiOps, ApiError, type RiderJobView } from "@/services/client";
import { useRiderSession } from "@/components/layout/rider-shell";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import { Ban, Banknote, Check, MapPin, Package, Phone, Send, Truck } from "lucide-react";

/** Friendly failure reasons presented as choices; the note adds context.
 *  The backend contract keeps the reason a free string — this is UI affordance. */
const FAIL_REASONS = [
  { value: "Customer unavailable — not at address", label: "Customer unavailable" },
  { value: "Customer refused delivery", label: "Customer refused" },
  { value: "Address problem — could not locate", label: "Address problem" },
  { value: "Unable to contact customer", label: "Could not contact" },
  { value: "Access or safety issue at location", label: "Access / safety issue" },
  { value: "Vehicle or operational problem", label: "Vehicle problem" },
  { value: "Other — see note", label: "Other" },
] as const;

export default function RiderJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { riderId, ready } = useRiderSession();
  const { toast } = useToast();

  const [job, setJob] = useState<RiderJobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [proofOpen, setProofOpen] = useState(false);
  const [proofMethod, setProofMethod] = useState<"pin" | "signature" | "photo_note">("pin");
  const [proofDetail, setProofDetail] = useState("");

  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState<string>(FAIL_REASONS[0].value);
  const [failNote, setFailNote] = useState("");

  const [note, setNote] = useState("");
  const [notePending, setNotePending] = useState<string | null>(null); // interrupted connectivity: keep unsent note visible

  const load = useCallback(async () => {
    try {
      // riderId scopes ownership: the job must belong to this rider.
      setJob(await apiOps.riderJob(id, riderId ?? undefined));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this job.");
    }
  }, [id, riderId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!ready) return;
    if (!riderId) router.replace("/rider/login");
  }, [ready, riderId, router]);

  const act = async (action: string, extra: Record<string, unknown> = {}, successNote: string) => {
    if (!riderId) return;
    setBusy(true);
    try {
      await apiOps.riderAction({ action, riderId, jobId: id, ...extra });
      await load();
      toast({ title: successNote });
    } catch (e) {
      toast({
        title: "Action not completed",
        description: e instanceof ApiError ? e.message : "The action did not go through — nothing was recorded.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!note.trim() || !riderId) return;
    setNotePending(note); // keep clearly pending until confirmed
    try {
      await apiOps.riderAction({ action: "note", riderId, jobId: id, note });
      setNote("");
      setNotePending(null);
      await load();
      toast({ title: "Note delivered" });
    } catch {
      toast({ title: "Note still pending", description: "It is kept on screen and not recorded as delivered. Try again when you have signal.", variant: "destructive" });
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!job) return <LoadingState rows={3} label="Loading job" />;

  const step = job.status;
  const mapsQuery = job.address
    ? encodeURIComponent([job.address.ghanaPostGps, job.address.line1].filter(Boolean).join(" "))
    : null;

  return (
    <div className="space-y-4 pb-6">
      {/* job header */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-bold">{job.orderReference}</h1>
          <StatusBadge kind="delivery" status={job.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {job.zone} · {job.items.length} items
        </p>
        {job.cashToCollectLabel ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-sm" title="COD — collection authority pending">
            <Banknote className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>{job.cashToCollectLabel} due on delivery.</strong>{" "}
              <span className="font-normal text-muted-foreground">Hand the cash to the dispatcher — the cash ledger is not yet connected and nothing is recorded here.</span>
            </span>
          </p>
        ) : null}
      </div>

      {/* pickup checklist */}
      <section aria-labelledby="rj-items" className="rounded-xl border bg-card p-4">
        <h2 id="rj-items" className="flex items-center gap-2 font-semibold">
          <Package className="size-5 text-primary" aria-hidden /> Pickup checklist
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {job.items.map((item, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <input type="checkbox" className="size-5 accent-[color:var(--primary)]" aria-label={`Picked ${item}`} defaultChecked={["picked_up", "out_for_delivery", "delivered"].includes(step)} disabled={step === "delivered"} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {["picked_up", "out_for_delivery"].includes(step) ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Inventory handover completed before this job — your actions do not alter sellable stock.
          </p>
        ) : null}
      </section>

      {/* address & contact */}
      <section aria-labelledby="rj-addr" className="space-y-2 rounded-xl border bg-card p-4">
        <h2 id="rj-addr" className="flex items-center gap-2 font-semibold">
          <MapPin className="size-5 text-primary" aria-hidden /> Delivery address
        </h2>
        {job.address ? (
          <>
            <p className="text-sm font-medium">{job.address.recipientName}</p>
            <p className="text-sm">{job.address.line1}</p>
            {job.address.landmark ? <p className="text-sm text-muted-foreground">Landmark: {job.address.landmark}</p> : null}
            {job.address.ghanaPostGps ? <p className="font-mono text-sm text-muted-foreground">{job.address.ghanaPostGps} (as recorded — not geocoded)</p> : null}
            {job.address.phone ? (
              <Button asChild variant="outline" className="h-12 w-full">
                <a href={`tel:${job.address.phone}`}>
                  <Phone className="size-5" aria-hidden /> Call {job.address.phone}
                </a>
              </Button>
            ) : null}
            {mapsQuery ? (
              <Button asChild variant="ghost" className="h-11 w-full">
                {/* Opens the rider's own maps app with the recorded address —
                    an external app lookup, not in-app tracking. */}
                <a href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noopener noreferrer">
                  <MapPin className="size-4" aria-hidden /> Open in Maps app (external)
                </a>
              </Button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Collect from the store.</p>
        )}
        {job.instructions ? (
          <p className="rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">{job.instructions}</p>
        ) : null}
      </section>

      {/* rescheduled context */}
      {step === "rescheduled" ? (
        <section aria-labelledby="rj-resched" className="rounded-xl border border-warning/50 bg-warning/5 p-4">
          <h2 id="rj-resched" className="font-semibold">Delivery rescheduled</h2>
          <p className="mt-1 text-sm">
            New window: <strong>{job.rescheduledFor ? `${formatDateTime(job.rescheduledFor)} UTC` : "to be confirmed by dispatch"}</strong>
          </p>
          {job.failureReason ? <p className="mt-1 text-sm text-muted-foreground">Prior attempt failed: {job.failureReason}</p> : null}
          <p className="mt-2 text-sm text-muted-foreground">
            Dispatch decides the next step. When the new window opens, start the delivery here.
          </p>
        </section>
      ) : null}

      {/* status actions — sticky so the primary action is always reachable */}
      <section aria-labelledby="rj-actions" className="sticky bottom-0 z-20 -mx-4 space-y-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <h2 id="rj-actions" className="sr-only">Job actions</h2>

        {step === "assigned" ? (
          <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={() => act("accept", {}, "Job accepted")}>
            <Check className="size-5" aria-hidden /> Accept job
          </Button>
        ) : null}
        {step === "accepted" ? (
          <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={() => act("pickup", {}, "Picked up from store — custody confirmed")}>
            <Package className="size-5" aria-hidden /> Confirm pickup from store
          </Button>
        ) : null}
        {step === "picked_up" || step === "rescheduled" ? (
          <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={() => act("out", {}, "Out for delivery")}>
            <Truck className="size-5" aria-hidden /> Start delivery
          </Button>
        ) : null}
        {step === "out_for_delivery" ? (
          <>
            <Button size="lg" className="h-14 w-full text-base" onClick={() => setProofOpen(true)} disabled={busy}>
              <Check className="size-5" aria-hidden /> Mark delivered
            </Button>
            <Button size="lg" variant="outline" className="h-14 w-full text-base" onClick={() => setFailOpen(true)} disabled={busy}>
              <Ban className="size-5" aria-hidden /> Report failed delivery
            </Button>
          </>
        ) : null}

        {step === "delivered" ? (
          <div className="rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
            <p className="font-semibold text-success">Delivered {job.proof ? `· proof: ${job.proof.method}` : ""}</p>
            {job.cashToCollectLabel ? (
              <p className="mt-1 text-muted-foreground">
                Hand the {job.cashToCollectLabel} cash to the dispatcher — the cash ledger is not yet connected,
                so collection is recorded there, not on your phone.
              </p>
            ) : null}
          </div>
        ) : null}
        {step === "failed" ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Failure reported</p>
            <p className="mt-1">{job.failureReason}</p>
            <p className="mt-1 text-muted-foreground">
              Dispatch will reschedule or return the goods to the store. Keep the goods safe until told otherwise.
            </p>
          </div>
        ) : null}
        {step === "return_to_store" ? (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            <p className="font-semibold">Returned to store — awaiting Returns inspection</p>
            <p className="mt-1 text-muted-foreground">Sellable stock is not automatically restored.</p>
          </div>
        ) : null}
        {busy ? (
          <p role="status" className="text-center text-xs text-muted-foreground">Sending… your last action is still being recorded.</p>
        ) : null}
      </section>

      {/* note to dispatcher */}
      <section className="space-y-2 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Note to dispatch</h2>
        <Label htmlFor="rj-note" className="sr-only">Note</Label>
        <Textarea id="rj-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. customer asked to leave at the gate" />
        <Button variant="outline" className="h-11 w-full" onClick={saveNote} disabled={!note.trim()}>
          <Send className="size-4" aria-hidden /> Send note
        </Button>
        {notePending ? (
          <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-sm">
            <strong>Pending (unsent):</strong> “{notePending}” — kept on this device until it is
            delivered. Not recorded as delivered.
          </p>
        ) : null}
      </section>

      {/* history */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Job history</h2>
        <ol className="mt-2 space-y-1.5 text-sm">
          {job.events.slice().reverse().map((e, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">
              <span>{e.action}</span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{e.atLabel}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* proof dialog — delivery completion only; no cash record */}
      <Dialog open={proofOpen} onOpenChange={setProofOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm delivery</DialogTitle>
            <DialogDescription>Choose an approved proof-of-delivery option.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="proof-method">Proof method</Label>
              <Select value={proofMethod} onValueChange={(v) => setProofMethod(v as typeof proofMethod)}>
                <SelectTrigger id="proof-method" className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pin">Customer PIN</SelectItem>
                  <SelectItem value="signature">Customer signature</SelectItem>
                  <SelectItem value="photo_note">Photo / delivery note</SelectItem>
                </SelectContent>
              </Select>
              {proofMethod === "photo_note" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No photo upload is connected — describe the delivery evidence (e.g. photo kept on your device).
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="proof-detail">
                {proofMethod === "pin" ? "PIN entered by customer" : proofMethod === "signature" ? "Signature reference" : "Photo or note description"}
              </Label>
              <Input id="proof-detail" className="h-11" value={proofDetail} onChange={(e) => setProofDetail(e.target.value)} placeholder={proofMethod === "pin" ? "4-digit PIN" : "e.g. signed on device"} inputMode={proofMethod === "pin" ? "numeric" : "text"} />
            </div>
            {job.cashToCollectLabel ? (
              <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
                {job.cashToCollectLabel} in cash is due on delivery — hand it to the dispatcher afterwards.
                Delivery confirmation here does not record cash collection (authority pending).
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              className="h-12"
              disabled={busy || !proofDetail.trim()}
              onClick={async () => {
                await act("deliver", { proofMethod, proofDetail: proofDetail.trim() }, "Delivered with proof");
                setProofOpen(false);
                setProofDetail("");
              }}
            >
              Confirm delivery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* fail dialog — structured reason + note */}
      <Dialog open={failOpen} onOpenChange={setFailOpen}>
        <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report a failed delivery</DialogTitle>
            <DialogDescription>
              Dispatch will decide whether to reschedule or return the goods to the store. Sellable stock is
              never re-added automatically, and the order is not cancelled by this report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <fieldset>
              <legend className="text-sm font-medium">What happened?</legend>
              <div className="mt-2 space-y-1.5">
                {FAIL_REASONS.map((r) => (
                  <label key={r.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
                    <input
                      type="radio"
                      name="fail-reason"
                      value={r.value}
                      checked={failReason === r.value}
                      onChange={() => setFailReason(r.value)}
                      className="size-5 accent-[color:var(--primary)]"
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <Label htmlFor="fail-note">Note (optional)</Label>
              <Textarea id="fail-note" rows={2} value={failNote} onChange={(e) => setFailNote(e.target.value)} placeholder="e.g. neighbour said she went to the market" />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              className="h-12"
              disabled={busy || !failReason.trim()}
              onClick={async () => {
                const reason = failNote.trim() ? `${failReason} (${failNote.trim()})` : failReason;
                await act("fail", { reason }, "Failure reported — dispatch decides the next step");
                setFailOpen(false);
                setFailNote("");
              }}
            >
              Report failure
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
