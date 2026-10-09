"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import { ClipboardCheck, Plus, Trash2, PackagePlus } from "lucide-react";

interface ReceiveLine { variantId: string; lotNumber: string; quantity: string; expiryDate: string }

type Receipt = Awaited<ReturnType<typeof apiOps.receipts>>[number];
type Supplier = Awaited<ReturnType<typeof apiOps.suppliers>>[number];
type Purchase = Awaited<ReturnType<typeof apiOps.purchases>>[number];
type VariantSearch = Awaited<ReturnType<typeof apiOps.posSearch>>[number];

export default function AdminReceivingPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();

  const { data: receipts, loading, error, reload } = useApiData(() => apiOps.receipts(), []);
  const { data: suppliers } = useApiData(() => apiOps.suppliers(), []);
  const { data: purchases } = useApiData(() => apiOps.purchases(), []);

  const [supplierId, setSupplierId] = useState("");
  const [poId, setPoId] = useState("none");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<ReceiveLine[]>([{ variantId: "", lotNumber: "", quantity: "", expiryDate: "" }]);
  const [variantQuery, setVariantQuery] = useState("");
  const [variants, setVariants] = useState<VariantSearch[]>([]);
  const [busy, setBusy] = useState(false);

  const searchVariants = (q: string) => {
    setVariantQuery(q);
    if (!q.trim()) {
      setVariants([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setVariants((await apiOps.posSearch(q)).slice(0, 8));
      } catch {
        setVariants([]);
      }
    }, 250);
    return () => clearTimeout(t);
  };

  const updateLine = (i: number, patch: Partial<ReceiveLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const submit = async () => {
    const clean = lines.filter((l) => l.variantId && l.lotNumber.trim() && Number(l.quantity) > 0);
    if (!supplierId) {
      toast({ title: "Choose a supplier", variant: "destructive" });
      return;
    }
    if (!clean.length) {
      toast({ title: "Add at least one complete line", variant: "destructive" });
      return;
    }
    for (const l of clean) {
      if (l.expiryDate && new Date(l.expiryDate).toISOString() <= new Date().toISOString()) {
        toast({ title: `Expiry for lot ${l.lotNumber} must be in the future`, variant: "destructive" });
        return;
      }
    }
    setBusy(true);
    try {
      await apiOps.receive({
        supplierId,
        purchaseOrderId: poId !== "none" ? poId : undefined,
        lines: clean.map((l) => ({ variantId: l.variantId, lotNumber: l.lotNumber.trim(), quantity: l.quantity, expiryDate: l.expiryDate || undefined })),
        note: note.trim() || undefined,
        actor: user.id,
      });
      await reload();
      setLines([{ variantId: "", lotNumber: "", quantity: "", expiryDate: "" }]);
      setNote("");
      setPoId("none");
      toast({ title: "Goods received", description: "New lots are saleable immediately — storefront updates on next load." });
    } catch (e) {
      toast({ title: "Receiving failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading receipts" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const openPos = (purchases ?? []).filter((p) => ["sent", "partially_received"].includes(p.status));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Goods receiving</h1>
        <p className="text-sm text-muted-foreground">
          Record delivered goods as tracked lots with supplier references and expiry dates, matching
          a purchase order when there is one.
        </p>
      </div>

      {can("inventory.receive") ? (
        <section aria-labelledby="rc-form" className="space-y-4 rounded-xl border bg-card p-4">
          <h2 id="rc-form" className="flex items-center gap-2 font-semibold">
            <PackagePlus className="size-5 text-primary" aria-hidden /> New goods receipt
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="rc-supplier">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="rc-supplier" className="h-11 w-full"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                <SelectContent>
                  {(suppliers ?? []).filter((s) => s.isActive).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rc-po">Match purchase order (optional)</Label>
              <Select value={poId} onValueChange={setPoId}>
                <SelectTrigger id="rc-po" className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No PO — direct delivery</SelectItem>
                  {openPos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.reference} · {p.supplierName} · {p.status.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rc-note">Note (optional)</Label>
              <Input id="rc-note" className="h-11" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. morning delivery" />
            </div>
          </div>

          {/* line editor */}
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="sm:col-span-2">
                    <Label htmlFor={`rc-item-${i}`}>Item</Label>
                    <Input
                      id={`rc-item-${i}`}
                      className="h-11"
                      type="search"
                      placeholder="Search item or scan barcode…"
                      value={line.variantId ? variants.find((v) => v.variantId === line.variantId)?.productName ?? "" : variantQuery}
                      onChange={(e) => {
                        searchVariants(e.target.value);
                        updateLine(i, { variantId: "" });
                      }}
                      aria-label={`Item for line ${i + 1}`}
                    />
                    {variants.length && !line.variantId ? (
                      <ul className="mt-1 divide-y rounded-lg border bg-background">
                        {variants.map((v) => (
                          <li key={v.variantId}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-accent"
                              onClick={() => {
                                updateLine(i, { variantId: v.variantId });
                                setVariants([]);
                                setVariantQuery("");
                                if (lines.length === i + 1) setLines([...lines, { variantId: "", lotNumber: "", quantity: "", expiryDate: "" }]);
                              }}
                            >
                              <span className="truncate">{v.productName} — {v.variantName}</span>
                              <span className="text-muted-foreground">{v.barcode ?? v.unit}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor={`rc-lot-${i}`}>Lot number</Label>
                    <Input id={`rc-lot-${i}`} className="h-11 font-mono" value={line.lotNumber} onChange={(e) => updateLine(i, { lotNumber: e.target.value })} placeholder="e.g. L-TOM-233" />
                  </div>
                  <div>
                    <Label htmlFor={`rc-qty-${i}`}>Quantity</Label>
                    <Input id={`rc-qty-${i}`} className="h-11" inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} placeholder="e.g. 25" />
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`rc-exp-${i}`}>Expiry date (if applicable)</Label>
                    <input
                      id={`rc-exp-${i}`}
                      type="date"
                      className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                      value={line.expiryDate}
                      onChange={(e) => updateLine(i, { expiryDate: e.target.value })}
                    />
                  </div>
                  {lines.length > 1 ? (
                    <Button variant="ghost" size="icon" className="size-11 text-muted-foreground hover:text-destructive" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            <Button variant="outline" className="h-10" onClick={() => setLines([...lines, { variantId: "", lotNumber: "", quantity: "", expiryDate: "" }])}>
              <Plus className="size-4" aria-hidden /> Add line
            </Button>
          </div>

          <Button className="h-12" onClick={submit} disabled={busy}>
            <ClipboardCheck className="size-4" aria-hidden /> {busy ? "Receiving…" : "Receive goods"}
          </Button>
        </section>
      ) : (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          Your demo role cannot receive goods — switch to the Inventory Officer or Owner.
        </p>
      )}

      {/* history */}
      <section aria-labelledby="rc-hist" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="rc-hist" className="border-b p-4 font-semibold">Recent receipts</h2>
        {!receipts?.length ? (
          <div className="p-4"><EmptyState title="No receipts yet" description="Received goods will be listed here with their lots." /></div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-semibold">Received</th>
                  <th className="p-3 font-semibold">Supplier</th>
                  <th className="p-3 font-semibold">PO</th>
                  <th className="p-3 font-semibold">Lots</th>
                  <th className="hidden p-3 font-semibold sm:table-cell">By</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r: Receipt) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{r.receivedAtLabel} UTC</td>
                    <td className="p-3">{r.supplierName ?? "—"}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{r.poRef ?? "—"}</td>
                    <td className="p-3">
                      <ul className="space-y-0.5 text-xs">
                        {r.lines.map((l, i) => (
                          <li key={i}>
                            <span className="font-mono">{l.lotNumber}</span> · {l.quantity} × {l.productName ?? ""} {l.variantName ? `(${l.variantName})` : ""}{l.expiryDate ? ` · exp ${l.expiryDate.slice(0, 10)}` : ""}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="hidden p-3 text-muted-foreground sm:table-cell">{r.receivedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        PO matching marks a purchase order received when every ordered line quantity has been
        delivered. Timestamps shown in UTC ({formatDateTime(new Date().toISOString())} now).
      </p>
    </div>
  );
}
