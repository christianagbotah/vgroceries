"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiOps, ApiError, type PublicOrder } from "@/services/client";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { PAYMENT_METHOD_LABELS } from "@/types/domain";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { CheckCircle2, CircleDashed, Clock, Loader2, Package, PartyPopper, PhoneCall, ShieldQuestion, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const POLL_MS = 4000;

/**
 * Payment status screen. Electronic payments start through the server-owned
 * payment-attempt authority; browser redirects and return URLs never mark an
 * order paid. Only verified provider evidence changes payment truth.
 */
export default function CheckoutStatusPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initiating, setInitiating] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const o = await apiOps.orderStatus(id);
      setOrder(o);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the order status.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  useEffect(() => {
    // stop polling once the payment outcome is final
    if (order && ["succeeded", "failed", "requires_review", "refunded", "partially_refunded", "unpaid"].includes(order.paymentStatus)) {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [order]);

  const startPayment = async () => {
    if (!order) return;
    setInitiating(true);
    setPaymentMessage(null);
    setError(null);
    try {
      const keyName = `vg_payment_attempt_key_${id}`;
      let key = window.sessionStorage.getItem(keyName);
      if (!key) {
        key = `pay_${crypto.randomUUID().replaceAll("-", "")}`;
        window.sessionStorage.setItem(keyName, key);
      }
      window.sessionStorage.setItem("vg_payment_order_id", id);
      const payerPhone = order.paymentMethod === "mobile_money"
        ? order.customerPhone.replace(/[\s-]/g, "")
        : undefined;
      const result = await apiOps.paymentInitiate(id, payerPhone, key);
      if (result.action.kind === "redirect") {
        window.location.assign(result.action.url);
        return;
      }
      if (result.action.kind === "prompt" || result.action.kind === "instructions") {
        setPaymentMessage(result.action.message);
      } else {
        setPaymentMessage("Your payment request is already in progress. We are checking the provider for the verified outcome.");
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The secure payment request could not be started.");
    } finally {
      setInitiating(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-8">
        <LoadingState rows={3} label="Loading order status" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-8">
        <ErrorState title="Order not found" message={error} />
      </div>
    );
  }

  if (!order) return null;

  const electronic = ["mobile_money", "card_hosted", "bank_transfer"].includes(order.paymentMethod);
  const paid = ["succeeded", "partially_refunded", "refunded"].includes(order.paymentStatus);
  const needsAction = electronic && (order.paymentStatus === "pending" || order.paymentStatus === "unpaid") && order.fulfilmentStatus !== "cancelled";

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-8">
      {/* headline state */}
      <div className="rounded-2xl border bg-card p-5 sm:p-6" role="status" aria-live="polite">
        {order.fulfilmentStatus === "cancelled" ? (
          <StatusHead
            icon={<XCircle className="size-8 text-destructive" aria-hidden />}
            title="Order cancelled"
            tone="danger"
            copy="This order was cancelled. Reserved stock was released. If you already paid, the refunds process covers you — nothing further is due."
          />
        ) : order.paymentStatus === "requires_review" ? (
          <StatusHead
            icon={<ShieldQuestion className="size-8 text-primary" aria-hidden />}
            title="Payment received — order under review"
            tone="info"
            copy="Your payment arrived after the stock reservation expired. Our team is re-checking availability and will contact you shortly: we will either fulfil the order or refund you in full."
          />
        ) : paid ? (
          <StatusHead
            icon={<PartyPopper className="size-8 text-success" aria-hidden />}
            title="Thank you — payment confirmed!"
            tone="success"
            copy={`Order ${order.reference} is confirmed and moving to our fulfilment team. ${order.fulfilment === "delivery" ? "Watch your delivery slot — we will pack and dispatch your groceries." : "We will pack your order and hold it for collection."}`}
          />
        ) : order.paymentStatus === "failed" ? (
          <StatusHead
            icon={<XCircle className="size-8 text-destructive" aria-hidden />}
            title="Payment did not go through"
            tone="danger"
            copy="The provider declined this payment, so the order was cancelled and its stock hold released. You can place the order again — nothing was charged twice."
          />
        ) : needsAction ? (
          <StatusHead
            icon={<PhoneCall className="size-8 animate-pulse text-primary" aria-hidden />}
            title="Complete your secure payment"
            tone="warning"
            copy={
              order.paymentMethod === "mobile_money"
                ? "Continue to the payment provider, then approve the Mobile Money request on your phone."
                : order.paymentMethod === "card_hosted"
                  ? "Continue to the payment provider's secure card checkout."
                  : "Continue to the payment provider to receive the verified bank-payment instructions."
            }
          />
        ) : (
          <StatusHead
            icon={<Clock className="size-8 text-muted-foreground" aria-hidden />}
            title="Payment outcome pending"
            tone="warning"
            copy="We are waiting for the provider's verified result. We will never ask you to pay twice — if the status stays pending, our team reconciles it with the provider."
          />
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <StatusBadge kind="payment" status={order.paymentStatus} />
          <StatusBadge kind="fulfilment" status={order.fulfilmentStatus} />
          {order.fulfilment === "delivery" ? <StatusBadge kind="delivery" status={order.deliveryStatus} /> : null}
          <span className="text-muted-foreground">Placed {order.createdAtLabel} UTC</span>
        </div>
      </div>

      {needsAction ? (
        <div className="mt-4 rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:p-5">
          <h2 className="font-semibold">Secure payment · {formatMoney(order.totalMinor)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {PAYMENT_METHOD_LABELS[order.paymentMethod]} to Variety Groceries. The provider handles the payment screen; Variety never collects card or wallet secrets in this page.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="lg" className="h-12" onClick={startPayment} disabled={initiating}>
              {initiating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldQuestion className="size-5" aria-hidden />}
              {initiating ? "Opening secure payment…" : "Continue to secure payment"}
            </Button>
          </div>
          {paymentMessage ? <p role="status" className="mt-3 rounded-lg bg-white/70 p-3 text-sm text-foreground">{paymentMessage}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Returning from the provider does not mark the order paid. The status changes only after server-side provider evidence is independently verified.
          </p>
        </div>
      ) : null}

      {/* order summary */}
      <div className="mt-4 space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Order {order.reference}</h2>
          {order.verificationCode ? (
            <p className="text-sm text-muted-foreground">
              Track any time with <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{order.reference}</code> +{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{order.verificationCode}</code>
            </p>
          ) : null}
        </div>
        <ul className="space-y-1.5 text-sm">
          {order.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <span>
                {l.productName} <span className="text-muted-foreground">({l.variantName}) × {l.quantity}</span>
              </span>
              <span className="tabular-nums">{l.lineTotalLabel}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t pt-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(order.subtotalMinor)}</span>
          </div>
          {order.discountMinor > 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span className="tabular-nums">−{formatMoney(order.discountMinor)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-muted-foreground">
            <span>{order.fulfilment === "delivery" ? "Delivery" : "Collection"}</span>
            <span className="tabular-nums">{order.deliveryFeeMinor === 0 ? "Free" : formatMoney(order.deliveryFeeMinor)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(order.totalMinor)}</span>
          </div>
        </div>
        <div className="border-t pt-2 text-sm">
          <p className="text-muted-foreground">
            {order.fulfilment === "delivery" ? `Delivery${order.slotLabel ? ` · ${order.slotLabel}` : ""}` : "Collect in store"}
            {" · "}
            {PAYMENT_METHOD_LABELS[order.paymentMethod]}
          </p>
        </div>
      </div>

      {/* recent events */}
      <div className="mt-4 rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="font-semibold">Progress</h2>
        <ol className="mt-3 space-y-3">
          {order.events.slice(-6).reverse().map((e, i) => (
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
                <p className="text-xs text-muted-foreground">
                  {e.atLabel} UTC{e.actor ? ` · ${e.actor}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {error ? <ErrorState message={error} onRetry={load} className="mt-4" /> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild variant="outline" className="h-11">
          <Link href={`/track?reference=${order.reference}`}>Track this order</Link>
        </Button>
        <Button asChild variant="ghost" className="h-11">
          <Link href="/shop">Continue shopping</Link>
        </Button>
      </div>

      {paid && order.fulfilmentStatus === "awaiting_confirmation" ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Our team confirms paid orders before picking. This page updates automatically.
        </p>
      ) : null}
    </div>
  );
}

function StatusHead({ icon, title, copy, tone }: { icon: React.ReactNode; title: string; copy: string; tone: "success" | "danger" | "warning" | "info" }) {
  return (
    <div className="flex gap-4">
      <div className={cn(
        "flex size-14 shrink-0 items-center justify-center rounded-full",
        tone === "success" && "bg-success/10",
        tone === "danger" && "bg-destructive/10",
        tone === "warning" && "bg-warning/15",
        tone === "info" && "bg-primary/10"
      )}>
        {icon}
      </div>
      <div className="space-y-1">
        <h1 className="font-serif text-xl font-bold sm:text-2xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{copy}</p>
      </div>
    </div>
  );
}
