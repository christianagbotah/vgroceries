"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, ClipboardCheck, History, RefreshCw } from "lucide-react";
import { apiOps, ApiError } from "@/services/client";
import {
  pickupAttendanceInputSchema,
  type PickupAttendanceContext, type PickupAttendanceInput, type PickupAttendanceRecord,
} from "@/services/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const reasons = {
  late_arrival: [
    { value: "customer_arrived_after_start", label: "Customer arrived after the appointment started" },
    { value: "centre_delay", label: "Delay at the collection centre" },
    { value: "other", label: "Other recorded reason" },
  ],
  missed_window: [
    { value: "customer_not_present", label: "Customer not present during collection window" },
    { value: "customer_unreachable", label: "Customer could not be reached" },
    { value: "other", label: "Other recorded reason" },
  ],
} as const;
type Kind = PickupAttendanceInput["kind"];

function ghanaTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Africa/Accra",
  }).format(new Date(value));
}
function labelFor(reason: string) {
  return [...reasons.late_arrival, ...reasons.missed_window].find(v => v.value === reason)?.label ?? reason.replaceAll("_", " ");
}

/** Embedded in admin shipment details; observations never represent collection or refund authority. */
export function PickupAttendancePanel({ orderId }: { orderId: string }) {
  const { toast } = useToast();
  const [context, setContext] = useState<PickupAttendanceContext | null>(null);
  const [rows, setRows] = useState<PickupAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("late_arrival");
  const [reason, setReason] = useState<string>("customer_arrived_after_start");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const replayKey = useRef("");

  const refresh = useCallback(async (active: () => boolean = () => true) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [nextContext, nextRows] = await Promise.all([
        apiOps.pickupAttendanceContext(orderId), apiOps.pickupAttendance(orderId),
      ]);
      if (!active()) return;
      setContext(nextContext);
      setRows(nextRows);
    } catch (e) {
      if (active()) setLoadError(e instanceof ApiError ? e.message : "Could not refresh pickup attendance records.");
    } finally {
      if (active()) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    let active = true;
    void refresh(() => active);
    return () => { active = false; };
  }, [refresh]);

  function changeKind(next: Kind) {
    if (saving) return;
    setKind(next);
    setReason(next === "late_arrival" ? "customer_arrived_after_start" : "customer_not_present");
    setConfirm(false); setSaveError(null); setSuccess(null); replayKey.current = "";
  }
  function changeReason(value: string) {
    setReason(value); setConfirm(false); setSaveError(null); replayKey.current = "";
  }
  function changeNote(value: string) {
    setNote(value); setConfirm(false); setSaveError(null); replayKey.current = "";
  }

  const current = context?.appointment;
  const prior = rows.some(row => row.appointmentBookedAt === current?.bookedAt && row.kind === kind);
  const allowed = kind === "late_arrival"
    ? Boolean(context?.canRecordLateArrival)
    : Boolean(context?.canRecordMissedWindow);
  const eligible = allowed && !prior && !saving && !loading && !loadError;
  const requested = pickupAttendanceInputSchema.safeParse({
    kind, reason, ...(note.trim() ? { note: note.trim() } : {}),
  });

  async function save() {
    if (!eligible || !confirm || !requested.success || saving) return;
    setSaving(true); setSaveError(null);
    if (!replayKey.current) replayKey.current = crypto.randomUUID();
    try {
      const record = await apiOps.pickupAttendanceRecord(orderId, requested.data, replayKey.current);
      setRows(previous => [record, ...previous.filter(item => item.id !== record.id)]);
      setSuccess("Attendance observation recorded. The order and parcel collection status are unchanged.");
      setConfirm(false); setNote(""); replayKey.current = "";
      toast({ title: "Observation recorded", description: "Saved as permanent internal staff evidence." });
      // The server is authoritative. Refresh only after the commit; an optional
      // failed refresh must not imply that the successful write was rolled back.
      try {
        const [nextContext, nextRows] = await Promise.all([
          apiOps.pickupAttendanceContext(orderId), apiOps.pickupAttendance(orderId),
        ]);
        setContext(nextContext); setRows(nextRows);
      } catch {
        setLoadError("Observation saved. Refresh the records to see the latest server status.");
      }
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message :
        "Could not confirm the observation. Refresh the records before retrying; unchanged retries reuse the same request key.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-label="Collection appointment attendance">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="size-4" aria-hidden /> Appointment attendance</h3>
        <p className="mt-1 text-xs text-muted-foreground">Internal observations only, never automatic cancellation or verified handover.</p>
      </div>
      <Button size="sm" variant="outline" className="min-h-11" disabled={loading || saving}
        onClick={() => void refresh()}><RefreshCw className="size-4" aria-hidden /> Refresh</Button>
    </div>
    {loading && !context ? <p role="status" className="text-sm text-muted-foreground">Loading current booking and attendance evidence…</p> : null}
    {loadError ? <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{loadError}</p> : null}
    {context ? <>
      {current ? <div className="rounded-lg bg-muted/40 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">Current appointment</span>
          <span className="text-xs font-medium capitalize">{current.status}</span>
        </div>
        <p className="mt-1">{ghanaTime(current.startsAt)} – {ghanaTime(current.endsAt)} (Ghana time)</p>
      </div> : <p className="rounded-lg border p-3 text-sm text-muted-foreground">No collection appointment has been booked for this order.</p>}
      {!context.enabled ? <p role="status" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        Staff attendance recording is disabled until pickup operations are approved. Historical evidence remains read-only.
      </p> : null}
      {context.enabled && !allowed ? <p className="text-sm text-muted-foreground">
        {kind === "missed_window" ? "Missed-window records require a booked slot that has ended and a parcel still waiting at the centre."
          : "Late-arrival records require a booked slot that has started and a parcel still waiting at the centre."}
      </p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={"attendance-kind-" + orderId}>Observation</Label>
          <Select value={kind} onValueChange={v => changeKind(v as Kind)} disabled={saving}>
            <SelectTrigger id={"attendance-kind-" + orderId} className="mt-1 min-h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem className="min-h-11" value="late_arrival">Late arrival</SelectItem>
              <SelectItem className="min-h-11" value="missed_window">Missed collection window</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={"attendance-reason-" + orderId}>Reason</Label>
          <Select value={reason} onValueChange={changeReason} disabled={saving}>
            <SelectTrigger id={"attendance-reason-" + orderId} className="mt-1 min-h-11"><SelectValue /></SelectTrigger>
            <SelectContent>{reasons[kind].map(item =>
              <SelectItem key={item.value} className="min-h-11" value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor={"attendance-note-" + orderId}>Additional observation (optional)</Label>
        <Textarea id={"attendance-note-" + orderId} className="mt-1 min-h-24 resize-y" rows={3} value={note} maxLength={350}
          onChange={e => changeNote(e.target.value)} disabled={saving} autoComplete="off"
          placeholder="Short factual note; avoid unnecessary personal details" />
        <p className="mt-1 text-xs text-muted-foreground">{note.length}/350 characters</p>
      </div>
      {prior ? <p className="text-sm text-muted-foreground">This booking already has a recorded {kind === "late_arrival" ? "late arrival" : "missed window"} observation.</p> : null}
      {saveError ? <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{saveError}</p> : null}
      {success ? <p role="status" className="rounded-lg border p-3 text-sm">{success}</p> : null}
      {confirm ? <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-semibold">Confirm permanent staff evidence</p>
        <p>Record “{kind === "late_arrival" ? "Late arrival" : "Missed collection window"}” for this order? It cannot be edited or deleted. This will not mark the parcel collected, cancel the order, release stock or issue a refund.</p>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" disabled={!eligible || !requested.success || saving} onClick={() => void save()}>
            {saving ? "Recording…" : "Confirm & record"}
          </Button>
          <Button className="min-h-11" variant="outline" disabled={saving} onClick={() => setConfirm(false)}>Back</Button>
        </div>
      </div> : <Button className="min-h-11 w-full sm:w-auto" variant="outline" disabled={!eligible || !requested.success}
        onClick={() => { setSaveError(null); setSuccess(null); setConfirm(true); replayKey.current = crypto.randomUUID(); }}>
        <CalendarClock className="size-4" aria-hidden /> Review attendance observation
      </Button>}
    </> : null}
    <div className="border-t pt-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><History className="size-4" aria-hidden /> Audit history</h4>
      {rows.length ? <ol className="mt-2 max-h-56 space-y-2 overflow-y-auto">
        {rows.map(item => <li key={item.id} className="rounded-lg border p-3 text-sm">
          <p className="font-semibold">{item.kind === "late_arrival" ? "Late arrival" : "Missed collection window"}</p>
          <p className="mt-1">{labelFor(item.reason)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Observed {ghanaTime(item.observedAt)} · Booking {ghanaTime(item.appointmentBookedAt)}</p>
          {item.note ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.note}</p> : null}
        </li>)}
      </ol> : <p className="mt-2 text-sm text-muted-foreground">No attendance observations recorded.</p>}
    </div>
  </section>;
}
