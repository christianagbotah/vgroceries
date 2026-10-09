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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { TriangleAlert, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Adjustment = Awaited<ReturnType<typeof apiOps.adjustments>>[number];
type Lot = Awaited<ReturnType<typeof apiOps.lots>>[number];

export default function AdminAdjustmentsPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.adjustments(), []);
  const { data: lots } = useApiData(() => apiOps.lots(), []);

  const [variantId, setVariantId] = useState("");
  const [lotId, setLotId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");

  const eligibleLots = (lots ?? []).filter((l) => l.variantId === variantId);
  const pending = (data ?? []).filter((a) => a.status === "pending_approval");

  const request = async () => {
    if (!lotId || !/^[+-]?\d+(\.\d+)?$/.test(delta) || Number(delta) === 0) {
      toast({ title: "Choose a lot and a non-zero signed quantity", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiOps.adjustmentCreate({ variantId, lotId, delta: delta.startsWith("+") ? delta : delta, reason: reason.trim(), note: note.trim() || undefined, actor: user.id });
      await reload();
      setVariantId("");
      setLotId("");
      setDelta("");
      setReason("");
      setNote("");
      toast({ title: "Adjustment requested", description: "It applies only after approval." });
    } catch (e) {
      toast({ title: "Request failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, decision: "approve" | "reject") => {
    try {
      await apiOps.adjustmentDecide(id, decision, user.id);
      await reload();
      toast({ title: decision === "approve" ? "Adjustment approved and applied" : "Adjustment rejected" });
    } catch (e) {
      toast({ title: "Decision failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading adjustments" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = (data ?? []).filter((a) => filter === "all" || a.status === filter);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Stock adjustments</h1>
        <p className="text-sm text-muted-foreground">
          Reasoned, approval-gated corrections. Approved adjustments create stock movements; nothing
          changes silently.
        </p>
      </div>

      {pending.length ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="size-4" aria-hidden />
          <p className="font-medium">
            {pending.length} adjustment{pending.length === 1 ? "" : "s"} awaiting approval
          </p>
        </div>
      ) : null}

      {can("inventory.adjust") ? (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Request an adjustment</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="adj-lot">Lot</Label>
              <Select value={lotId} onValueChange={(v) => { setLotId(v); const l = (lots ?? []).find((x) => x.id === v); if (l) setVariantId(l.variantId); }}>
                <SelectTrigger id="adj-lot" className="h-11 w-full"><SelectValue placeholder="Choose the affected lot" /></SelectTrigger>
                <SelectContent>
                  {(lots ?? []).filter((l) => !l.expired).slice(0, 80).map((l: Lot) => (
                    <SelectItem key={l.id} value={l.id}>
                      <span className="font-mono text-xs">{l.lotNumber}</span> · {l.productName} {l.variantName} · qty {l.quantity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="adj-delta">Change (signed, e.g. -2 or +5)</Label>
              <Input id="adj-delta" className="h-11 font-mono" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-2" inputMode="text" />
            </div>
            <div>
              <Label htmlFor="adj-reason">Reason</Label>
              <Input id="adj-reason" className="h-11" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. damage, wastage, found stock" />
            </div>
            <div>
              <Label htmlFor="adj-note">Note (optional)</Label>
              <Textarea id="adj-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
            </div>
          </div>
          <Button className="h-11" onClick={request} disabled={busy}>{busy ? "Submitting…" : "Request adjustment"}</Button>
          <p className="text-xs text-muted-foreground">
            Reasons and before/after values are recorded in the audit log. Expired lots are excluded —
            use the expiry screen to withdraw or dispose of them.
          </p>
        </section>
      ) : (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          Your demo role cannot request adjustments — switch to the Inventory Officer or Owner.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={setFilter} aria-label="Filter adjustments">
          <SelectTrigger className="h-11 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending_approval">Pending approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!rows.length ? (
        <EmptyState title="No adjustments" description="Adjustment requests appear here with their approval state." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-semibold">When</th>
                  <th className="p-3 font-semibold">Item</th>
                  <th className="p-3 font-semibold">Lot</th>
                  <th className="p-3 text-right font-semibold">Change</th>
                  <th className="p-3 font-semibold">Reason</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 text-right font-semibold">Decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a: Adjustment) => (
                  <tr key={a.id} className="border-t">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{a.atLabel} UTC</td>
                    <td className="p-3">{a.productName} <span className="text-xs text-muted-foreground">{a.variantName}</span></td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{a.lotNumber}</td>
                    <td className={cn("p-3 text-right font-semibold tabular-nums", a.delta.startsWith("-") ? "text-destructive" : "text-success")}>
                      {a.delta.startsWith("-") ? a.delta : `+${a.delta}`}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {a.reason}
                      {a.note ? <span className="block text-xs">{a.note}</span> : null}
                    </td>
                    <td className="p-3"><StatusBadge kind="generic" status={a.status} /></td>
                    <td className="p-3 text-right text-xs text-muted-foreground">
                      {a.status === "pending_approval" && can("inventory.receive") ? (
                        <span className="inline-flex gap-1.5">
                          <Button size="sm" variant="outline" className="h-9 text-success" onClick={() => decide(a.id, "approve")}>
                            <Check className="size-3.5" aria-hidden /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 text-destructive" onClick={() => decide(a.id, "reject")}>
                            <X className="size-3.5" aria-hidden /> Reject
                          </Button>
                        </span>
                      ) : (
                        `${a.requestedBy ?? ""}${a.approvedBy ? ` → ${a.approvedBy}` : ""}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
