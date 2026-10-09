"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight, Banknote, Lock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Session = Awaited<ReturnType<typeof apiOps.sessions>>[number];

export default function AdminCashierSessionsPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.sessions(), []);

  const [floatInput, setFloatInput] = useState("100");
  const [openBusy, setOpenBusy] = useState(false);

  // movement dialog state
  const [target, setTarget] = useState<Session | null>(null);
  const [moveKind, setMoveKind] = useState<"cash_in" | "cash_out" | "drop">("cash_out");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);

  // close dialog state
  const [closeTarget, setCloseTarget] = useState<Session | null>(null);
  const [counted, setCounted] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);

  if (loading) return <LoadingState rows={4} label="Loading cashier sessions" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const mine = data.find((s) => s.status === "open" && s.cashierName === user.name);
  const canOpen = can("cash.session.manage") && !data.some((s) => s.cashierName === user.name && s.status === "open");

  const openSession = async () => {
    const m = Number(floatInput);
    if (!Number.isFinite(m) || m < 0) {
      toast({ title: "Enter a valid opening float", variant: "destructive" });
      return;
    }
    setOpenBusy(true);
    try {
      await apiOps.sessionOpen(user.id, Math.round(m * 100));
      await reload();
      toast({ title: "Session opened" });
    } catch (e) {
      toast({ title: "Could not open session", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setOpenBusy(false);
    }
  };

  const addMovement = async () => {
    if (!target) return;
    const m = Number(moveAmount);
    if (!Number.isFinite(m) || m <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setMoveBusy(true);
    try {
      await apiOps.sessionMovement(target.id, moveKind, Math.round(m * 100), moveNote.trim() || "Movement", user.id);
      await reload();
      setTarget(null);
      setMoveAmount("");
      setMoveNote("");
      toast({ title: "Cash movement recorded" });
    } catch (e) {
      toast({ title: "Could not record movement", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setMoveBusy(false);
    }
  };

  const closeSession = async () => {
    if (!closeTarget) return;
    const m = Number(counted);
    if (!Number.isFinite(m) || m < 0) {
      toast({ title: "Enter the counted cash amount", variant: "destructive" });
      return;
    }
    setCloseBusy(true);
    try {
      const r = await apiOps.sessionClose(closeTarget.id, Math.round(m * 100), closeNote.trim() || "Daily reconciliation", user.id);
      await reload();
      setCloseTarget(null);
      setCounted("");
      toast({
        title: "Session closed",
        description: r.differenceLabel ? `Difference ${r.differenceLabel}` : "Reconciled",
      });
    } catch (e) {
      toast({ title: "Could not close session", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setCloseBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Cashier sessions</h1>
          <p className="text-sm text-muted-foreground">
            Opening float, cash movements, expected vs counted cash and closing differences.
          </p>
        </div>
        {canOpen ? (
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="cs-float">Opening float (₵)</Label>
              <Input id="cs-float" className="h-11 w-32" inputMode="decimal" value={floatInput} onChange={(e) => setFloatInput(e.target.value)} />
            </div>
            <Button className="h-11" onClick={openSession} disabled={openBusy}>
              <Plus className="size-4" aria-hidden /> Open session
            </Button>
          </div>
        ) : mine ? (
          <p className="rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-sm font-medium text-success">
            Your session {mine.id} is open
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        {data.map((s) => (
          <article key={s.id} className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <div>
                <p className="font-semibold">
                  {s.cashierName} · <span className="font-mono text-sm">{s.id}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Opened {s.openedAtLabel} UTC{s.closedAtLabel ? ` · closed ${s.closedAtLabel} UTC` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="generic" status={s.status} />
                {s.status === "open" && can("cash.session.manage") ? (
                  <>
                    <Button variant="outline" size="sm" className="h-10" onClick={() => setTarget(s)}>
                      <Banknote className="size-4" aria-hidden /> Cash movement
                    </Button>
                    {can("cash.reconcile") ? (
                      <Button size="sm" className="h-10" onClick={() => setCloseTarget(s)}>
                        <Lock className="size-4" aria-hidden /> Close &amp; reconcile
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-4">
              <Metric label="Opening float" value={s.openingFloatLabel} />
              <Metric label="Cash sales" value={`${s.cashSales} order${s.cashSales === 1 ? "" : "s"}`} />
              <Metric label="Expected cash" value={s.expectedLabel} />
              {s.status === "closed" ? (
                <Metric
                  label="Difference (counted − expected)"
                  value={s.differenceLabel ?? "—"}
                  tone={(s.differenceMinor ?? 0) === 0 ? "success" : (s.differenceMinor ?? 0) > 0 ? "info" : "danger"}
                />
              ) : (
                <Metric label="Counted cash" value="pending close" tone="muted" />
              )}
            </div>

            {s.movements.length ? (
              <div className="border-t p-4">
                <h3 className="mb-2 text-sm font-semibold">Movements</h3>
                <ul className="space-y-1.5 text-sm">
                  {s.movements.map((m, i) => (
                    <li key={i} className="flex items-center gap-2">
                      {m.kind === "cash_in" ? (
                        <ArrowDownLeft className="size-4 text-success" aria-hidden />
                      ) : (
                        <ArrowUpRight className="size-4 text-destructive" aria-hidden />
                      )}
                      <span className="font-medium tabular-nums">{m.amountLabel}</span>
                      <span className="text-muted-foreground">{m.kind.replace(/_/g, " ")}{m.note ? ` · ${m.note}` : ""}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{m.atLabel} UTC</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {s.closeNote ? (
              <p className="border-t p-4 text-sm text-muted-foreground">Close note: {s.closeNote}</p>
            ) : null}
          </article>
        ))}
      </div>

      {/* movement dialog */}
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cash movement</DialogTitle>
            <DialogDescription>Record cash added to or removed from the drawer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="mv-kind">Type</Label>
              <Select value={moveKind} onValueChange={(v) => setMoveKind(v as typeof moveKind)}>
                <SelectTrigger id="mv-kind" className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_in">Cash in (from safe)</SelectItem>
                  <SelectItem value="cash_out">Cash out (to safe)</SelectItem>
                  <SelectItem value="drop">Cash drop</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="mv-amount">Amount (₵)</Label>
              <Input id="mv-amount" className="h-11" inputMode="decimal" value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} placeholder="e.g. 20" />
            </div>
            <div>
              <Label htmlFor="mv-note">Note</Label>
              <Input id="mv-note" className="h-11" value={moveNote} onChange={(e) => setMoveNote(e.target.value)} placeholder="Reason" />
            </div>
          </div>
          <DialogFooter>
            <Button className="h-11" onClick={addMovement} disabled={moveBusy}>{moveBusy ? "Recording…" : "Record movement"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* close dialog */}
      <Dialog open={!!closeTarget} onOpenChange={(o) => !o && setCloseTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close &amp; reconcile</DialogTitle>
            <DialogDescription>
              Count the drawer and enter the result. Expected cash is {closeTarget?.expectedLabel}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cl-counted">Counted cash (₵)</Label>
              <Input id="cl-counted" className="h-11" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="e.g. 77.00" />
              {closeTarget && counted && Number.isFinite(Number(counted)) ? (
                <p className={cn("mt-1 text-sm", Number(counted) * 100 - (closeTarget.expectedMinor ?? 0) === 0 ? "text-success" : "text-destructive")}>
                  Difference: {formatMoney(Math.round(Number(counted) * 100) - (closeTarget.expectedMinor ?? 0))}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="cl-note">Close note</Label>
              <Input id="cl-note" className="h-11" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="Optional explanation of any difference" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="destructive" className="h-11" onClick={closeSession} disabled={closeBusy}>
              {closeBusy ? "Closing…" : "Close session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "info" | "muted" }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-0.5 font-semibold tabular-nums",
        tone === "success" && "text-success",
        tone === "danger" && "text-destructive",
        tone === "info" && "text-primary",
        tone === "muted" && "text-muted-foreground"
      )}>
        {value}
      </p>
    </div>
  );
}
