"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiOps, ApiError, type PublicOrder } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState } from "@/components/shared/states";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, FULFILMENT_LABELS, DELIVERY_LABELS } from "@/types/domain";
import { CheckCircle2, CircleDashed, MapPin, Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** Secure tracking entry — order reference + verification code together. */
export default function TrackPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [reference, setReference] = useState(params.get("reference") ?? "");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);

  const track = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      const o = await apiOps.track(reference.trim().toUpperCase(), code.trim().toUpperCase());
      setOrder(o);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tracking failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-8">
      <div className="flex items-center gap-2">
        <MapPin className="size-6 text-primary" aria-hidden />
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">Track your order</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the order reference and the code from your confirmation screen. Both are needed
        together — a reference alone never reveals your order.
      </p>

      <form onSubmit={track} className="mt-5 space-y-4 rounded-2xl border bg-card p-4 sm:p-5" aria-label="Track order form">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="tr-ref">Order reference</Label>
            <Input
              id="tr-ref"
              className="h-11 font-mono uppercase"
              placeholder="VG-XXXXXX"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <Label htmlFor="tr-code">Verification code</Label>
            <Input
              id="tr-code"
              className="h-11 font-mono uppercase"
              placeholder="6-character code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
        </div>
        <Button type="submit" size="lg" className="h-12 w-full" disabled={loading || !reference.trim() || !code.trim()}>
          {loading ? "Checking…" : "Track order"}
        </Button>
      </form>

      {error ? <ErrorState title="Could not track that order" message={error} className="mt-4" /> : null}

      {order ? (
        <div className="mt-6 space-y-4" aria-live="polite">
          <div className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Order {order.reference}</h2>
              <div className="flex flex-wrap gap-2">
                <StatusBadge kind="payment" status={order.paymentStatus} />
                <StatusBadge kind="fulfilment" status={order.fulfilmentStatus} />
                {order.fulfilment === "delivery" ? <StatusBadge kind="delivery" status={order.deliveryStatus} /> : null}
              </div>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Placed {order.createdAtLabel} UTC · {order.fulfilment === "delivery" ? `Delivery${order.slotLabel ? ` (${order.slotLabel})` : ""}` : "Collection"}
              {order.job?.riderName ? ` · Rider: ${order.job.riderName}` : ""}
            </p>

            <ul className="mt-4 space-y-1.5 text-sm">
              {order.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span>
                    {l.productName} <span className="text-muted-foreground">({l.variantName}) × {l.quantity}</span>
                  </span>
                  <span className="tabular-nums">{l.lineTotalLabel}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between border-t pt-2 text-sm font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(order.totalMinor)}</span>
            </div>

            {order.job?.cashToCollectLabel && !order.job.cashCollectedAt ? (
              <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-sm">
                Cash on delivery: please have {order.job.cashToCollectLabel} ready for the rider.
              </p>
            ) : null}
            {order.job?.failureReason ? (
              <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-sm">
                Last delivery attempt failed: {order.job.failureReason}
                {order.job.rescheduledFor ? ` — rescheduled for ${formatDateTime(order.job.rescheduledFor)} UTC.` : "."}
              </p>
            ) : null}
          </div>

          {/* timeline */}
          <div className="rounded-2xl border bg-card p-4 sm:p-5">
            <h2 className="font-semibold">Progress history</h2>
            <ol className="mt-3 space-y-3">
              {order.events.slice().reverse().map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                      i === 0 ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    )}
                    aria-hidden
                  >
                    {i === 0 ? <Package className="size-3" /> : <CircleDashed className="size-3" />}
                  </span>
                  <div>
                    <p className="font-medium">{e.action}</p>
                    <p className="text-xs text-muted-foreground">{e.atLabel} UTC</p>
                  </div>
                </li>
              ))}
            </ol>
            {order.returns.length ? (
              <div className="mt-4 border-t pt-3 text-sm">
                <p className="font-medium">Returns on this order</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {order.returns.map((r) => (
                    <li key={r.id}>
                      {r.reference} — {r.status.replace(/_/g, " ")} · requested {formatDateTime(r.createdAt)} UTC
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <Button asChild variant="outline" className="h-11">
            <Link href="/account/returns">Request a return</Link>
          </Button>
        </div>
      ) : null}

      {!order && !error && !loading ? (
        <p className="mt-6 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          Demo tip: track <code className="rounded bg-muted px-1 font-mono text-xs">VG-8Q2M1A</code> with code{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">7H2K9P</code> (a delivered order with a partial refund), or{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">VG-3P7K2D</code> with{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">K4V9T2</code> (payment pending).
        </p>
      ) : null}

      <p className="sr-only">
        Fulfilment: {order ? FULFILMENT_LABELS[order.fulfilmentStatus] : "—"}; Delivery:{" "}
        {order ? (order.fulfilment === "delivery" ? DELIVERY_LABELS[order.deliveryStatus] : "n/a") : "—"}; Payment method:{" "}
        {order ? PAYMENT_METHOD_LABELS[order.paymentMethod] : "—"}.
      </p>
      <CheckCircle2 className="hidden" aria-hidden />
    </div>
  );
}
