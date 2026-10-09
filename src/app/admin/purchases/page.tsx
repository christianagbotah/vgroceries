"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Boxes, Send, RotateCw, Sparkles } from "lucide-react";

type PurchaseRow = Awaited<ReturnType<typeof apiOps.purchases>>[number];

export default function AdminPurchasesPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.purchases(), []);
  const [busy, setBusy] = useState<string | null>(null);

  const send = async (po: PurchaseRow) => {
    setBusy(po.id);
    try {
      await apiOps.purchaseSend(po.id);
      await reload();
      toast({ title: `${po.reference} marked as sent`, description: "Demo — no real supplier contact is made." });
    } catch (e) {
      toast({ title: "Failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingState rows={4} label="Loading purchase orders" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Purchase orders</h1>
          <p className="text-sm text-muted-foreground">
            Drafts and sent orders. Drafts suggested by the AI replenishment assistant are always
            reviewable — the assistant never orders automatically.
          </p>
        </div>
        <Button variant="outline" className="h-10" onClick={reload}>
          <RotateCw className="size-4" aria-hidden /> Refresh
        </Button>
      </div>

      {!rows.length ? (
        <EmptyState icon={Boxes} title="No purchase orders" />
      ) : (
        <div className="space-y-3">
          {rows.map((po: PurchaseRow) => (
            <article key={po.id} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                <div>
                  <p className="font-semibold">
                    {po.reference} <span className="font-normal text-muted-foreground">· {po.supplierName}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Created {po.createdAtLabel} UTC{po.expectedLabel ? ` · expected ${po.expectedLabel}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge kind="generic" status={po.status} />
                  {po.status === "draft" && can("purchasing.manage") ? (
                    <Button size="sm" className="h-10" disabled={busy === po.id} onClick={() => send(po)}>
                      <Send className="size-4" aria-hidden /> Mark as sent
                    </Button>
                  ) : null}
                </div>
              </div>
              <ul className="divide-y text-sm">
                {po.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2 p-3">
                    <span>{l.productName} <span className="text-muted-foreground">({l.variantName})</span> × {l.quantity}</span>
                    <span className="tabular-nums text-muted-foreground">{l.unitCostLabel} / unit</span>
                  </li>
                ))}
              </ul>
              {po.note ? <p className="border-t p-3 text-xs text-muted-foreground"><Sparkles className="mr-1 inline size-3.5" aria-hidden /> {po.note}</p> : null}
            </article>
          ))}
        </div>
      )}

      <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        New draft POs are created from the AI assistant&apos;s replenishment suggestions or from the
        receiving screen. Receiving against a PO marks it received when every ordered quantity has
        been delivered.
      </p>
    </div>
  );
}
