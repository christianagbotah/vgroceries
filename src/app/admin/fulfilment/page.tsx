"use client";

import Link from "next/link";
import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  allows,
  EventTrail,
  HandoverNotice,
  NoteDialog,
  PackingChecklist,
  PickingMeta,
  PickerLineTable,
  QueueCardHeader,
  WorkflowStrip,
} from "@/features/staff/fulfilment-views";
import { Check, ClipboardCheck, Package, Truck, Store, RotateCw, TriangleAlert, StickyNote } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Fulfilment = Awaited<ReturnType<typeof apiOps.fulfilment>>;
type OrderCard = Fulfilment["pick"][number];
type NoteTarget = { order: OrderCard; kind: "pick" | "pack" } | null;
type DispatchRow = Fulfilment["dispatch"][number];
type HandoverTarget = DispatchRow | null;

export default function AdminFulfilmentPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.fulfilment(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<NoteTarget>(null);
  const [handoverTarget, setHandoverTarget] = useState<HandoverTarget>(null);

  const act = async (orderId: string, action: string, note?: string, lineId?: string) => {
    setBusy(orderId + action);
    try {
      await apiOps.orderAction({ orderId, action, actor: user.id, ...(note ? { note } : {}), ...(lineId ? { lineId } : {}) });
      toast({ title: "Order updated" });
      await reload();
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  /** Authoritative handover: the single stock-consumption event for delivery orders. */
  const handOver = async (o: DispatchRow) => {
    setBusy(o.id + "dispatch");
    try {
      await apiOps.orderAction({ orderId: o.id, action: "dispatch", actor: user.id });
      toast({
        title: `${o.reference} handed over to dispatch`,
        description: "Physical stock consumed exactly once. Assign a rider in Dispatch → Awaiting assignment.",
      });
      setHandoverTarget(null);
      await reload();
    } catch (e) {
      toast({ title: "Handover failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingState rows={6} label="Loading fulfilment queues" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const queueTotal =
    data.confirm.length + data.pick.length + data.picking.length + data.exceptions.length + data.dispatch.length + data.collection.length;

  const startPicking = (o: OrderCard) => act(o.id, "picking");
  const markPacked = (o: OrderCard) => act(o.id, "packed");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Fulfilment</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Picking, packing and handover workspace — {queueTotal} orders in flow. Picking and packing
            never deduct stock; the single depletion event happens at dispatch handover or collection,
            owned by the backend.
          </p>
        </div>
        <Button variant="outline" className="h-10" onClick={reload}>
          <RotateCw className="size-4" aria-hidden /> Refresh
        </Button>
      </div>

      <WorkflowStrip
        counts={{ confirm: data.confirm.length, pick: data.pick.length, picking: data.picking.length, packed: data.dispatch.length + data.collection.length }}
      />

      <Tabs defaultValue={data.pick.length ? "pick" : data.picking.length ? "picking" : "confirm"}>
        <TabsList className="h-12 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="confirm" className="gap-1.5 px-4">
            <Check className="size-4" aria-hidden /> Awaiting confirmation ({data.confirm.length})
          </TabsTrigger>
          <TabsTrigger value="pick" className="gap-1.5 px-4">
            <ClipboardCheck className="size-4" aria-hidden /> Ready to pick ({data.pick.length})
          </TabsTrigger>
          <TabsTrigger value="picking" className="gap-1.5 px-4">
            <Package className="size-4" aria-hidden /> Picking ({data.picking.length})
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="gap-1.5 px-4">
            <TriangleAlert className="size-4" aria-hidden /> Exceptions ({data.exceptions.length})
          </TabsTrigger>
          {data.pack.length ? (
            <TabsTrigger value="pack" className="gap-1.5 px-4">
              <Package className="size-4" aria-hidden /> Ready to pack ({data.pack.length})
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="handover" className="gap-1.5 px-4">
            <Truck className="size-4" aria-hidden /> Packed — handover ({data.dispatch.length})
          </TabsTrigger>
          <TabsTrigger value="collection" className="gap-1.5 px-4">
            <Store className="size-4" aria-hidden /> Collection ({data.collection.length})
          </TabsTrigger>
        </TabsList>

        {/* AWAITING CONFIRMATION */}
        <TabsContent value="confirm" className="mt-4">
          {data.confirm.length === 0 ? (
            <EmptyState icon={Check} title="Nothing awaiting confirmation" description="Newly placed online orders that need staff confirmation appear here." />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left">
                    <tr>
                      <th className="p-3 font-semibold">Reference</th>
                      <th className="p-3 font-semibold">Customer</th>
                      <th className="p-3 font-semibold">Type</th>
                      <th className="p-3 font-semibold">Payment</th>
                      <th className="p-3 font-semibold">Placed</th>
                      <th className="p-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.confirm.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="p-3 font-medium">
                          <Link href={`/admin/orders/${o.id}`} className="hover:underline focus-visible:underline">{o.reference}</Link>
                        </td>
                        <td className="p-3 text-muted-foreground">{o.customerName}</td>
                        <td className="p-3 capitalize text-muted-foreground">{o.fulfilment}</td>
                        <td className="p-3">
                          <StatusBadge kind="payment" status={o.paymentStatus} />
                          <span className="ml-1.5 text-xs text-muted-foreground">{o.paymentMethod.replace(/_/g, " ")}</span>
                        </td>
                        <td className="p-3 text-muted-foreground">{o.createdAtLabel}</td>
                        <td className="p-3 text-right">
                          {can("orders.confirm") ? (
                            <Button size="sm" className="h-10" disabled={busy !== null} onClick={() => act(o.id, "confirm")}>
                              Confirm
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Needs manager</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* READY TO PICK */}
        <TabsContent value="pick" className="mt-4 space-y-3">
          {data.pick.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Nothing to pick" description="Confirmed orders appear here with FEFO lot suggestions the moment picking starts." />
          ) : (
            data.pick.map((o) => (
              <article key={o.id} className="overflow-hidden rounded-xl border bg-card">
                <QueueCardHeader
                  order={o}
                  right={
                    <>
                      <StatusBadge kind="payment" status={o.paymentStatus} />
                      <StatusBadge kind="fulfilment" status={o.fulfilmentStatus} />
                      {can("orders.fulfil") && allows(o, "picking") ? (
                        <Button className="h-10" disabled={busy !== null} onClick={() => startPicking(o)}>
                          <ClipboardCheck className="size-4" aria-hidden /> Start picking
                        </Button>
                      ) : null}
                    </>
                  }
                />
                <PickerLineTable lines={o.lines} />
                <EventTrail events={o.events ?? []} />
              </article>
            ))
          )}
        </TabsContent>

        {/* PICKING IN PROGRESS — the picker/packer workspace */}
        <TabsContent value="picking" className="mt-4 space-y-3">
          {data.picking.length === 0 ? (
            <EmptyState icon={Package} title="No picking in progress" description="Orders with picking started appear here — lines, lots, shortages and the packing checklist." />
          ) : (
            data.picking.map((o) => (
              <article key={o.id} className="overflow-hidden rounded-xl border bg-card">
                <QueueCardHeader
                  order={o}
                  right={
                    <>
                      <StatusBadge kind="payment" status={o.paymentStatus} />
                      <StatusBadge kind="fulfilment" status={o.fulfilmentStatus} />
                      {can("orders.fulfil") && allows(o, "note") ? (
                        <Button variant="outline" className="h-10" disabled={busy !== null} onClick={() => setNoteTarget({ order: o, kind: "pick" })}>
                          <StickyNote className="size-4" aria-hidden /> Record note
                        </Button>
                      ) : null}
                      {can("orders.fulfil") && allows(o, "packed") ? (
                        <Button className="h-10" disabled={busy !== null} onClick={() => markPacked(o)}>
                          <Check className="size-4" aria-hidden /> Complete &amp; mark packed
                        </Button>
                      ) : null}
                    </>
                  }
                />
                <div className="space-y-3 p-4">
                  <PickingMeta order={o} />
                  <PickerLineTable lines={o.lines} />
                  <PackingChecklist lines={o.lines} />
                </div>
                <EventTrail events={o.events ?? []} />
              </article>
            ))
          )}
        </TabsContent>

        {/* EXCEPTIONS — shortages and substitutions needing a decision */}
        <TabsContent value="exceptions" className="mt-4 space-y-3">
          {data.exceptions.length === 0 ? (
            <EmptyState icon={TriangleAlert} title="No exceptions" description="Shortages and substitutions detected during picking appear here for a decision." />
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  These orders have lines the picker could not fully allocate, or substitutions that
                  changed what ships. Resolve each line — substitute the item, note the shortage for
                  the customer, or ask the order owner to cancel/refund the line.
                </p>
              </div>
              {data.exceptions.map((o) => (
                <article key={o.id} className="overflow-hidden rounded-xl border border-warning/40 bg-card">
                  <QueueCardHeader
                    order={o}
                    badge={<span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-[color:var(--warning-foreground)]">exception</span>}
                    right={
                      <>
                        <StatusBadge kind="payment" status={o.paymentStatus} />
                        <StatusBadge kind="fulfilment" status={o.fulfilmentStatus} />
                        {can("orders.fulfil") && allows(o, "note") ? (
                          <Button variant="outline" className="h-10" disabled={busy !== null} onClick={() => setNoteTarget({ order: o, kind: "pick" })}>
                            <StickyNote className="size-4" aria-hidden /> Record note
                          </Button>
                        ) : null}
                        {can("orders.fulfil") && allows(o, "substitute") ? (
                          <Button asChild variant="outline" className="h-10">
                            <Link href={`/admin/orders/${o.id}`}>Open order to substitute</Link>
                          </Button>
                        ) : null}
                      </>
                    }
                  />
                  <div className="space-y-3 p-4">
                    <PickingMeta order={o} />
                    <PickerLineTable lines={o.lines} />
                  </div>
                  <EventTrail events={o.events ?? []} />
                </article>
              ))}
            </>
          )}
        </TabsContent>

        {/* READY TO PACK — populated only when the backend exposes a picked state */}
        <TabsContent value="pack" className="mt-4 space-y-3">
          {data.pack.length === 0 ? (
            <EmptyState icon={Package} title="Nothing waiting for packing" description="This queue fills when the backend fulfilment authority reports a separate picked state." />
          ) : (
            data.pack.map((o) => (
              <article key={o.id} className="overflow-hidden rounded-xl border bg-card">
                <QueueCardHeader
                  order={o}
                  right={
                    <>
                      <StatusBadge kind="payment" status={o.paymentStatus} />
                      {can("orders.fulfil") && allows(o, "packed") ? (
                        <Button className="h-10" disabled={busy !== null} onClick={() => markPacked(o)}>
                          <Check className="size-4" aria-hidden /> Mark packed
                        </Button>
                      ) : null}
                    </>
                  }
                />
                <PickerLineTable lines={o.lines} />
              </article>
            ))
          )}
        </TabsContent>

        {/* PACKED — HANDOVER */}
        <TabsContent value="handover" className="mt-4 space-y-3">
          <HandoverNotice />
          <p className="text-sm text-muted-foreground">
            Handing over records the authoritative stock consumption for these orders and moves them to
            the <Link href="/admin/dispatch" className="font-medium text-primary hover:underline focus-visible:underline">Dispatch awaiting-assignment queue</Link>.
          </p>
          {data.dispatch.length === 0 ? (
            <EmptyState icon={Truck} title="Nothing awaiting handover" description="Packed delivery orders appear here for the stock-consuming handover to dispatch." />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left">
                    <tr>
                      <th className="p-3 font-semibold">Reference</th>
                      <th className="p-3 font-semibold">Customer</th>
                      <th className="p-3 font-semibold">Zone</th>
                      <th className="p-3 font-semibold">Slot</th>
                      <th className="p-3 font-semibold">Payment</th>
                      <th className="p-3 font-semibold">Packed</th>
                      <th className="p-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dispatch.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="p-3 font-medium">
                          <Link href={`/admin/orders/${o.id}`} className="hover:underline focus-visible:underline">{o.reference}</Link>
                          <p className="text-xs text-muted-foreground">{o.lineCount} lines · {o.totalLabel}</p>
                        </td>
                        <td className="p-3 text-muted-foreground">{o.customerName ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{o.zone ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{o.slotLabel ?? "—"}</td>
                        <td className="p-3">
                          <StatusBadge kind="payment" status={o.paymentStatus} />
                          {o.paymentMethod === "cash_on_delivery" ? (
                            <span className="ml-1.5 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold">COD</span>
                          ) : null}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {o.packedByName ? `${o.packedByName} · ` : ""}
                          {o.packedAtLabel ?? "—"}
                        </td>
                        <td className="p-3 text-right">
                          <Button size="sm" className="h-10" onClick={() => setHandoverTarget(o)}>
                            <Truck className="size-3.5" aria-hidden /> Hand over to dispatch
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* READY FOR COLLECTION */}
        <TabsContent value="collection" className="mt-4">
          {data.collection.length === 0 ? (
            <EmptyState icon={Store} title="No collection orders" description="Collection orders appear here until they are collected." />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left">
                    <tr>
                      <th className="p-3 font-semibold">Reference</th>
                      <th className="p-3 font-semibold">Customer</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3 font-semibold">Payment</th>
                      <th className="p-3 font-semibold">Packed</th>
                      <th className="p-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.collection.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="p-3 font-medium">
                          <Link href={`/admin/orders/${o.id}`} className="hover:underline focus-visible:underline">{o.reference}</Link>
                          <p className="text-xs text-muted-foreground">{o.lineCount} lines · {o.totalLabel}</p>
                        </td>
                        <td className="p-3 text-muted-foreground">{o.customerName}</td>
                        <td className="p-3"><StatusBadge kind="fulfilment" status={o.fulfilmentStatus} /></td>
                        <td className="p-3">
                          <StatusBadge kind="payment" status={o.paymentStatus} />
                          <span className="ml-1.5 text-xs text-muted-foreground">{o.paymentMethod.replace(/_/g, " ")}</span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {o.packedByName ? `${o.packedByName} · ` : ""}
                          {o.packedAtLabel ?? "—"}
                        </td>
                        <td className="p-3 text-right">
                          {o.fulfilmentStatus === "ready_for_collection" && can("orders.fulfil") ? (
                            <Button size="sm" className="h-10" disabled={busy !== null} onClick={() => act(o.id, "collect")}>
                              <Check className="size-4" aria-hidden /> Customer collected
                            </Button>
                          ) : (
                            <Link href={`/admin/orders/${o.id}`} className="text-sm text-primary hover:underline focus-visible:underline">Open order</Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NoteDialog
        open={!!noteTarget}
        onOpenChange={(o) => !o && setNoteTarget(null)}
        title={`Record a note on ${noteTarget?.order.reference ?? ""}`}
        description="Notes are visible to staff; the customer sees notes when the order is marked for them."
        placeholder="e.g. shelf gap on L-TOM-231, picked 1 of 2, customer accepted the shortage"
        submitLabel="Save note"
        busy={busy !== null}
        withLineChoice
        lines={noteTarget?.order.lines}
        onSubmit={(note, lineId) => {
          if (noteTarget) void act(noteTarget.order.id, "note", note, lineId);
          setNoteTarget(null);
        }}
      />

      {/* authoritative handover confirmation — this is the stock-consumption event */}
      <Dialog open={!!handoverTarget} onOpenChange={(o) => !o && setHandoverTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hand over {handoverTarget?.reference} to dispatch?</DialogTitle>
            <DialogDescription>
              This is the authoritative fulfilment handover: physical stock for this order is consumed
              exactly once, and the order moves to Dispatch awaiting assignment. Rider and dispatch
              actions after this point never change sellable stock.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
            {handoverTarget ? `${handoverTarget.customerName ?? "Customer"} · ${handoverTarget.lineCount} lines · ${handoverTarget.totalLabel}` : ""}
            {handoverTarget?.slotLabel ? ` · ${handoverTarget.slotLabel}` : ""}
          </p>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" className="h-11" onClick={() => setHandoverTarget(null)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button className="h-11" onClick={() => handoverTarget && void handOver(handoverTarget)} disabled={busy !== null}>
              {busy ? "Handing over…" : "Hand over — consume stock once"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
