"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiOps, ApiError, type PublicOrder } from "@/services/client";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, DELIVERY_LABELS } from "@/types/domain";
import { useToast } from "@/hooks/use-toast";
import { Ban, Check, CircleDashed, MapPin, MessageSquarePlus, Package, Phone, Repeat2, Send, ShieldQuestion, Store, Truck, Undo2 } from "lucide-react";

type Internal = Awaited<ReturnType<typeof apiOps.order>>["internal"];

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useStaff();
  const { toast } = useToast();

  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [internal, setInternal] = useState<Internal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // dialogs
  const [noteText, setNoteText] = useState("");
  const [noteInternalOnly, setNoteInternalOnly] = useState(true);
  const [cancelReason, setCancelReason] = useState("");
  const [subLineId, setSubLineId] = useState("");
  const [subVariantId, setSubVariantId] = useState("");
  const [subPermission, setSubPermission] = useState("Customer agreed by phone");
  const [reviewDecision, setReviewDecision] = useState<"fulfil" | "cancel_refund">("fulfil");
  const [reviewReason, setReviewReason] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await apiOps.order(id);
      setOrder(r.order);
      setInternal(r.internal);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this order.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: string, extra: Record<string, unknown> = {}, successNote?: string) => {
    setBusy(action);
    try {
      const updated = await apiOps.orderAction({ orderId: id, action, actor: user.id, ...extra });
      setOrder(updated);
      await load();
      toast({ title: successNote ?? "Order updated" });
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingState rows={6} label="Loading order" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order || !internal) return null;

  const isDelivery = order.fulfilment === "delivery";
  const fStatus = order.fulfilmentStatus;

  const canConfirm = can("orders.confirm") && fStatus === "awaiting_confirmation";
  const canPick = can("orders.fulfil") && fStatus === "confirmed";
  const canPack = can("orders.fulfil") && fStatus === "picking";
  const canReady = can("orders.fulfil") && fStatus === "packed" && !isDelivery;
  const canCollect = can("orders.fulfil") && fStatus === "ready_for_collection";
  const canDispatch = can("dispatch.assign") && fStatus === "packed" && isDelivery;
  const canCancel = can("orders.cancel") && !["delivered", "collected", "cancelled", "dispatched"].includes(fStatus);
  const canSubstitute = can("orders.substitute") && ["confirmed", "picking"].includes(fStatus);
  const needsReview = order.paymentStatus === "requires_review";

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/admin/orders" className="hover:underline focus-visible:underline">Orders</Link>
            <span aria-hidden> / </span> <span>{order.reference}</span>
          </nav>
          <h1 className="mt-1 font-serif text-2xl font-bold">{order.reference}</h1>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <StatusBadge kind="payment" status={order.paymentStatus} />
            <StatusBadge kind="fulfilment" status={order.fulfilmentStatus} />
            {isDelivery ? <StatusBadge kind="delivery" status={order.deliveryStatus} /> : null}
            <StatusBadge kind="generic" status={order.channel} label={order.channel === "pos" ? "Counter" : "Online"} />
            {order.posReceiptNo ? <StatusBadge kind="generic" status="receipt" label={`Receipt ${order.posReceiptNo}`} /> : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Placed {order.createdAtLabel} UTC</p>
      </div>

      {needsReview ? (
        <div role="alert" className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldQuestion className="size-5 text-primary" aria-hidden /> Paid after reservation expiry — staff decision required
          </p>
          <p className="text-sm text-muted-foreground">
            Payment succeeded after the stock hold expired. Choose: re-check stock and continue
            fulfilment, or cancel and refund the customer.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Select value={reviewDecision} onValueChange={(v) => setReviewDecision(v as typeof reviewDecision)} aria-label="Review decision">
              <SelectTrigger className="h-11 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fulfil">Re-check stock and fulfil</SelectItem>
                <SelectItem value="cancel_refund">Cancel and refund</SelectItem>
              </SelectContent>
            </Select>
            <Input label="Reason" className="h-11 w-64" placeholder="Reason (recorded)" value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} />
            <Button
              className="h-11"
              disabled={busy !== null || !reviewReason.trim()}
              onClick={() => act("resolve_review", { decision: reviewDecision, reason: reviewReason }, "Review resolved")}
            >
              Resolve
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {/* lines */}
          <section aria-labelledby="lines-heading" className="rounded-xl border bg-card">
            <h2 id="lines-heading" className="border-b p-4 font-semibold">Lines & allocations</h2>
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="p-3 font-semibold">Item</th>
                    <th className="p-3 font-semibold">Qty</th>
                    <th className="p-3 text-right font-semibold">Unit</th>
                    <th className="p-3 text-right font-semibold">Total</th>
                    <th className="hidden p-3 font-semibold md:table-cell">Suggested lots (FEFO)</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((l) => (
                    <tr key={l.id} className="border-t align-top">
                      <td className="p-3">
                        <Link href={`/admin/products/${l.productId}`} className="font-medium hover:underline focus-visible:underline">
                          {l.productName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{l.variantName}</p>
                        {l.substitutionOfLineId ? <p className="text-xs italic text-muted-foreground">substitution</p> : null}
                      </td>
                      <td className="p-3 tabular-nums">{l.quantity}</td>
                      <td className="p-3 text-right tabular-nums">{l.unitPriceLabel}</td>
                      <td className="p-3 text-right font-medium tabular-nums">{l.lineTotalLabel}</td>
                      <td className="hidden p-3 md:table-cell">
                        {l.allocations.length ? (
                          <ul className="space-y-0.5 text-xs text-muted-foreground">
                            {l.allocations.map((a, i) => {
                              const lot = internal?.reservations ? undefined : undefined;
                              void lot;
                              const alloc = l.allocations[i];
                              void alloc;
                              return (
                                <li key={a.lotId}>
                                  {a.quantity} from {a.lotId.replace("lot_l_", "").replace(/_/g, "-").toUpperCase()}
                                </li>
                              );
                            })}
                          </ul>
                        ) : fStatus === "picking" || fStatus === "packed" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">recorded at picking</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1 border-t p-4 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{formatMoney(order.subtotalMinor)}</span></div>
              {order.discountMinor > 0 ? <div className="flex justify-between text-muted-foreground"><span>Discount</span><span className="tabular-nums">−{formatMoney(order.discountMinor)}</span></div> : null}
              <div className="flex justify-between text-muted-foreground"><span>{isDelivery ? "Delivery fee" : "Collection"}</span><span className="tabular-nums">{order.deliveryFeeMinor === 0 ? "Free" : formatMoney(order.deliveryFeeMinor)}</span></div>
              <div className="flex justify-between font-bold"><span>Total</span><span className="tabular-nums">{formatMoney(order.totalMinor)}</span></div>
            </div>
          </section>

          {/* history */}
          <section aria-labelledby="hist-heading" className="rounded-xl border bg-card">
            <h2 id="hist-heading" className="border-b p-4 font-semibold">History</h2>
            <ol className="space-y-3 p-4">
              {order.events.slice().reverse().map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="font-medium">{e.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.atLabel} UTC · {e.actor}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {internal.customerNotes.length ? (
              <div className="border-t p-4">
                <h3 className="mb-2 text-sm font-semibold">Notes</h3>
                <ul className="space-y-2 text-sm">
                  {internal.customerNotes.map((n: { at: string; by: string; text: string; internalOnly: boolean }, i: number) => (
                    <li key={i} className="rounded-lg bg-muted/50 p-2.5">
                      <p>{n.text}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(n.at)} UTC · {n.by}{n.internalOnly ? " · internal" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>

        {/* right column */}
        <div className="space-y-4">
          {/* customer & delivery */}
          <section className="space-y-3 rounded-xl border bg-card p-4 text-sm">
            <h2 className="font-semibold">Customer & {isDelivery ? "delivery" : "collection"}</h2>
            <div className="space-y-1">
              <p className="font-medium">{order.customerName}</p>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="size-3.5" aria-hidden /> {order.customerPhone || "—"}
              </p>
              {internal.address ? (
                <div className="text-muted-foreground">
                  <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> <span>{(internal.address as { street: string; locality: string; landmark?: string; ghanaPostGps?: string; recipientName: string }).street}, {(internal.address as { locality: string }).locality}{(internal.address as { landmark?: string })?.landmark ? ` · ${(internal.address as { landmark?: string }).landmark}` : ""}</span></p>
                  {(internal.address as { ghanaPostGps?: string }).ghanaPostGps ? (
                    <p className="font-mono text-xs">{(internal.address as { ghanaPostGps?: string }).ghanaPostGps}</p>
                  ) : null}
                </div>
              ) : isDelivery ? (
                <p className="text-muted-foreground">Address on delivery job</p>
              ) : (
                <p className="flex items-center gap-1.5 text-muted-foreground"><Store className="size-3.5" aria-hidden /> Collect in store</p>
              )}
              {internal.zone ? <p className="text-muted-foreground">Zone: {internal.zone.name}</p> : null}
              {order.slotLabel ? <p className="text-muted-foreground">{order.slotLabel}</p> : null}
            </div>
            {order.job ? (
              <div className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Delivery job</p>
                <p>Status: {DELIVERY_LABELS[order.job.status as keyof typeof DELIVERY_LABELS] ?? order.job.status}</p>
                {order.job.riderName ? <p>Rider: {order.job.riderName}</p> : null}
                {order.job.cashToCollectLabel ? <p>Cash to collect: {order.job.cashToCollectLabel}{order.job.cashCollectedAt ? " (collected)" : ""}</p> : null}
                {order.job.failureReason ? <p className="text-destructive">Failed: {order.job.failureReason}</p> : null}
              </div>
            ) : null}
          </section>

          {/* payments */}
          <section className="space-y-3 rounded-xl border bg-card p-4 text-sm">
            <h2 className="font-semibold">Payment</h2>
            <p className="text-muted-foreground">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</p>
            {order.paymentAttempts.length ? (
              <ul className="space-y-2">
                {order.paymentAttempts.map((a) => (
                  <li key={a.id} className="rounded-lg bg-muted/50 p-2.5 text-xs">
                    <p className="flex justify-between font-medium"><span>{a.method === "mobile_money" ? "Mobile Money" : a.method === "card_hosted" ? "Card" : a.method}</span><span className="tabular-nums">{a.amountLabel}</span></p>
                    <p className="mt-0.5 text-muted-foreground">
                      {a.status}{a.providerRef ? ` · ${a.providerRef}` : ""} · {a.callbackCount} callback{a.callbackCount === 1 ? "" : "s"}
                      {a.settlementState !== "unsettled" ? ` · ${a.settlementState}` : ""}
                    </p>
                    {a.failureReason ? <p className="text-destructive">{a.failureReason}</p> : null}
                    {a.note ? <p className="text-muted-foreground">{a.note}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No electronic attempt — cash at counter / on delivery.</p>
            )}
            {internal.refunds.length ? (
              <div>
                <h3 className="text-xs font-semibold">Refunds</h3>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {internal.refunds.map((r) => (
                    <li key={r.id} className="flex justify-between">
                      <span>{r.reason}</span>
                      <span className="tabular-nums">{r.amountLabel} · {r.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {order.stockConsumedAt ? `Stock consumed ${formatDateTime(order.stockConsumedAt)} UTC (single depletion event).` : "Stock still on hold — consumed at dispatch handover or collection."}
            </p>
          </section>

          {/* reservations */}
          {internal.reservations.length ? (
            <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
              <h2 className="font-semibold">Stock holds</h2>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {internal.reservations.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="font-mono">{r.variantId.replace("var_", "")}</span>
                    <span>
                      {r.quantity} ·{" "}
                      {r.consumedAt ? "consumed" : r.releasedAt ? `released (${r.releasedReason})` : `expires ${formatDateTime(r.expiresAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      {/* actions */}
      <section aria-labelledby="actions-heading" className="space-y-3 rounded-xl border bg-card p-4">
        <h2 id="actions-heading" className="font-semibold">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {canConfirm ? (
            <Button className="h-11" disabled={busy !== null} onClick={() => act("confirm", {}, "Order confirmed")}>
              <Check className="size-4" aria-hidden /> Confirm order
            </Button>
          ) : null}
          {canPick ? (
            <Button className="h-11" disabled={busy !== null} onClick={() => act("picking", {}, "Picking started — FEFO lots recorded")}>
              <Package className="size-4" aria-hidden /> Start picking
            </Button>
          ) : null}
          {canPack ? (
            <Button className="h-11" disabled={busy !== null} onClick={() => act("packed", {}, "Order packed")}>
              <Package className="size-4" aria-hidden /> Mark packed
            </Button>
          ) : null}
          {canReady ? (
            <Button className="h-11" disabled={busy !== null} onClick={() => act("ready_for_collection", {}, "Waiting for collection")}>
              <Store className="size-4" aria-hidden /> Ready for collection
            </Button>
          ) : null}
          {canCollect ? (
            <Button className="h-11" disabled={busy !== null} onClick={() => act("collect", {}, "Collected — stock consumed once")}>
              <Check className="size-4" aria-hidden /> Customer collected
            </Button>
          ) : null}
          {canDispatch ? (
            <Button asChild className="h-11">
              <Link href={`/admin/dispatch?order=${order.id}`}><Truck className="size-4" aria-hidden /> Send to dispatch</Link>
            </Button>
          ) : null}

          {/* note dialog */}
          {can("orders.view") ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-11">
                  <MessageSquarePlus className="size-4" aria-hidden /> Add note
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a note to {order.reference}</DialogTitle>
                  <DialogDescription>Internal notes stay in the back office; shared notes are visible to the customer.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="note-text">Note</Label>
                  <Textarea id="note-text" rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={noteInternalOnly} onChange={(e) => setNoteInternalOnly(e.target.checked)} className="size-4 accent-[color:var(--primary)]" />
                    Internal only
                  </label>
                </div>
                <DialogFooter>
                  <Button
                    disabled={busy !== null || !noteText.trim()}
                    onClick={async () => {
                      await act("note", { note: noteText, internalOnly: noteInternalOnly }, "Note added");
                      setNoteText("");
                    }}
                  >
                    Save note
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}

          {/* substitution dialog */}
          {canSubstitute && internal.suggestions.length ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-11">
                  <Repeat2 className="size-4" aria-hidden /> Substitute a line
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Substitute with customer permission</DialogTitle>
                  <DialogDescription>
                    The replacement is reserved and prices recalculated by the service — never a
                    silent swap.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="sub-line">Order line</Label>
                    <Select value={subLineId} onValueChange={setSubLineId}>
                      <SelectTrigger id="sub-line" className="h-11 w-full"><SelectValue placeholder="Choose the line" /></SelectTrigger>
                      <SelectContent>
                        {order.lines.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.productName} ({l.variantName}) × {l.quantity}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="sub-variant">Replacement (same product, other variant)</Label>
                    <Select value={subVariantId} onValueChange={setSubVariantId}>
                      <SelectTrigger id="sub-variant" className="h-11 w-full"><SelectValue placeholder="Choose replacement" /></SelectTrigger>
                      <SelectContent>
                        {internal.suggestions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name} · {s.priceLabel} · {s.availableToSell} available</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="sub-permission">Customer permission</Label>
                    <Textarea id="sub-permission" rows={2} value={subPermission} onChange={(e) => setSubPermission(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    disabled={busy !== null || !subLineId || !subVariantId}
                    onClick={async () => {
                      await act("substitute", { lineId: subLineId, newVariantId: subVariantId, permissionNote: subPermission }, "Substitution recorded");
                    }}
                  >
                    Substitute line
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}

          {/* cancel dialog */}
          {canCancel ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-11 text-destructive hover:bg-destructive/10 hover:text-destructive">
                  <Ban className="size-4" aria-hidden /> Cancel order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancel {order.reference}?</DialogTitle>
                  <DialogDescription>
                    Cancellation releases unconsumed stock holds. Orders that already left the store
                    must use the returns workflow instead.
                  </DialogDescription>
                </DialogHeader>
                <div>
                  <Label htmlFor="cancel-reason">Reason</Label>
                  <Textarea id="cancel-reason" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason recorded in the audit log" />
                </div>
                <DialogFooter>
                  <Button
                    variant="destructive"
                    disabled={busy !== null || !cancelReason.trim()}
                    onClick={async () => {
                      await act("cancel", { reason: cancelReason }, "Order cancelled — holds released");
                      setCancelReason("");
                    }}
                  >
                    <Undo2 className="size-4" aria-hidden /> Cancel order
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
        {!canConfirm && !canPick && !canPack && !canCollect && !canDispatch && !canCancel ? (
          <p className="text-sm text-muted-foreground">
            No actions available for this order in its current state, or your demo role lacks the
            permission.
          </p>
        ) : null}
        <Separator />
        <div className="flex flex-wrap gap-2 text-sm">
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href="/admin/orders"><Send className="size-3.5" aria-hidden /> All orders</Link>
          </Button>
          {order.channel === "online" && ["delivered", "collected"].includes(order.fulfilmentStatus) ? (
            <Button asChild variant="ghost" size="sm" className="h-9">
              <Link href={`/admin/returns?orderId=${order.id}`}>Start a return for this order</Link>
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** Small labelled input helper (avoids repetitive JSX). */
function Input({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className={className}>
      {label ? <Label htmlFor={props.id}>{label}</Label> : null}
      <input
        id={props.id}
        className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
        {...props}
      />
    </div>
  );
}
