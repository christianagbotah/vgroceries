"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Check, X, PackageCheck, SearchCheck } from "lucide-react";

type ReturnRow = Awaited<ReturnType<typeof apiOps.adminReturns>>[number];

const DISPOSITIONS = [
  { value: "restock_saleable", label: "Saleable — restock to sellable lot" },
  { value: "damaged_unsaleable", label: "Damaged / expired — unsaleable, record loss" },
  { value: "quarantine_pending", label: "Needs further inspection — keep quarantined" },
  { value: "not_returned", label: "Never physically returned — no stock change" },
] as const;

export default function AdminReturnsPage() {
  const params = useSearchParams();
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.adminReturns(), []);

  const [decideTarget, setDecideTarget] = useState<ReturnRow | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [inspectTarget, setInspectTarget] = useState<ReturnRow | null>(null);
  const [disposition, setDisposition] = useState<(typeof DISPOSITIONS)[number]["value"]>("quarantine_pending");
  const [inspectNote, setInspectNote] = useState("");

  const [refundTarget, setRefundTarget] = useState<ReturnRow | null>(null);
  const [refundMethod, setRefundMethod] = useState("mobile_money");

  const linkedOrderId = params.get("orderId");

  const act = async (fn: () => Promise<unknown>, note: string) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      toast({ title: note });
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading returns" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Returns</h1>
        <p className="text-sm text-muted-foreground">
          Requests, inspection and dispositions for online and counter orders. Returned goods only
          re-enter saleable stock through an approved disposition.
        </p>
      </div>

      {linkedOrderId ? (
        <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          Starting a return from <Link href={`/admin/orders/${linkedOrderId}`} className="font-medium text-primary underline hover:no-underline">this order</Link> —
          open the customer record below and add the return lines.
        </p>
      ) : null}

      {!rows.length ? (
        <EmptyState icon={RotateCcw} title="No return requests" description="Requests from customers and staff appear here." />
      ) : (
        <div className="space-y-3">
          {rows.map((r: ReturnRow) => (
            <article key={r.id} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b p-4">
                <div>
                  <p className="font-semibold">
                    <Link href={`/admin/returns/${r.id}`} className="hover:underline focus-visible:underline">{r.reference}</Link>
                    <span className="ml-2 font-normal text-muted-foreground">
                      on <Link href={`/admin/orders/${r.orderId}`} className="text-primary hover:underline">{r.orderReference}</Link> · {r.channel === "pos" ? "counter" : "online"} · by {r.requestedBy}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.customerName ?? "—"} · requested {r.createdAtLabel} UTC
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="return" status={r.status} />
                  {r.refundStatus ? <StatusBadge kind="refund" status={r.refundStatus} /> : null}
                </div>
              </div>

              <div className="space-y-2 p-4 text-sm">
                <ul className="space-y-1">
                  {r.lines.map((l, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2">
                      <span>
                        {l.quantity} × {l.productName} <span className="text-muted-foreground">({l.variantName})</span> — {l.reason}
                      </span>
                      <span className="font-medium tabular-nums">{l.refundLabel}</span>
                    </li>
                  ))}
                </ul>
                {r.evidenceNote ? <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">Evidence: {r.evidenceNote}</p> : null}
                {r.disposition ? (
                  <p className="rounded-lg border p-2 text-xs">
                    Disposition: <strong>{r.disposition.kind.replace(/_/g, " ")}</strong> — {r.disposition.note}
                  </p>
                ) : null}
              </div>

              {can("returns.decide") ? (
                <div className="flex flex-wrap gap-2 border-t p-4">
                  {r.status === "requested" ? (
                    <Button size="sm" className="h-10" onClick={() => { setDecideTarget(r); setDecision("approve"); }}>
                      <Check className="size-4" aria-hidden /> Approve / reject
                    </Button>
                  ) : null}
                  {r.status === "approved" ? (
                    <Button size="sm" className="h-10" onClick={() => act(() => apiOps.returnAction({ action: "receive", returnId: r.id, actor: user.id }), "Return received at the store")}>
                      <PackageCheck className="size-4" aria-hidden /> Mark received
                    </Button>
                  ) : null}
                  {["received", "inspected"].includes(r.status) ? (
                    <Button size="sm" className="h-10" onClick={() => { setInspectTarget(r); setDisposition("quarantine_pending"); }}>
                      <SearchCheck className="size-4" aria-hidden /> Record inspection
                    </Button>
                  ) : null}
                  {["approved", "received", "inspected"].includes(r.status) && !r.refundStatus ? (
                    <Button size="sm" variant="outline" className="h-10" onClick={() => { setRefundTarget(r); }}>
                      Request refund
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="ghost" className="h-10">
                    <Link href={`/admin/returns/${r.id}`}>Open detail</Link>
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {/* decide dialog */}
      <Dialog open={!!decideTarget} onOpenChange={(o) => !o && setDecideTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Decide {decideTarget?.reference}</DialogTitle>
            <DialogDescription>Approvals require a recorded note.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Decision</Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as "approve" | "reject")}>
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">Approve the return</SelectItem>
                  <SelectItem value="reject">Reject the return</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dec-note">Decision note</Label>
              <Textarea id="dec-note" rows={2} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="Why?" />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant={decision === "reject" ? "destructive" : "default"}
              className="h-11"
              disabled={busy || !decisionNote.trim()}
              onClick={async () => {
                await act(() => apiOps.returnAction({ action: decision, returnId: decideTarget!.id, note: decisionNote, actor: user.id }), decision === "approve" ? "Return approved" : "Return rejected");
                setDecideTarget(null);
                setDecisionNote("");
              }}
            >
              {decision === "reject" ? <><X className="size-4" aria-hidden /> Reject</> : <><Check className="size-4" aria-hidden /> Approve</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* inspection dialog */}
      <Dialog open={!!inspectTarget} onOpenChange={(o) => !o && setInspectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Inspect {inspectTarget?.reference}</DialogTitle>
            <DialogDescription>
              The disposition decides the stock effect. Only a saleable disposition makes the goods
              purchasable again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Disposition</Label>
              <Select value={disposition} onValueChange={(v) => setDisposition(v as typeof disposition)}>
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISPOSITIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ins-note">Inspection note</Label>
              <Textarea id="ins-note" rows={2} value={inspectNote} onChange={(e) => setInspectNote(e.target.value)} placeholder="Condition observed" />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="h-11"
              disabled={busy || !inspectNote.trim()}
              onClick={async () => {
                await act(() => apiOps.returnAction({ action: "inspect", returnId: inspectTarget!.id, disposition, note: inspectNote, actor: user.id }), "Inspection recorded");
                setInspectTarget(null);
                setInspectNote("");
              }}
            >
              Record inspection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* refund request dialog */}
      <Dialog open={!!refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request a refund for {refundTarget?.reference}</DialogTitle>
            <DialogDescription>
              Creates a refund request for approval. A request is not a completed money transfer.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Method</Label>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile_money">Provider refund — Mobile Money</SelectItem>
                <SelectItem value="card_hosted">Provider refund — card</SelectItem>
                <SelectItem value="manual_recording">Manual recording (cash/transfer)</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Manual recordings are clearly identified and need a finance reviewer sign-off.
            </p>
          </div>
          <DialogFooter>
            <Button
              className="h-11"
              disabled={busy}
              onClick={async () => {
                await act(() => apiOps.returnAction({ action: "request_refund", returnId: refundTarget!.id, method: refundMethod, actor: user.id }), "Refund requested — awaiting approval");
                setRefundTarget(null);
              }}
            >
              Request refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
