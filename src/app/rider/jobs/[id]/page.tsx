"use client";

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
import { Ban, Banknote, Check, MapPin, Navigation, Package, Phone, Send, Truck } from "lucide-react";

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
  const [cashCollected, setCashCollected] = useState(true);

  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState("");

  const [note, setNote] = useState("");
  const [notePending, setNotePending] = useState<string | null>(null); // interrupted connectivity: keep unsent note visible

  const load = useCallback(async () => {
    try {
      setJob(await apiOps.riderJob(id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this job.");
    }
  }, [id]);

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
    if (!note.trim()) return;
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

  const shareLocation = async () => {
    if (!riderId) return;
    try {
      await apiOps.riderAction({ action: "location", riderId, jobId: id, label: "Current area (demo — permission-based)" });
      toast({ title: "Location shared", description: "Permission-based and optional; last update time is shown." });
    } catch {
      toast({ title: "Location not shared", variant: "destructive" });
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!job) return <LoadingState rows={3} label="Loading job" />;

  const step = job.status;

  return (
    <div className="space-y-4">
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
          <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-sm font-semibold">
            <Banknote className="size-4" aria-hidden /> Collect {job.cashToCollectLabel}
            {job.cashCollectedAt ? " — collected ✓" : " on delivery"}
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
        {step === "picked_up" || step === "out_for_delivery" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Stock was consumed once at pickup — retries never double-deduct.
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
            {job.address.ghanaPostGps ? <p className="font-mono text-sm text-muted-foreground">{job.address.ghanaPostGps}</p> : null}
            {job.address.phone ? (
              <Button asChild variant="outline" className="h-12 w-full">
                <a href={`tel:${job.address.phone}`}>
                  <Phone className="size-5" aria-hidden /> Call {job.address.phone}
                </a>
              </Button>
            ) : null}
            {job.address.ghanaPostGps ? (
              <Button variant="ghost" className="h-11 w-full" onClick={shareLocation}>
                <Navigation className="size-4" aria-hidden /> Navigate (external map app)
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

      {/* status actions */}
      <section aria-labelledby="rj-actions" className="space-y-2">
        <h2 id="rj-actions" className="sr-only">Job actions</h2>

        {step === "assigned" ? (
          <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={() => act("accept", {}, "Job accepted")}>
            <Check className="size-5" aria-hidden /> Accept job
          </Button>
        ) : null}
        {step === "accepted" ? (
          <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={() => act("pickup", {}, "Picked up from store")}>
            <Package className="size-5" aria-hidden /> Confirm pickup from store
          </Button>
        ) : null}
        {step === "picked_up" ? (
          <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={() => act("out", {}, "Out for delivery")}>
            <Truck className="size-5" aria-hidden /> Start delivery
          </Button>
        ) : null}
        {step === "out_for_delivery" || step === "rescheduled" ? (
          <>
            <Button size="lg" className="h-14 w-full text-base" onClick={() => setProofOpen(true)} disabled={busy}>
              <Check className="size-5" aria-hidden /> Mark delivered
            </Button>
            <Button size="lg" variant="outline" className="h-14 w-full text-base" onClick={() => setFailOpen(true)} disabled={busy}>
              <Ban className="size-5" aria-hidden /> Delivery failed
            </Button>
          </>
        ) : null}

        {step === "delivered" ? (
          <div className="rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
            <p className="font-semibold text-success">Delivered {job.proof ? `· proof: ${job.proof.method}` : ""}</p>
            {job.cashToCollectLabel && !job.cashCollectedAt ? (
              <p className="mt-1 text-muted-foreground">Cash not yet marked as collected — ask the dispatcher to record it.</p>
            ) : null}
          </div>
        ) : null}
        {step === "failed" ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed: {job.failureReason}
          </p>
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
            <li key={i} className="flex justify-between gap-2">
              <span>{e.action}</span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{e.atLabel}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* proof dialog */}
      <Dialog open={proofOpen} onOpenChange={setProofOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm delivery</DialogTitle>
            <DialogDescription>Choose an approved proof-of-delivery option.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Proof method</Label>
              <Select value={proofMethod} onValueChange={(v) => setProofMethod(v as typeof proofMethod)}>
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pin">Customer PIN</SelectItem>
                  <SelectItem value="signature">Customer signature</SelectItem>
                  <SelectItem value="photo_note">Photo / delivery note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="proof-detail">
                {proofMethod === "pin" ? "PIN entered by customer" : proofMethod === "signature" ? "Signature reference" : "Photo or note description"}
              </Label>
              <Input id="proof-detail" className="h-11" value={proofDetail} onChange={(e) => setProofDetail(e.target.value)} placeholder={proofMethod === "pin" ? "4-digit PIN" : "e.g. signed on device"} inputMode={proofMethod === "pin" ? "numeric" : "text"} />
            </div>
            {job.cashToCollectLabel && !job.cashCollectedAt ? (
              <label className="flex items-center gap-2.5 rounded-lg border p-3 text-sm">
                <input type="checkbox" className="size-5 accent-[color:var(--primary)]" checked={cashCollected} onChange={(e) => setCashCollected(e.target.checked)} />
                Cash of {job.cashToCollectLabel} collected
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              className="h-12"
              disabled={busy || !proofDetail.trim()}
              onClick={async () => {
                await act("deliver", { proofMethod, proofDetail: proofDetail.trim(), cashCollected }, "Delivered with proof");
                setProofOpen(false);
                setProofDetail("");
              }}
            >
              Confirm delivery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* fail dialog */}
      <Dialog open={failOpen} onOpenChange={setFailOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Report a failed delivery</DialogTitle>
            <DialogDescription>
              Dispatch will reschedule or return the goods to store. Stock is never re-added
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="fail-reason">What happened?</Label>
            <Textarea id="fail-reason" rows={2} value={failReason} onChange={(e) => setFailReason(e.target.value)} placeholder="e.g. customer absent, wrong address" />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              className="h-12"
              disabled={busy || !failReason.trim()}
              onClick={async () => {
                await act("fail", { reason: failReason.trim() }, "Failure reported");
                setFailOpen(false);
                setFailReason("");
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
