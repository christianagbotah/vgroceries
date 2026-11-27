"use client";

import { OrderLinePreview } from "@/components/orders/order-line-preview";

import { Suspense, useCallback, useEffect, useState } from "react";
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
import { formatRetryCountdown, retryAfterSeconds } from "@/features/orders/tracking-rate-limit";

type VerifiedLookup = { reference: string; code: string };
type TrackingResult = { order: PublicOrder; lookup: VerifiedLookup | null };

/** Public tracking shows only status; private order details still require authorization. */
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
  const [publicResult,setPublicResult]=useState<{reference:string;paymentStatus:string;fulfilmentStatus:string;deliveryStatus:string;fulfilment:string;createdAt:string}|null>(null);
  const [publicLoading,setPublicLoading]=useState(false);
  const [verificationCode,setVerificationCode]=useState(initialCode);
  const [otpChallenge,setOtpChallenge]=useState<{challengeId:string;expiresAt:string}|null>(null);
  const [otpCode,setOtpCode]=useState("");
  const [otpBusy,setOtpBusy]=useState(false);
  const [otpError,setOtpError]=useState<string|null>(null);
  const [otpResendAt,setOtpResendAt]=useState(0);
  const [trackingLockUntil,setTrackingLockUntil]=useState(0);
  const [otpClock,setOtpClock]=useState(Date.now());
  const shouldTick = Boolean(otpChallenge) || trackingLockUntil > otpClock || otpResendAt > otpClock;
  useEffect(()=>{if(!shouldTick)return;const timer=window.setInterval(()=>setOtpClock(Date.now()),1000);return()=>window.clearInterval(timer);},[shouldTick]);
  const trackingWait = Math.max(0,Math.ceil((trackingLockUntil-otpClock)/1000));
  const resendWait = Math.max(0,Math.ceil((otpResendAt-otpClock)/1000));
  const recordServerRetry=(error:unknown)=>{
    if(!(error instanceof ApiError))return;
    const seconds=retryAfterSeconds(error.details);
    if(!seconds)return;
    if(error.code==="OTP_RATE_LIMITED")setOtpResendAt(Date.now()+seconds*1000);
    if(error.code==="RATE_LIMITED")setTrackingLockUntil(Date.now()+seconds*1000);
  };
  const requestOrderOtp=async()=>{
    setOtpBusy(true);setOtpError(null);
    try{const result=await apiOps.requestOrderOtp(publicResult!.reference);setOtpChallenge(result);setOtpCode("");setOtpResendAt(Date.now()+60000);}
    catch(err){recordServerRetry(err);setOtpError(err instanceof ApiError?err.message:"Unable to request SMS verification.");}
    finally{setOtpBusy(false);}
  };
  const verifyOrderOtp=async()=>{
    if(!publicResult||!otpChallenge)return;
    setOtpBusy(true);setOtpError(null);
    try{const details=await apiOps.verifyOrderOtp(publicResult.reference,otpChallenge.challengeId,otpCode);setOrder(details);setOtpChallenge(null);}
    catch(err){recordServerRetry(err);setOtpError(err instanceof ApiError?err.message:"Verification failed. Check the code and try again.");}
    finally{setOtpBusy(false);}
  };
  const [publicError,setPublicError]=useState<string|null>(null);
  const lookupPublic=async(e?:React.FormEvent)=>{
    e?.preventDefault();setPublicError(null);setPublicResult(null);setOtpChallenge(null);setOtpCode("");setOrder(null);setPublicLoading(true);
    try{setPublicResult(await apiOps.trackPublic(reference.trim().toUpperCase()));}
    catch(err){recordServerRetry(err);setPublicError(err instanceof ApiError?err.message:"Unable to track order. Please try again.");}
    finally{setPublicLoading(false);}
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [verifiedLookup, setVerifiedLookup] = useState<VerifiedLookup | null>(null);
  const verifyGuestOrder = async () => {
    const candidate = reference.trim().toUpperCase();
    const code = verificationCode.trim().toUpperCase();
    if (!candidate || !code) return;
    await requests.load(async () => ({
      order: await apiOps.track(candidate, code),
      lookup: { reference: candidate, code },
    }), { replace: true });
  };

  const [requests] = useState(() => createTrackingRequestCoordinator<TrackingResult>({
    onStart: () => { setLoading(true); setError(null); },
    onValue: result => { setOrder(result.order); setVerifiedLookup(result.lookup); },
    onError: err => {recordServerRetry(err);setError(err instanceof ApiError ? err.message : "Could not load tracking. Please try again.");},
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

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-8">
      <div className="flex items-center gap-2">
        <MapPin className="size-6 text-primary" aria-hidden />
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">Track your order</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {orderId
          ? "Showing live order status from your account — no verification code is needed when you open tracking from your own order."
          : "Enter your order number to see payment and fulfilment progress. Personal details remain private."}
      </p>

      {!orderId ? <form onSubmit={lookupPublic} className="mt-5 space-y-4 rounded-2xl border bg-card p-4 sm:p-5" aria-label="Track order by number">
        <Label htmlFor="public-order-number">Order number</Label>
        <Input id="public-order-number" className="h-12 font-mono uppercase" placeholder="VG-XXXXXXXXXXXX" value={reference} onChange={e=>setReference(e.target.value)} autoComplete="off" required />
        <Button type="submit" size="lg" className="h-12 w-full" disabled={publicLoading||!reference.trim()||trackingWait>0}>{publicLoading?"Checking…":trackingWait>0?`Tracking available in ${formatRetryCountdown(trackingWait)}`:"Track order"}</Button>
        {publicError?<p role="alert" className="text-sm text-destructive">{publicError}{trackingWait>0?` Retry in ${formatRetryCountdown(trackingWait)}.`:""}</p>:null}
        {publicResult?<section aria-live="polite" className="space-y-2 rounded-xl border p-4 text-sm">
          <h2 className="font-semibold">Order {publicResult.reference}</h2>
          <p>Payment: <strong>{publicResult.paymentStatus.replaceAll("_"," ")}</strong></p>
          <p>Order status: <strong>{publicResult.fulfilmentStatus.replaceAll("_"," ")}</strong></p>
          {publicResult.fulfilment==="delivery"?<p>Delivery: <strong>{publicResult.deliveryStatus.replaceAll("_"," ")}</strong></p>:<p>Collection order</p>}
          <div className="space-y-2 border-t pt-3">
            <Button asChild className="w-full"><Link href="/account/orders">View order details and items</Link></Button>
            <p className="text-xs text-muted-foreground">Sign in to the purchasing account to see product names, quantities, prices and receipts. An order number alone cannot unlock private purchases.</p>
            <div className="space-y-3 border-t pt-3" aria-label="Recover guest order by SMS">
              <p className="font-semibold">Forgot your private order code?</p>
              <p className="text-xs text-muted-foreground">Receive a six-digit verification code on the phone number used when placing this order. We never display the full number.</p>
              {otpError?<p role="alert" className="text-xs text-destructive">{otpError}{trackingWait>0?` Retry in ${formatRetryCountdown(trackingWait)}.`:resendWait>0?` Available in ${formatRetryCountdown(resendWait)}.`:""}</p>:null}
              <Button type="button" className="w-full" disabled={otpBusy||resendWait>0||trackingWait>0} onClick={()=>void requestOrderOtp()}>
                {otpBusy?"Please wait…":trackingWait>0?`Tracking available in ${formatRetryCountdown(trackingWait)}`:resendWait>0?`SMS available in ${formatRetryCountdown(resendWait)}`:otpChallenge?"Resend SMS code":"Verify with SMS OTP"}
              </Button>
              {otpChallenge?<div className="space-y-2">
                <Label htmlFor="guest-sms-code">SMS verification code</Label>
                <Input id="guest-sms-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otpCode} onChange={event=>setOtpCode(event.target.value.replace(/\D/g,"").slice(0,6))} placeholder="Enter 6-digit code" />
                <Button type="button" variant="outline" className="w-full" disabled={otpBusy||trackingWait>0||otpCode.length!==6||otpClock>=new Date(otpChallenge.expiresAt).getTime()} onClick={()=>void verifyOrderOtp()}>View my order details</Button>
              </div>:null}
            </div>
            <div className="space-y-2 border-t pt-3" aria-label="Verify guest order details">
              <Label htmlFor="guest-order-code">Have a private order verification code?</Label>
              <Input id="guest-order-code" type="text" autoComplete="off" value={verificationCode} onChange={event => setVerificationCode(event.target.value)} placeholder="Enter your private code" required />
              <Button type="button" onClick={() => void verifyGuestOrder()} variant="outline" className="w-full" disabled={loading || trackingWait>0 || !verificationCode.trim()}>{loading ? "Verifying…" : trackingWait>0 ? `Retry in ${formatRetryCountdown(trackingWait)}` : "View guest order items"}</Button>
              <p className="text-xs text-muted-foreground">Only the correct order number and private code can unlock itemised details. Do not share your code publicly.</p>
            </div>
          </div>
        </section>:null}
      </form> : null}
      {orderId && loading ? <LoadingState rows={4} label="Loading your order status" /> : null}

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
              Placed {formatDateTime(order.createdAt)} UTC · {order.fulfilment === "delivery" ? `Delivery${order.slotLabel ? ` (${order.slotLabel})` : ""}` : "Collection"}
              {order.job?.riderName ? ` · Rider: ${order.job.riderName}` : ""}
            </p>

            <ul className="mt-4 space-y-1.5 text-sm">
              {order.lines.map((l) => (
                <OrderLinePreview key={l.id} line={l} />
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

      <p className="sr-only">
        Fulfilment: {order ? FULFILMENT_LABELS[order.fulfilmentStatus] : "—"}; Delivery:{" "}
        {order ? (order.fulfilment === "delivery" ? DELIVERY_LABELS[order.deliveryStatus] : "n/a") : "—"}; Payment method:{" "}
        {order ? PAYMENT_METHOD_LABELS[order.paymentMethod] : "—"}.
      </p>
      <CheckCircle2 className="hidden" aria-hidden />
    </div>
  );
}
