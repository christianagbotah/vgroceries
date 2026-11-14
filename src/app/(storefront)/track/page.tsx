"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSubmissionFeedbackFocus } from "@/hooks/use-submission-feedback-focus";
import { useSearchParams } from "next/navigation";
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
import { CheckCircle2, MapPin } from "lucide-react";
import { OrderTrackingJourney } from "@/components/orders/order-tracking-journey";
import { LoadingState } from "@/components/shared/states";
import { createTrackingRequestCoordinator, isTrackingTerminal } from "@/features/orders/tracking-requests";

type VerifiedLookup = { reference: string; code: string };
type TrackingResult = { order: PublicOrder; lookup: VerifiedLookup | null };

/** Secure tracking entry — order reference + verification code together. */
export default function TrackPage() {
  return (
    <Suspense fallback={<LoadingState rows={4} label="Loading tracking" />}>
      <TrackForm />
    </Suspense>
  );
}

function TrackForm() {
  const params = useSearchParams();
  const orderId = params.get("orderId");
  // Remount on identity changes so a previous customer's journey cannot remain
  // visible while a different order is loading.
  return <TrackFormContent key={orderId ?? "guest"} orderId={orderId}
    initialReference={params.get("reference") ?? ""} initialCode={params.get("code") ?? ""} />;
}

function TrackFormContent({ orderId, initialReference, initialCode }: {
  orderId: string | null; initialReference: string; initialCode: string;
}) {
  const [reference, setReference] = useState(initialReference);
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [verifiedLookup, setVerifiedLookup] = useState<VerifiedLookup | null>(null);
  const [manualFeedback, setManualFeedback] = useState(0);
  const trackingResultRef = useRef<HTMLDivElement>(null);
  const trackingErrorRef = useRef<HTMLDivElement>(null);
  // Refresh polling must never scroll the page every 30 seconds.
  // Only a manually submitted tracking lookup moves focus to its result.
  useSubmissionFeedbackFocus(manualFeedback && order ? manualFeedback : null, trackingResultRef);
  useSubmissionFeedbackFocus(manualFeedback && error ? manualFeedback : null, trackingErrorRef);
  const [requests] = useState(() => createTrackingRequestCoordinator<TrackingResult>({
    onStart: () => { setLoading(true); setError(null); },
    onValue: result => { setOrder(result.order); setVerifiedLookup(result.lookup); },
    onError: err => setError(err instanceof ApiError ? err.message : "Could not load tracking. Please try again."),
    onFinish: () => setLoading(false),
  }));

  useEffect(() => {
    requests.invalidate();
    if (orderId) {
      void requests.load(async () => ({ order: await apiOps.orderStatus(orderId), lookup: null }), { replace: true });
    }
    return () => requests.invalidate();
  }, [orderId, requests]);

  const refresh = useCallback(async () => {
    if (!orderId && !verifiedLookup) return;
    await requests.load(async () => ({
      order: orderId ? await apiOps.orderStatus(orderId)
        : await apiOps.track(verifiedLookup!.reference, verifiedLookup!.code),
      lookup: orderId ? null : verifiedLookup,
    }));
  }, [orderId, verifiedLookup, requests]);

  useEffect(() => {
    if (!order || (!orderId && !verifiedLookup) || isTrackingTerminal(order)) return;
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [order, orderId, verifiedLookup, refresh]);

  const track = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const lookup = { reference: reference.trim().toUpperCase(), code: code.trim().toUpperCase() };
    setOrder(null);
    setVerifiedLookup(null);
    await requests.load(async () => ({ order: await apiOps.track(lookup.reference, lookup.code), lookup }), { replace: true });
    setManualFeedback((previous) => previous + 1);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-8">
      <div className="flex items-center gap-2">
        <MapPin className="size-6 text-primary" aria-hidden />
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">Track your order</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {orderId
          ? "Showing live order status from your account — no verification code is needed when you open tracking from your own order."
          : "Guest tracking uses the order reference and verification code from the confirmation screen."}
      </p>

      {!orderId ? <form onSubmit={track} className="mt-5 space-y-4 rounded-2xl border bg-card p-4 sm:p-5" aria-label="Track order form">
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
      </form> : null}

      {orderId && loading ? <LoadingState rows={4} label="Loading your order status" /> : null}

      {error ? <div ref={trackingErrorRef} tabIndex={-1} className="scroll-mt-28 outline-none focus-visible:ring-2 focus-visible:ring-destructive">
        <ErrorState title="Could not track that order" message={error} className="mt-4" />
      </div> : null}

      {order ? (
        <div ref={trackingResultRef} tabIndex={-1} className="mt-6 scroll-mt-28 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-primary" role="region" aria-label="Verified order tracking result" aria-live="polite">
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

          <OrderTrackingJourney order={order} onRefresh={refresh} refreshing={loading} />
          {order.returns.length ? <div className="rounded-2xl border bg-card p-4 sm:p-5">
            <p className="font-medium">Returns on this order</p>
            {order.returns.map((r) => <p key={r.id} className="mt-1 text-sm text-muted-foreground">
              {r.reference} — {r.status.replace(/_/g, " ")} · requested {formatDateTime(r.createdAt)} UTC
            </p>)}
          </div> : null}

          <Button asChild variant="outline" className="h-11">
            <Link href="/account/returns">Request a return</Link>
          </Button>
        </div>
      ) : null}

      {!process.env.NEXT_PUBLIC_API_BASE_URL && !orderId && !order && !error && !loading ? (
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
