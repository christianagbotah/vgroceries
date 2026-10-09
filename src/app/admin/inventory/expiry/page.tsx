"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { ShieldAlert, Trash2, CalendarClock, PackageX, Bug, TriangleAlert } from "lucide-react";

type ExpiryBundle = Awaited<ReturnType<typeof apiOps.expiry>>;
type LotRow = ExpiryBundle["expired"][number] & { soonRow?: boolean; daysLeft?: number };

export default function AdminExpiryPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.expiry(), []);
  const [disposeTarget, setDisposeTarget] = useState<LotRow | null>(null);
  const [disposeReason, setDisposeReason] = useState("");
  const [busy, setBusy] = useState(false);

  const quarantine = async (lot: LotRow, on: boolean) => {
    try {
      await apiOps.lotQuarantine(lot.id, on, on ? "Held out of sale pending inspection" : "Released after inspection", user.id);
      await reload();
      toast({ title: on ? "Lot quarantined — no longer sellable" : "Lot released back to sale" });
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    }
  };

  const dispose = async () => {
    if (!disposeTarget) return;
    setBusy(true);
    try {
      await apiOps.lotDispose(disposeTarget.id, disposeReason.trim() || "Disposal after review", user.id);
      await reload();
      setDisposeTarget(null);
      setDisposeReason("");
      toast({ title: "Lot disposed", description: "Recorded as a loss with a movement entry." });
    } catch (e) {
      toast({ title: "Disposal failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading expiry data" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const tabs: { key: string; label: string; icon: typeof CalendarClock; rows: LotRow[]; empty: string }[] = [
    { key: "soon", label: `Expiring ≤ 7 days (${data.soon.length})`, icon: CalendarClock, rows: data.soon, empty: "No lots expiring in the next 7 days." },
    { key: "expired", label: `Expired (${data.expired.length})`, icon: PackageX, rows: data.expired, empty: "No expired lots on the sales floor." },
    { key: "quarantined", label: `Quarantined (${data.quarantined.length})`, icon: Bug, rows: data.quarantined, empty: "No quarantined lots." },
    { key: "damaged", label: `Damaged (${data.damaged.length})`, icon: TriangleAlert, rows: data.damaged, empty: "No damaged lots." },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Expiry &amp; quarantine</h1>
        <p className="text-sm text-muted-foreground">
          Expired, expiring, quarantined and damaged lots. Withdrawn goods are never sellable —
          the storefront only counts eligible regular lots.
        </p>
      </div>

      <Tabs defaultValue="soon">
        <TabsList className="h-12 w-full justify-start overflow-x-auto sm:w-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5 px-4">
              <t.icon className="size-4" aria-hidden /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            {!t.rows.length ? (
              <EmptyState icon={t.icon} title={t.empty} />
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="table-scroll">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left">
                      <tr>
                        <th className="p-3 font-semibold">Item</th>
                        <th className="p-3 font-semibold">Lot</th>
                        <th className="p-3 text-right font-semibold">Qty</th>
                        <th className="p-3 font-semibold">Expiry</th>
                        <th className="p-3 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.map((l) => (
                        <tr key={l.id} className="border-t">
                          <td className="p-3">
                            {l.productName} <span className="text-xs text-muted-foreground">{l.variantName}</span>
                          </td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">{l.lotNumber}</td>
                          <td className="p-3 text-right tabular-nums">{l.quantity}</td>
                          <td className="p-3">
                            {"daysLeft" in l && typeof l.daysLeft === "number" ? (
                              <span className={l.daysLeft <= 2 ? "font-semibold text-destructive" : "text-[color:var(--warning-foreground)]"}>
                                {formatDate(l.expiryDate ?? "")} · {l.daysLeft}d
                              </span>
                            ) : (
                              <span className="text-destructive">{formatDate(l.expiryDate ?? "")}</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <span className="inline-flex flex-wrap justify-end gap-1.5">
                              {can("inventory.adjust") && l.kind !== "regular" ? (
                                <Button size="sm" variant="outline" className="h-9" onClick={() => quarantine(l, !l.isQuarantined)}>
                                  <ShieldAlert className="size-3.5" aria-hidden /> {l.isQuarantined ? "Release" : "Quarantine"}
                                </Button>
                              ) : null}
                              {can("inventory.adjust") ? (
                                <Button size="sm" variant="outline" className="h-9 text-destructive" onClick={() => setDisposeTarget(l)}>
                                  <Trash2 className="size-3.5" aria-hidden /> Dispose
                                </Button>
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {t.key === "soon" && data.soon.length ? (
              <p className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                The AI assistant suggests reviewable promotions for near-expiry lots on the{" "}
                <a href="/admin/ai" className="font-medium text-primary underline hover:no-underline">AI assistant page</a> —
                nothing is published automatically.
              </p>
            ) : null}
            {t.key === "quarantined" && data.quarantined.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Quarantined lots include returned goods awaiting inspection. Only an approved
                saleable disposition moves them back into purchasable stock.
              </p>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!disposeTarget} onOpenChange={(o) => !o && setDisposeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dispose lot {disposeTarget?.lotNumber}?</DialogTitle>
            <DialogDescription>
              The quantity is written off and recorded with a disposal movement. This cannot be
              undone — it is an explicit, reasoned action.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="disp-reason">Reason</Label>
            <Textarea id="disp-reason" rows={2} value={disposeReason} onChange={(e) => setDisposeReason(e.target.value)} placeholder="e.g. expired stock withdrawn for disposal" />
          </div>
          <DialogFooter>
            <Button variant="destructive" className="h-11" onClick={dispose} disabled={busy || !disposeReason.trim()}>
              {busy ? "Disposing…" : "Dispose lot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
