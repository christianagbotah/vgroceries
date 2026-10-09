"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Play, Save, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type Stocktake = Awaited<ReturnType<typeof apiOps.stocktakes>>[number];
type InventoryRow = Awaited<ReturnType<typeof apiOps.inventory>>["rows"][number];

export default function AdminStocktakesPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.stocktakes(), []);
  const { data: inventory } = useApiData(() => apiOps.inventory({}), []);

  const [selectOpen, setSelectOpen] = useState(false);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [counting, setCounting] = useState<Stocktake | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const rows = (inventory?.rows ?? []).filter((r) => !search || `${r.productName} ${r.variantName}`.toLowerCase().includes(search.toLowerCase()));

  const startStocktake = async () => {
    const variantIds = Object.entries(selection).filter(([, v]) => v).map(([k]) => k);
    if (!variantIds.length) {
      toast({ title: "Select at least one item to count", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const r = await apiOps.stocktakeOpen(variantIds, user.id);
      await reload();
      setSelectOpen(false);
      setSelection({});
      toast({ title: `Stocktake ${r.reference} opened`, description: "Expected quantities are snapshotted from current stock." });
    } catch (e) {
      toast({ title: "Could not open stocktake", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const openCounting = (s: Stocktake) => {
    setCounting(s);
    setCounts(Object.fromEntries(s.lines.map((l) => [l.variantId, l.countedQty ?? ""])));
  };

  const saveCounts = async () => {
    if (!counting) return;
    setBusy(true);
    try {
      await apiOps.stocktakeCount(counting.id, counts);
      await reload();
      toast({ title: "Counts saved", description: "Review variances before closing." });
      const fresh = (await apiOps.stocktakes()).find((x) => x.id === counting.id);
      if (fresh) openCounting(fresh);
    } catch (e) {
      toast({ title: "Could not save counts", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const close = async (s: Stocktake, apply: boolean) => {
    setBusy(true);
    try {
      await apiOps.stocktakeClose(s.id, apply);
      await reload();
      setCounting(null);
      toast({ title: "Stocktake closed", description: apply ? "Corrections applied as movements." : "Closed without corrections." });
    } catch (e) {
      toast({ title: "Could not close", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState rows={4} label="Loading stocktakes" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Stocktakes</h1>
          <p className="text-sm text-muted-foreground">
            Count entry and variance review. Closing with corrections writes explicit
            stocktake_correction movements — stock never drifts silently.
          </p>
        </div>
        {can("inventory.stocktake") ? (
          <Dialog open={selectOpen} onOpenChange={setSelectOpen}>
            <DialogTrigger asChild>
              <Button className="h-11"><ClipboardList className="size-4" aria-hidden /> New stocktake</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Choose items to count</DialogTitle>
                <DialogDescription>
                  Expected quantities are snapshotted when the stocktake opens, so concurrent sales
                  do not distort the variance.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Input type="search" className="h-11" placeholder="Filter items…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filter items" />
                <div className="scroll-soft max-h-80 overflow-y-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <tbody>
                      {rows.slice(0, 60).map((r: InventoryRow) => (
                        <tr key={r.variantId} className="border-b last:border-0">
                          <td className="p-2.5">
                            <label className="flex cursor-pointer items-center gap-2.5">
                              <input
                                type="checkbox"
                                className="size-4 accent-[color:var(--primary)]"
                                checked={!!selection[r.variantId]}
                                onChange={(e) => setSelection((prev) => ({ ...prev, [r.variantId]: e.target.checked }))}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {r.productName} <span className="text-muted-500">— {r.variantName}</span>
                              </span>
                              <span className="text-xs text-muted-foreground">expected {r.sellablePhysical}</span>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={startStocktake} disabled={busy}>
                  {busy ? "Opening…" : `Open stocktake (${Object.values(selection).filter(Boolean).length} items)`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {/* counting dialog */}
      <Dialog open={!!counting} onOpenChange={(o) => !o && setCounting(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Counting {counting?.reference}</DialogTitle>
            <DialogDescription>
              Enter physical counts. Variances are highlighted for review.
            </DialogDescription>
          </DialogHeader>
          {counting ? (
            <>
              <div className="scroll-soft max-h-96 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-left">
                    <tr>
                      <th className="p-2.5 font-semibold">Item</th>
                      <th className="p-2.5 text-right font-semibold">Expected</th>
                      <th className="p-2.5 font-semibold">Counted</th>
                      <th className="p-2.5 text-right font-semibold">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {counting.lines.map((l) => {
                      const counted = counts[l.variantId] ?? "";
                      const variance = counted !== "" && /^\d+(\.\d+)?$/.test(counted)
                        ? Number(counted) - Number(l.expectedQty)
                        : null;
                      return (
                        <tr key={l.variantId} className="border-t">
                          <td className="p-2.5">{l.productName} <span className="text-xs text-muted-foreground">{l.variantName}</span></td>
                          <td className="p-2.5 text-right tabular-nums text-muted-foreground">{l.expectedQty}</td>
                          <td className="p-2.5">
                            <Input
                              className="h-10 w-24 text-right"
                              inputMode="decimal"
                              value={counted}
                              onChange={(e) => setCounts((prev) => ({ ...prev, [l.variantId]: e.target.value }))}
                              aria-label={`Counted quantity for ${l.productName}`}
                            />
                          </td>
                          <td className={cn("p-2.5 text-right font-semibold tabular-nums", variance === null ? "text-muted-foreground" : variance === 0 ? "text-success" : variance > 0 ? "text-primary" : "text-destructive")}>
                            {variance === null ? "—" : variance > 0 ? `+${variance}` : variance}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                <div className="flex gap-2">
                  <Button variant="outline" className="h-11" onClick={saveCounts} disabled={busy}>
                    <Save className="size-4" aria-hidden /> Save counts
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="h-11" onClick={() => close(counting, false)} disabled={busy}>
                    Close without corrections
                  </Button>
                  <Button className="h-11" onClick={() => close(counting, true)} disabled={busy}>
                    <Lock className="size-4" aria-hidden /> Close &amp; apply corrections
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {!data?.length ? (
        <EmptyState icon={ClipboardList} title="No stocktakes" description="Open a count from current stock to begin." />
      ) : (
        <div className="space-y-3">
          {data.map((s: Stocktake) => (
            <article key={s.id} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                <div>
                  <p className="font-semibold">
                    {s.reference} · <StatusBadge kind="generic" status={s.status} />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Opened {s.openedAtLabel} UTC by {s.openedBy} · {s.lines.length} lines
                    {s.closedAt ? ` · closed ${s.closedAt}` : ""}
                  </p>
                </div>
                {["open", "counting", "review"].includes(s.status) && can("inventory.stocktake") ? (
                  <Button size="sm" className="h-10" onClick={() => openCounting(s)}>
                    <Play className="size-4" aria-hidden /> Enter counts
                  </Button>
                ) : null}
              </div>
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="p-3 font-semibold">Item</th>
                      <th className="p-3 text-right font-semibold">Expected</th>
                      <th className="p-3 text-right font-semibold">Counted</th>
                      <th className="p-3 text-right font-semibold">Variance</th>
                      <th className="p-3 font-semibold">Line status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.lines.map((l) => (
                      <tr key={l.variantId} className="border-t">
                        <td className="p-3">{l.productName} <span className="text-xs text-muted-foreground">{l.variantName}</span></td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{l.expectedQty}</td>
                        <td className="p-3 text-right tabular-nums">{l.countedQty ?? "—"}</td>
                        <td className={cn("p-3 text-right font-semibold tabular-nums", !l.variance ? "text-muted-foreground" : l.variance === "0" ? "text-success" : l.variance.startsWith("-") ? "text-destructive" : "text-primary")}>
                          {l.variance && l.variance !== "0" ? (l.variance.startsWith("-") ? l.variance : `+${l.variance}`) : (l.variance === "0" ? "0" : "—")}
                        </td>
                        <td className="p-3"><StatusBadge kind="generic" status={l.status} label={l.status.replace(/_/g, " ")} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
