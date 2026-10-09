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
import { formatDate } from "@/lib/format";
import { Check, ClipboardCheck, Package, Truck, Store, RotateCw } from "lucide-react";

type Fulfilment = Awaited<ReturnType<typeof apiOps.fulfilment>>;
type QueueLine = Fulfilment["pick"][number]["lines"][number];

export default function AdminFulfilmentPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.fulfilment(), []);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (orderId: string, action: string, note?: string) => {
    setBusy(orderId + action);
    try {
      await apiOps.orderAction({ orderId, action, actor: user.id, ...(note ? { note } : {}) });
      toast({ title: "Order updated" });
      await reload();
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingState rows={6} label="Loading fulfilment queues" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const total =
    data.confirm.length + data.pick.length + data.pack.length + data.dispatch.length + data.collection.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Fulfilment</h1>
          <p className="text-sm text-muted-foreground">
            Picking and packing queues — {total} orders in flow. Picking never deducts stock; the
            single depletion event happens at dispatch handover or collection.
          </p>
        </div>
        <Button variant="outline" className="h-10" onClick={reload}>
          <RotateCw className="size-4" aria-hidden /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="pick">
        <TabsList className="h-12 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="pick" className="gap-1.5 px-4">
            <ClipboardCheck className="size-4" aria-hidden /> To pick ({data.pick.length})
          </TabsTrigger>
          <TabsTrigger value="pack" className="gap-1.5 px-4">
            <Package className="size-4" aria-hidden /> To pack ({data.pack.length})
          </TabsTrigger>
          <TabsTrigger value="confirm" className="gap-1.5 px-4">
            <Check className="size-4" aria-hidden /> Awaiting confirmation ({data.confirm.length})
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="gap-1.5 px-4">
            <Truck className="size-4" aria-hidden /> Dispatch ({data.dispatch.length})
          </TabsTrigger>
          <TabsTrigger value="collection" className="gap-1.5 px-4">
            <Store className="size-4" aria-hidden /> Collection ({data.collection.length})
          </TabsTrigger>
        </TabsList>

        {/* PICK — the picker sees variants, units, quantities and eligible lots */}
        <TabsContent value="pick" className="mt-4 space-y-3">
          {data.pick.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Nothing to pick" description="Confirmed orders appear here with FEFO lot suggestions." />
          ) : (
            data.pick.map((o) => (
              <article key={o.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                  <div>
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline focus-visible:underline">
                      {o.reference}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {o.customerName} · {o.fulfilment === "delivery" ? o.slotLabel ?? "Delivery" : "Collection"} · {o.totalLabel}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge kind="payment" status={o.paymentStatus} />
                    <StatusBadge kind="fulfilment" status={o.fulfilmentStatus} />
                    {o.fulfilmentStatus === "confirmed" && can("orders.fulfil") ? (
                      <Button className="h-10" disabled={busy !== null} onClick={() => act(o.id, "picking")}>
                        <ClipboardCheck className="size-4" aria-hidden /> Start picking
                      </Button>
                    ) : null}
                  </div>
                </div>
                <LineTable lines={o.lines} />
              </article>
            ))
          )}
        </TabsContent>

        {/* PACK */}
        <TabsContent value="pack" className="mt-4 space-y-3">
          {data.pack.length === 0 ? (
            <EmptyState icon={Package} title="Nothing to pack" description="Picked orders wait here for packing." />
          ) : (
            data.pack.map((o) => (
              <article key={o.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                  <div>
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline focus-visible:underline">
                      {o.reference}
                    </Link>
                    <p className="text-sm text-muted-foreground">{o.customerName} · {o.fulfilment === "delivery" ? "Delivery" : "Collection"} · {o.totalLabel}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge kind="payment" status={o.paymentStatus} />
                    {can("orders.fulfil") ? (
                      <Button className="h-10" disabled={busy !== null} onClick={() => act(o.id, "packed")}>
                        <Package className="size-4" aria-hidden /> Mark packed
                      </Button>
                    ) : null}
                  </div>
                </div>
                <LineTable lines={o.lines} />
              </article>
            ))
          )}
        </TabsContent>

        {/* CONFIRM */}
        <TabsContent value="confirm" className="mt-4">
          {data.confirm.length === 0 ? (
            <EmptyState icon={Check} title="Nothing awaiting confirmation" description="Newly placed orders that need staff confirmation appear here." />
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
                            <Button
                              size="sm"
                              className="h-10"
                              disabled={busy !== null}
                              onClick={() => act(o.id, "confirm")}
                            >
                              Confirm
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Needs {`manager`}</span>
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

        {/* DISPATCH */}
        <TabsContent value="dispatch" className="mt-4">
          {data.dispatch.length === 0 ? (
            <EmptyState icon={Truck} title="Nothing ready for dispatch" description="Packed delivery orders appear here for rider assignment." />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left">
                    <tr>
                      <th className="p-3 font-semibold">Reference</th>
                      <th className="p-3 font-semibold">Zone</th>
                      <th className="p-3 font-semibold">Payment</th>
                      <th className="p-3 text-right font-semibold">COD amount</th>
                      <th className="p-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dispatch.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="p-3 font-medium">
                          <Link href={`/admin/orders/${o.id}`} className="hover:underline focus-visible:underline">{o.reference}</Link>
                        </td>
                        <td className="p-3 text-muted-foreground">{o.zone}</td>
                        <td className="p-3">
                          <StatusBadge kind="payment" status={o.paymentStatus} />
                          <span className="ml-1.5 text-xs text-muted-foreground">{o.paymentMethod.replace(/_/g, " ")}</span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {o.paymentMethod === "cash_on_delivery" ? (
                            <Link href={`/admin/orders/${o.id}`} className="font-medium text-primary hover:underline">see order</Link>
                          ) : "—"}
                        </td>
                        <td className="p-3 text-right">
                          <Button asChild size="sm" variant="outline" className="h-10">
                            <Link href={`/admin/dispatch?order=${o.id}`}>Assign rider</Link>
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

        {/* COLLECTION */}
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
                      <th className="p-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.collection.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="p-3 font-medium">
                          <Link href={`/admin/orders/${o.id}`} className="hover:underline focus-visible:underline">{o.reference}</Link>
                        </td>
                        <td className="p-3 text-muted-foreground">{o.customerName}</td>
                        <td className="p-3"><StatusBadge kind="fulfilment" status={o.fulfilmentStatus} /></td>
                        <td className="p-3">
                          <StatusBadge kind="payment" status={o.paymentStatus} />
                          <span className="ml-1.5 text-xs text-muted-foreground">{o.paymentMethod.replace(/_/g, " ")}</span>
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
    </div>
  );
}

/** The picker's line view: variant, unit, quantity and FEFO lot suggestions. */
function LineTable({ lines }: { lines: QueueLine[] }) {
  return (
    <div className="table-scroll">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="p-3 font-semibold">Item & variant</th>
            <th className="p-3 font-semibold">Unit</th>
            <th className="p-3 font-semibold">Qty</th>
            <th className="p-3 font-semibold">Eligible lots (FEFO — pick first-expiring first)</th>
            <th className="hidden p-3 font-semibold md:table-cell">Available to sell</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t align-top">
              <td className="p-3">
                <p className="font-medium">{l.productName}</p>
                <p className="text-xs text-muted-foreground">{l.variantName}{l.note ? ` · ${l.note}` : ""}</p>
              </td>
              <td className="p-3 capitalize text-muted-foreground">{l.unit}</td>
              <td className="p-3 font-medium tabular-nums">{l.quantity}</td>
              <td className="p-3">
                {l.allocations.length ? (
                  <ul className="space-y-0.5 text-xs">
                    {l.allocations.map((a) => (
                      <li key={a.lotId} className="rounded bg-muted/60 px-2 py-1">
                        <span className="font-mono">{a.lotNumber}</span> · take {a.quantity}
                        {a.expiry ? ` · exp ${formatDate(a.expiry)}` : " · no expiry"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-muted-foreground">Recorded when picking starts</span>
                )}
              </td>
              <td className="hidden p-3 tabular-nums text-muted-foreground md:table-cell">{l.availableToSell}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
