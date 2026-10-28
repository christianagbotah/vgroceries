"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { filterPurchases } from "@/features/staff/admin-operations-ux";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Boxes, Send, RotateCw, Sparkles, Pencil, Search, Lock } from "lucide-react";

type PurchaseRow = Awaited<ReturnType<typeof apiOps.purchases>>[number];
type EditLine = PurchaseRow["lines"][number] & { unitCostInput: string };

export default function AdminPurchasesPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.purchases(), []);
  const { data: suppliers } = useApiData(() => apiOps.suppliers(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [supplierId, setSupplierId] = useState("all");
  const [editing, setEditing] = useState<PurchaseRow | null>(null);
  const [editSupplierId, setEditSupplierId] = useState("");
  const [expectedOn, setExpectedOn] = useState("");
  const [note, setNote] = useState("");
  const [editLines, setEditLines] = useState<EditLine[]>([]);

  const send = async (po: PurchaseRow) => {
    setBusy(po.id);
    try { await apiOps.purchaseSend(po.id); await reload(); toast({ title: `${po.reference} marked as sent`, description: "Demo — no real supplier contact is made." }); }
    catch (e) { toast({ title: "Failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  if (loading) return <LoadingState rows={4} label="Loading purchase orders" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data ?? [];
  const filtered = filterPurchases(rows, { query, status, supplierId });

  const beginEdit = (po: PurchaseRow) => {
    setEditing(po); setEditSupplierId(po.supplierId); setExpectedOn(po.expectedAt?.slice(0, 10) ?? ""); setNote(po.note ?? "");
    setEditLines(po.lines.map((line) => ({ ...line, unitCostInput: (line.unitCostMinor / 100).toFixed(2) })));
  };

  const updateLine = (index: number, patch: Partial<EditLine>) => setEditLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));

  const save = async () => {
    if (!editing || editing.status !== "draft") return;
    const lines = editLines.map((line) => ({ variantId: line.variantId, quantity: line.quantity.trim(), unitCostMinor: Math.round(Number(line.unitCostInput) * 100) }));
    if (!editSupplierId || lines.some((line) => !line.quantity || Number(line.quantity) <= 0 || !Number.isFinite(line.unitCostMinor) || line.unitCostMinor < 0)) {
      toast({ title: "Check the purchase-order fields", description: "Supplier, positive quantities and valid unit costs are required.", variant: "destructive" }); return;
    }
    setBusy(editing.id);
    try {
      await apiOps.purchaseUpdate({ poId: editing.id, supplierId: editSupplierId, expectedAt: expectedOn ? `${expectedOn}T00:00:00.000Z` : "", note: note.trim(), lines, actor: user.id });
      await reload(); setEditing(null); toast({ title: `${editing.reference} updated` });
    } catch (e) { toast({ title: "Purchase order update failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><h1 className="font-serif text-2xl font-bold">Purchase orders</h1><p className="text-sm text-muted-foreground">Review drafts, supplier commitments and receiving progress. Sent/received order lines are locked to preserve the audit trail.</p></div><Button variant="outline" className="h-10" onClick={reload}><RotateCw className="size-4" aria-hidden /> Refresh</Button></div>

      <section aria-label="Purchase order filters" className="grid gap-3 rounded-xl border bg-card p-3 md:grid-cols-[minmax(0,1fr)_12rem_15rem]">
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input type="search" className="h-11 pl-9" placeholder="Search PO reference or supplier…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search purchase orders" /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-11 w-full" aria-label="Purchase order status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="sent">Sent</SelectItem><SelectItem value="partially_received">Partially received</SelectItem><SelectItem value="received">Received</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
        <Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger className="h-11 w-full" aria-label="Purchase order supplier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{(suppliers ?? []).map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select>
      </section>

      {!rows.length ? <EmptyState icon={Boxes} title="No purchase orders" /> : !filtered.length ? <EmptyState icon={Search} title="No purchase orders match these filters" description="Change the search, status or supplier filter." /> : <div className="space-y-3">{filtered.map((po: PurchaseRow) => (
        <article key={po.id} className="rounded-xl border bg-card"><div className="flex flex-wrap items-center justify-between gap-2 border-b p-4"><div><p className="font-semibold">{po.reference} <span className="font-normal text-muted-foreground">· {po.supplierName}</span></p><p className="text-sm text-muted-foreground">Created {po.createdAtLabel} UTC{po.expectedLabel ? ` · expected ${po.expectedLabel}` : ""}</p></div><div className="flex flex-wrap items-center gap-2"><StatusBadge kind="generic" status={po.status} />{can("purchasing.manage") ? <Button size="sm" variant="outline" className="h-10" onClick={() => beginEdit(po)}><Pencil className="size-4" aria-hidden /> Edit</Button> : null}{po.status === "draft" && can("purchasing.manage") ? <Button size="sm" className="h-10" disabled={busy === po.id} onClick={() => send(po)}><Send className="size-4" aria-hidden /> Mark as sent</Button> : null}</div></div>
        <ul className="divide-y text-sm">{po.lines.map((line, index) => <li key={index} className="flex justify-between gap-2 p-3"><span>{line.productName} <span className="text-muted-foreground">({line.variantName})</span> × {line.quantity}</span><span className="tabular-nums text-muted-foreground">{line.unitCostLabel} / unit</span></li>)}</ul>{po.note ? <p className="border-t p-3 text-xs text-muted-foreground"><Sparkles className="mr-1 inline size-3.5" aria-hidden /> {po.note}</p> : null}
        </article>
      ))}</div>}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{editing?.status === "draft" ? "Edit" : "Review"} {editing?.reference}</DialogTitle><DialogDescription>{editing?.status === "draft" ? "Draft supplier, expected date, quantities and unit costs can be corrected before sending." : "This order has entered the purchasing/receiving trail, so its ordered lines are read-only."}</DialogDescription></DialogHeader>{editing ? <div className="space-y-4">{editing.status !== "draft" ? <div className="flex gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> Sent, partially received and received POs are locked against silent line edits.</div> : null}<div className="grid gap-3 sm:grid-cols-2"><div><Label>Supplier</Label><Select value={editSupplierId} onValueChange={setEditSupplierId} disabled={editing.status !== "draft"}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(suppliers ?? []).filter((supplier) => supplier.isActive || supplier.id === editSupplierId).map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="po-expected">Expected date</Label><Input id="po-expected" type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} disabled={editing.status !== "draft"} /></div></div><div><Label htmlFor="po-note">Note</Label><Textarea id="po-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={editing.status !== "draft"} /></div><div className="overflow-x-auto rounded-lg border"><table className="min-w-[620px] w-full text-sm"><thead className="bg-muted/60 text-left"><tr><th className="p-3">Item</th><th className="w-32 p-3">Quantity</th><th className="w-40 p-3">Unit cost (₵)</th></tr></thead><tbody>{editLines.map((line, index) => <tr key={line.variantId} className="border-t"><td className="p-3">{line.productName} <span className="text-muted-foreground">({line.variantName})</span></td><td className="p-3"><Input inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} disabled={editing.status !== "draft"} /></td><td className="p-3"><Input inputMode="decimal" value={line.unitCostInput} onChange={(e) => updateLine(index, { unitCostInput: e.target.value })} disabled={editing.status !== "draft"} /></td></tr>)}</tbody></table></div></div> : null}<DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Close</Button>{editing?.status === "draft" ? <Button onClick={save} disabled={busy === editing.id}>{busy === editing.id ? "Saving…" : "Save purchase order"}</Button> : null}</DialogFooter></DialogContent></Dialog>

      <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">New draft POs can be created from the AI replenishment assistant. Receiving against a PO updates its receiving progress; completed purchasing history remains auditable.</p>
    </div>
  );
}
