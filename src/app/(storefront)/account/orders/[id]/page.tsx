"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiOps, ApiError, type PublicOrder } from "@/services/client";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/types/domain";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Ban, CircleDashed, MessageSquarePlus, Package } from "lucide-react";

export default function AccountOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    try {
      setOrder(await apiOps.orderStatus(id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this order.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const cancelOrder = async () => {
    setActing(true);
    try {
      await apiOps.accountCancel(id, cancelReason.trim() || "Customer request");
      toast({ title: "Order cancelled", description: "Reserved stock was released." });
      setCancelOpen(false);
      await load();
    } catch (e) {
      toast({
        title: "Could not cancel",
        description: e instanceof ApiError ? e.message : "Please contact support.",
        variant: "destructive",
      });
    } finally {
      setActing(false);
    }
  };

  if (error) return <ErrorState message={error} />;
  if (!order) return <LoadingState rows={4} label="Loading order" />;

  const cancellable = !["delivered", "collected", "dispatched", "cancelled"].includes(order.fulfilmentStatus);
  const returnable = ["delivered", "collected"].includes(order.fulfilmentStatus);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl font-bold">Order {order.reference}</h2>
          <p className="text-sm text-muted-foreground">Placed {order.createdAtLabel} UTC</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge kind="payment" status={order.paymentStatus} />
          <StatusBadge kind="fulfilment" status={order.fulfilmentStatus} />
          {order.fulfilment === "delivery" ? <StatusBadge kind="delivery" status={order.deliveryStatus} /> : null}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold">Items</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {order.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <span>
                {l.productName} <span className="text-muted-foreground">({l.variantName}) × {l.quantity}</span>
                {l.substitutionOfLineId ? <em className="ml-1 text-xs text-muted-foreground">(substitute)</em> : null}
              </span>
              <span className="tabular-nums">{l.lineTotalLabel}</span>
            </li>
          ))}
        </ul>
        <Separator className="my-3" />
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(order.subtotalMinor)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{order.fulfilment === "delivery" ? "Delivery" : "Collection"}</span>
            <span className="tabular-nums">{order.deliveryFeeMinor === 0 ? "Free" : formatMoney(order.deliveryFeeMinor)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(order.totalMinor)}</span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            {PAYMENT_METHOD_LABELS[order.paymentMethod]}
            {order.slotLabel ? ` · ${order.slotLabel}` : ""}
          </p>
        </div>
      </div>

      {order.notes.filter((n) => !("internalOnly" in n)).length ? (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Updates</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {order.notes.map((n) => (
              <li key={n.at} className="text-muted-foreground">
                <span className="text-foreground">{n.text}</span>{" "}
                <span className="text-xs">({formatDateTime(n.at)} UTC)</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold">History</h3>
        <ol className="mt-2 space-y-2.5">
          {order.events.slice().reverse().map((e, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">{e.action}</p>
                <p className="text-xs text-muted-foreground">{e.atLabel} UTC</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        {returnable ? (
          <Button asChild className="h-11">
            <Link href={`/account/returns?orderId=${order.id}`}>Request a return or refund</Link>
          </Button>
        ) : null}
        {cancellable ? (
          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-11">
                <Ban className="size-4" aria-hidden /> Cancel order
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel order {order.reference}?</DialogTitle>
                <DialogDescription>
                  Cancellation releases the stock reserved for you. If your payment already went
                  through, the refund workflow handles your money — nothing is lost.
                </DialogDescription>
              </DialogHeader>
              <div>
                <Label htmlFor="cancel-reason">Reason (optional)</Label>
                <Textarea
                  id="cancel-reason"
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Tell us why — it helps us improve"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={acting}>
                  Keep the order
                </Button>
                <Button variant="destructive" onClick={cancelOrder} disabled={acting}>
                  {acting ? "Cancelling…" : "Cancel order"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : order.fulfilmentStatus === "cancelled" ? (
          <p className="rounded-lg border border-dashed p-2.5 text-sm text-muted-foreground">This order was cancelled.</p>
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-dashed p-2.5 text-sm text-muted-foreground">
            <Package className="mt-0.5 size-4 shrink-0" aria-hidden />
            This order has left the store, so it cannot be cancelled — use the returns workflow
            instead.
          </p>
        )}
      </div>
    </div>
  );
}
