"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiOps, ApiError } from "@/services/client";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { QuantityInput } from "@/components/shared/quantity-input";
import { formatMoney } from "@/lib/money";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw } from "lucide-react";

type ReturnRow = Awaited<ReturnType<typeof apiOps.accountReturns>>[number];
type EligibleLine = Awaited<ReturnType<typeof apiOps.returnLines>>[number];
type OrderRow = Awaited<ReturnType<typeof apiOps.accountOrders>>[number];

export default function AccountReturnsPage() {
  const params = useSearchParams();
  const orderId = params.get("orderId");
  const { toast } = useToast();

  const [returns, setReturns] = useState<ReturnRow[] | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<string>("");
  const [lines, setLines] = useState<EligibleLine[] | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([apiOps.accountReturns(), apiOps.accountOrders()]);
      setReturns(r);
      setOrders(o);
      const returnable = o.filter((x) => ["delivered", "collected"].includes(x.fulfilmentStatus));
      const initial = orderId && returnable.some((x) => x.id === orderId) ? orderId : "";
      setSelectedOrder(initial);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your returns.");
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedOrder) {
      setLines(null);
      return;
    }
    (async () => {
      try {
        const l = await apiOps.returnLines(selectedOrder);
        setLines(l.filter((x) => Number(x.eligible) > 0));
        setQuantities({});
        setReasons({});
      } catch {
        setLines([]);
      }
    })();
  }, [selectedOrder]);

  const submit = async () => {
    const chosen = (lines ?? [])
      .map((l) => ({ orderLineId: l.lineId, quantity: quantities[l.lineId] ?? "0", reason: reasons[l.lineId]?.trim() ?? "" }))
      .filter((x) => Number(x.quantity) > 0);
    if (!chosen.length) {
      toast({ title: "Select at least one item to return", variant: "destructive" });
      return;
    }
    if (chosen.some((c) => !c.reason)) {
      toast({ title: "Add a reason for each returned item", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiOps.createReturn({ orderId: selectedOrder, lines: chosen, evidenceNote: evidence.trim() || undefined });
      toast({ title: `Return ${result.reference} requested`, description: "Our team reviews every request before any refund." });
      setSelectedOrder("");
      setEvidence("");
      await load();
    } catch (e) {
      toast({ title: "Could not submit the request", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <ErrorState message={error} />;
  if (returns === null || orders === null) return <LoadingState rows={4} label="Loading returns" />;

  const returnableOrders = orders.filter((o) => ["delivered", "collected"].includes(o.fulfilmentStatus));

  return (
    <div className="space-y-6">
      {/* request form */}
      <section aria-labelledby="ret-new" className="space-y-4 rounded-xl border bg-card p-4">
        <h2 id="ret-new" className="flex items-center gap-2 font-semibold">
          <RotateCcw className="size-5 text-primary" aria-hidden /> Request a return or refund
        </h2>
        {returnableOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Returns are available on delivered or collected orders — none yet.
          </p>
        ) : (
          <>
            <div>
              <Label htmlFor="ret-order">Which order?</Label>
              <select
                id="ret-order"
                className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                value={selectedOrder}
                onChange={(e) => setSelectedOrder(e.target.value)}
              >
                <option value="">Choose an order…</option>
                {returnableOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.reference} · {o.createdAtLabel} · {o.totalLabel}
                  </option>
                ))}
              </select>
            </div>

            {lines ? (
              lines.length ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {lines.map((l) => (
                      <div key={l.lineId} className="space-y-2 rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {l.productName} <span className="text-muted-foreground">({l.variantName})</span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            up to {l.eligible} returnable · {l.unitPriceLabel} each
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <QuantityInput
                            size="sm"
                            value={quantities[l.lineId] ?? "0"}
                            max={l.eligible}
                            onChange={(q) => setQuantities((prev) => ({ ...prev, [l.lineId]: q }))}
                            ariaLabel={`Return quantity for ${l.productName}`}
                          />
                          <input
                            className="h-9 min-w-40 flex-1 rounded-lg border bg-background px-3 text-sm"
                            placeholder="Reason (required)"
                            value={reasons[l.lineId] ?? ""}
                            onChange={(e) => setReasons((prev) => ({ ...prev, [l.lineId]: e.target.value }))}
                            aria-label={`Reason for returning ${l.productName}`}
                          />
                          {Number(quantities[l.lineId] ?? "0") > 0 ? (
                            <p className="text-sm font-medium tabular-nums text-primary">
                              refund ≈ {formatMoney(l.unitPriceMinor * Number(quantities[l.lineId]))}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <Label htmlFor="ret-evidence">Evidence or details (optional)</Label>
                    <Textarea id="ret-evidence" rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Describe the condition, or note that photos were shared on WhatsApp" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Refund previews use the original paid amounts. Partial returns keep the
                    remaining items — nothing is overwritten.
                  </p>
                  <Button className="h-11" onClick={submit} disabled={submitting}>
                    {submitting ? "Submitting…" : "Submit return request"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing left to return on this order — earlier returns already used the
                  eligible balance.
                </p>
              )
            ) : null}
          </>
        )}
      </section>

      {/* list */}
      <section aria-labelledby="ret-list" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="ret-list" className="border-b p-4 font-semibold">
          Your return requests
        </h2>
        {returns.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={RotateCcw} title="No return requests yet" description="Request one above when something is not right." />
          </div>
        ) : (
          <ul className="divide-y">
            {returns.map((r) => (
              <li key={r.id}>
                <Link href={`/account/returns/${r.id}`} className="block p-4 transition-colors hover:bg-accent">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {r.reference} <span className="font-normal text-muted-foreground">on {r.orderReference}</span>
                    </p>
                    <span className="flex items-center gap-2 text-sm">
                      <StatusBadge kind="return" status={r.status} />
                      {r.refund ? <StatusBadge kind="refund" status={r.refund.status} /> : null}
                      <span className="text-muted-foreground">{r.createdAtLabel}</span>
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-sm text-muted-foreground">
                    {r.lines.map((l, i) => (
                      <li key={i}>
                        {l.quantity} × {l.productName} — {l.reason} · refund {l.refundLabel}
                      </li>
                    ))}
                  </ul>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
