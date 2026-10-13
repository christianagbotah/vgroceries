"use client";

/**
 * Fulfilment workspace components — queue cards, the picker's line checklist
 * and the packing checklist. Split from the page so the route file stays slim.
 *
 * Data contract: `FulfilmentQueues` (packages/contracts). All action buttons
 * honour `allowedActions` from the service when present, so the future
 * backend fulfilment authority drives what staff can do — the UI never
 * invents transitions. Stock semantics: picking/packing never deduct stock;
 * the single depletion event happens at dispatch handover or collection.
 */

import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FulfilmentOrderCard } from "@/services/client";
import { cn } from "@/lib/utils";
import { Check, ClipboardCheck, Package, TriangleAlert, UserRound, Clock3, ArrowRight, Boxes } from "lucide-react";

export type QueueLine = FulfilmentOrderCard["lines"][number];
export type FulfilmentAction = "picking" | "packed" | "confirm" | "collect" | "note" | "substitute";

/** Does the service allow this action for the order right now? */
export function allows(card: FulfilmentOrderCard, action: string): boolean {
  if (card.allowedActions && !card.allowedActions.includes(action)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Picker line checklist — the heart of the picking workspace          */
/* ------------------------------------------------------------------ */

export function PickerLineTable({ lines }: { lines: QueueLine[] }) {
  return (
    <div className="table-scroll">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="p-3 font-semibold">Item &amp; variant</th>
            <th className="p-3 font-semibold">Unit</th>
            <th className="p-3 text-right font-semibold">Ordered</th>
            <th className="p-3 text-right font-semibold">Allocated</th>
            <th className="p-3 font-semibold">Suggested lots (FEFO)</th>
            <th className="hidden p-3 text-right font-semibold md:table-cell">Available to sell</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className={cn("border-t align-top", l.shortageQty && "bg-destructive/5")}>
              <td className="p-3">
                <p className="font-medium">
                  {l.productName}
                  {l.isSubstitution ? (
                    <span className="ml-2 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">substitute</span>
                  ) : null}
                  {l.shortageQty ? (
                    <span className="ml-2 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                      short {l.shortageQty}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">{l.variantName}{l.note ? ` · ${l.note}` : ""}</p>
              </td>
              <td className="p-3 capitalize text-muted-foreground">{l.unit}</td>
              <td className="p-3 text-right font-medium tabular-nums">{l.quantity}</td>
              <td className="p-3 text-right font-medium tabular-nums">
                {l.allocatedQty !== undefined ? (
                  <span className={l.shortageQty ? "font-bold text-destructive" : "text-success"}>{l.allocatedQty}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="p-3">
                {l.allocations.length ? (
                  <ul className="space-y-0.5 text-xs">
                    {l.allocations.map((a) => (
                      <li key={a.lotId} className="rounded bg-muted/60 px-2 py-1">
                        <span className="font-mono">{a.lotNumber}</span> · take {a.quantity}
                        {a.expiry ? ` · exp ${new Date(a.expiry).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : " · no expiry"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-muted-foreground">Recorded when picking starts</span>
                )}
              </td>
              <td className="hidden p-3 text-right tabular-nums text-muted-foreground md:table-cell">{l.availableToSell}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress + meta strip for an order card                             */
/* ------------------------------------------------------------------ */

export function PickingMeta({ order }: { order: FulfilmentOrderCard }) {
  const allocated = order.linesAllocated ?? 0;
  const total = order.linesTotal ?? order.lines.length;
  const pct = total > 0 ? Math.round((allocated / total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
      {order.pickerName ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <UserRound className="size-3.5" aria-hidden /> Picker: <strong className="font-medium text-foreground">{order.pickerName}</strong>
        </span>
      ) : null}
      {order.pickingStartedAtLabel ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Clock3 className="size-3.5" aria-hidden /> Started {order.pickingStartedAtLabel}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-2" role="status" aria-label={`Picking progress ${allocated} of ${total} lines`}>
        <span className="relative h-2 w-28 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className={cn("absolute inset-y-0 left-0 rounded-full", order.hasExceptions ? "bg-warning" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="tabular-nums text-muted-foreground">{allocated}/{total} lines allocated</span>
      </span>
      {order.hasExceptions ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-[color:var(--warning-foreground)]">
          <TriangleAlert className="size-3.5" aria-hidden /> Exceptions on this order
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Packing checklist (packed together with picking in the demo model)  */
/* ------------------------------------------------------------------ */

const PACKING_CHECKS = [
  "Every line picked or its exception recorded",
  "Fragile and chilled items bagged separately",
  "Receipt / delivery note printed and enclosed",
  "Bag count matches the runner manifest",
];

export function PackingChecklist({ lines }: { lines: QueueLine[] }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const complete = PACKING_CHECKS.every((c) => checked[c]);
  const unresolved = lines.filter((l) => l.shortageQty).length;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Package className="size-4" aria-hidden /> Packing checklist
      </p>
      <ul className="mt-2 space-y-1.5">
        {PACKING_CHECKS.map((c) => (
          <li key={c}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded p-1.5 text-sm hover:bg-accent/60">
              <input
                type="checkbox"
                checked={!!checked[c]}
                onChange={(e) => setChecked((prev) => ({ ...prev, [c]: e.target.checked }))}
                className="mt-0.5 size-4 shrink-0 accent-[color:var(--primary)]"
              />
              <span>{c}</span>
            </label>
          </li>
        ))}
      </ul>
      {unresolved > 0 ? (
        <p className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
          {unresolved} line{unresolved > 1 ? "s" : ""} with unresolved shortages — record the exception
          (substitute or note) before final packing.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {complete ? "Checklist complete — ready to mark packed." : "Tick each item as it is checked."}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Order card header shared by pick / picking / exception queues       */
/* ------------------------------------------------------------------ */

export function QueueCardHeader({
  order,
  badge,
  right,
}: {
  order: FulfilmentOrderCard;
  badge?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/orders/${order.id}`} className="font-semibold hover:underline focus-visible:underline">
            {order.reference}
          </Link>
          {badge}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {order.customerName} · {order.channel === "online" ? "Online order" : "Counter sale"} ·{" "}
          {order.fulfilment === "delivery" ? order.slotLabel ?? "Delivery" : "Collection"} · {order.totalLabel}
        </p>
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Handover explainer — never imply packing deducted stock             */
/* ------------------------------------------------------------------ */

export function HandoverNotice() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
      <Boxes className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p>
        <strong>Packing has not deducted stock.</strong> These goods are physically bagged but still
        counted as reserved. The single stock-consumption event happens when the order is handed to
        dispatch (rider collects) or collected by the customer — the backend owns that moment.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Note dialog used by picking / packing / handover actions            */
/* ------------------------------------------------------------------ */

export function NoteDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  submitLabel,
  busy,
  onSubmit,
  withLineChoice,
  lines,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  placeholder: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (note: string, lineId?: string) => void;
  withLineChoice?: boolean;
  lines?: QueueLine[];
}) {
  const [text, setText] = useState("");
  const [lineId, setLineId] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setText(""); setLineId(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="fd-note-text">Note</Label>
            <Textarea id="fd-note-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
          </div>
          {withLineChoice && lines && lines.length > 0 ? (
            <div>
              <Label htmlFor="fd-note-line">Attach to line (optional)</Label>
              <select
                id="fd-note-line"
                value={lineId}
                onChange={(e) => setLineId(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Whole order</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.productName} — {l.variantName}
                    {l.shortageQty ? ` (short ${l.shortageQty})` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Shortages and substitutions are recorded on the order and visible to the customer
                depending on visibility settings.
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button className="h-11" disabled={busy || !text.trim()} onClick={() => { onSubmit(text.trim(), lineId || undefined); setText(""); setLineId(""); }}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Workflow strip — the operational flow with the stock boundary       */
/* ------------------------------------------------------------------ */

const FLOW_STEPS = [
  { label: "Confirmed", hint: "stock held" },
  { label: "Picking", hint: "no deduction" },
  { label: "Packed", hint: "still reserved" },
  { label: "Handover", hint: "stock consumed here" },
];

export function WorkflowStrip({ counts }: { counts: { confirm: number; pick: number; picking: number; packed: number } }) {
  const values = [counts.confirm + counts.pick, counts.picking, counts.packed, counts.packed];
  return (
    <ol className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Fulfilment flow">
      {FLOW_STEPS.map((s, i) => (
        <li key={s.label} className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
              i === 3 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
            )}
            aria-hidden
          >
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              {s.label}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{values[i]}</span>
            </p>
            <p className="text-xs text-muted-foreground">{s.hint}</p>
          </div>
          {i < FLOW_STEPS.length - 1 ? (
            <ArrowRight className="ml-auto hidden size-4 shrink-0 text-muted-foreground/60 lg:block" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Event trail (backend timestamps) shown on handover/exception cards  */
/* ------------------------------------------------------------------ */

export function EventTrail({ events }: { events: { atLabel: string; actor: string; action: string }[] }) {
  if (!events.length) return null;
  return (
    <details className="border-t p-4">
      <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
        History ({events.length} recent events)
      </summary>
      <ol className="mt-2 space-y-1.5 text-sm">
        {events.slice().reverse().map((e, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{e.actor}</span> — {e.action}
            </span>
            <span className="whitespace-nowrap text-xs">{e.atLabel} UTC</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Small helper icon+text pair used across the queues. */
export function QueuePill({ count, tone }: { count: number; tone: "default" | "warning" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        tone === "warning" ? "bg-warning/15 text-[color:var(--warning-foreground)]" : "bg-muted text-muted-foreground"
      )}
    >
      {count}
    </span>
  );
}

export { Check, ClipboardCheck };
