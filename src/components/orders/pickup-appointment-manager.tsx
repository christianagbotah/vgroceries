"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import type { PickupAppointmentOptions, PickupAppointmentSlot } from "@/services/contracts";
import { Button } from "@/components/ui/button";
import { Clock3, CalendarCheck, ShieldCheck, RefreshCcw } from "lucide-react";

const display = (iso: string) => new Intl.DateTimeFormat("en-GH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra",
}).format(new Date(iso));

export function PickupAppointmentManager({
  orderId, onChanged,
}: {orderId: string; onChanged: () => Promise<void>}) {
  const [options, setOptions] = useState<PickupAppointmentOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const pendingKey = useRef<{intent:string;key:string}|null>(null);
  const refresh = useCallback(async () => {
    const next = await apiOps.pickupAppointments(orderId);
    setOptions(next);
    return next;
  }, [orderId]);

  useEffect(() => {
    let active = true;
    // Use a request token instead of setting a fabricated appointment in demo mode.
    apiOps.pickupAppointments(orderId).then(data => {
      if (active) { setOptions(data); setError(null); setLoading(false); }
    }).catch(e => {
      if (active) {
        setLoading(false);
        setError(e instanceof ApiError ? e.message : "Could not check collection appointments.");
      }
    });
    return () => {active = false;};
  }, [orderId]);

  const slots = useMemo(() =>
    (options?.slots ?? []).filter(s => s.available > 0), [options?.slots]);
  const current = options?.appointment;
  const booked = current?.status === "booked";

  async function act(kind: "book" | "cancel") {
    if (saving || (kind === "book" && !options?.ready)) return;
    if (kind === "book" && (!selected || !slots.some(s => s.startsAt === selected))) return;
    if (kind === "cancel" && !booked) return;
    setSaving(true);
    setError(null);
    const intent=`${kind}:${kind==="book"?selected:"cancel"}`;
    if (pendingKey.current?.intent !== intent)
      pendingKey.current={intent,key:crypto.randomUUID()};
    try {
      const result=kind==="book"
        ? await apiOps.pickupAppointmentBook(orderId,selected,pendingKey.current.key)
        : await apiOps.pickupAppointmentCancel(orderId,pendingKey.current.key);
      // Server confirmation is authoritative even if subsequent page refresh fails.
      setOptions(previous=>previous?{...previous,appointment:result.appointment}:previous);
      pendingKey.current=null;
      setSelected("");
      setConfirmCancel(false);
      void refresh().catch(()=>setError("Appointment saved, but fresh availability could not be loaded. Use Refresh to check again."));
      void onChanged().catch(() => {});
    } catch(e) {
      setError(e instanceof ApiError ? e.message : "Could not update your collection appointment.");
      try { await refresh(); } catch { /* preserve mutation error */ }
    } finally {setSaving(false);}
  }

  return <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4 sm:p-5" aria-label="Pickup collection appointment">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><CalendarCheck className="size-5 text-primary" aria-hidden /> Collection appointment</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Schedule your visit separately from the parcel&apos;s transport window. All appointment times are Ghana local time (GMT).
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={loading || saving} onClick={() => {
        setLoading(true);
        void refresh().then(()=>setError(null)).catch(e=>setError(e instanceof ApiError?e.message:"Could not refresh appointments.")).finally(()=>setLoading(false));
      }}><RefreshCcw className="size-4" aria-hidden /> Refresh</Button>
    </div>
    {loading ? <p role="status" className="text-sm text-muted-foreground">Checking collection appointment availability…</p> : null}
    {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
    {current ? <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-sm font-medium">
        {booked ? "Your booked appointment" : current.status === "completed" ? "Collection appointment completed" : "Previous appointment cancelled"}
      </p>
      <p className="mt-1 text-sm">{display(current.startsAt)} – {new Intl.DateTimeFormat("en-GH", {timeStyle:"short",timeZone:"Africa/Accra"}).format(new Date(current.endsAt))}</p>
      {booked ? <div className="mt-3 flex flex-wrap items-center gap-2">
        {!confirmCancel ? <Button size="sm" variant="outline" disabled={saving} onClick={() => setConfirmCancel(true)}>Cancel appointment</Button> :
          <>
            <p className="text-sm">Release this reserved collection time?</p>
            <Button size="sm" variant="destructive" disabled={saving} onClick={() => void act("cancel")}>{saving ? "Cancelling…" : "Yes, cancel appointment"}</Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => setConfirmCancel(false)}>Keep</Button>
          </>}
      </div> : null}
    </div> : null}
    {!loading && options && !options.enabled ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      Customer appointment booking is not active for this order. Wait for a confirmed readiness update and an enabled collection-centre schedule before travelling.
    </p> : null}
    {!loading && options?.enabled && options.ready && current?.status !== "completed" ? <>
      <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Your parcel is recorded ready at the centre. Select an available collection time below. Booking a time does not trigger another payment or stock deduction.</p>
      </div>
      {slots.length ? <div>
        <p className="text-sm font-medium">Available collection times</p>
        <div className="mt-2 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2" role="group" aria-label="Collection appointment times">
          {slots.map((slot: PickupAppointmentSlot) =>
            <Button key={slot.startsAt} type="button" variant={selected===slot.startsAt?"default":"outline"}
              className="h-auto min-h-12 justify-between gap-2 whitespace-normal text-left"
              disabled={saving} aria-pressed={selected===slot.startsAt}
              onClick={()=>setSelected(slot.startsAt)}>
              <span>{display(slot.startsAt)}</span>
              <span className="text-xs opacity-75">{slot.available} left</span>
            </Button>)}
        </div>
        <Button className="mt-3 w-full sm:w-auto" disabled={!selected || saving}
          onClick={() => void act("book")}>
          <Clock3 className="size-4" aria-hidden />
          {saving ? "Saving appointment…" : booked ? "Change appointment" : "Book collection time"}
        </Button>
      </div> : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        No collection times remain available in the centre&apos;s published opening schedule. Refresh or contact the centre.
      </p>}
    </> : null}
    <p className="text-xs text-muted-foreground">
      Bring your order verification code and valid photo ID. Collection is recorded only when authorised staff physically hand over the parcel.
    </p>
  </section>;
}
