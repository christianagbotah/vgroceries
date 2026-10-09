"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { apiOps, ApiError } from "@/services/client";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, parseMoneyToMinor } from "@/lib/money";
import { QuantityInput } from "@/components/shared/quantity-input";
import { useToast } from "@/hooks/use-toast";
import { ReceiptText, Search, Trash2, Printer, Pause, Play, Barcode, Banknote, Smartphone, CreditCard, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/types/domain";

interface PosLine { variantId: string; productId: string; productName: string; variantName: string; unit: string; priceMinor: number; quantity: string; image: string; availableToSell: string; barcode?: string }
interface Draft { id: string; label: string; createdAtLabel: string; expiresAt: string; lineCount: number; totalMinor: number; lines: { variantId: string; quantity: string; unitPriceMinor: number }[] }
type SearchResult = Awaited<ReturnType<typeof apiOps.posSearch>>[number];
type Session = Awaited<ReturnType<typeof apiOps.sessions>>[number];
interface Receipt { receiptNo: string; atLabel: string; method: string; totalLabel: string; cashierName: string; orderId: string; orderReference: string; lines: { productName: string; variantName: string; quantity: string; unitPriceMinor: number; lineTotalMinor: number }[]; totalMinor: number; businessName: string; changeLabel?: string }

export default function AdminPosPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [floatInput, setFloatInput] = useState("100");
  const [bootError, setBootError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [lines, setLines] = useState<PosLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash_counter");
  const [cashReceived, setCashReceived] = useState("");
  const [completing, setCompleting] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [receiptNo, setReceiptNo] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  // boot: find/open cashier session for this user
  const boot = useCallback(async () => {
    try {
      const sessions = await apiOps.sessions();
      const mine = sessions.find((s) => s.status === "open" && s.cashierName === user.name);
      setSession(mine ?? null);
      if (mine) {
        const d = await apiOps.posDrafts(mine.id);
        setDrafts(d);
      }
    } catch (e) {
      setBootError(e instanceof ApiError ? e.message : "Could not load cashier sessions.");
    }
  }, [user.name]);

  useEffect(() => {
    boot();
  }, [boot]);

  // product search (barcode lands directly when exact match)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await apiOps.posSearch(q);
        setResults(r);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const addLine = (r: SearchResult) => {
    if (!r.isAvailable) {
      toast({ title: "Out of stock", description: `${r.productName} — ${r.variantName} has no sellable units right now.`, variant: "destructive" });
      return;
    }
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === r.variantId);
      if (existing) {
        return prev.map((l) => (l.variantId === r.variantId ? { ...l, quantity: String(Number(l.quantity) + 1) } : l));
      }
      return [
        ...prev,
        { variantId: r.variantId, productId: r.productId, productName: r.productName, variantName: r.variantName, unit: r.unit, priceMinor: r.priceMinor, quantity: "1", image: r.image, availableToSell: r.availableToSell, barcode: r.barcode },
      ];
    });
  };

  const subtotal = lines.reduce((a, l) => a + l.priceMinor * Number(l.quantity), 0);
  const discountMinor = useMemo(() => {
    if (!can("pos.discount")) return 0;
    const m = parseMoneyToMinor(discount);
    return m !== null ? Math.min(m, subtotal) : 0;
  }, [discount, subtotal, can]);
  const total = Math.max(0, subtotal - discountMinor);
  const cashMinor = parseMoneyToMinor(cashReceived) ?? -1;
  const changeMinor = method === "cash_counter" && cashMinor >= total ? cashMinor - total : 0;

  const openSession = async () => {
    setSessionBusy(true);
    try {
      const m = parseMoneyToMinor(floatInput);
      if (m === null || m < 0) throw new ApiError("VALIDATION_FAILED", "Enter a valid opening float.");
      const r = await apiOps.sessionOpen(user.id, m);
      await boot();
      toast({ title: "Session opened", description: `Opening float ${formatMoney(m)}` });
      void r;
    } catch (e) {
      toast({ title: "Could not open session", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setSessionBusy(false);
    }
  };

  const complete = async () => {
    if (!lines.length || !session) return;
    if (method === "cash_counter" && cashMinor < total) {
      toast({ title: "Cash received is less than the total", variant: "destructive" });
      return;
    }
    const key = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setIdempotencyKey(key);
    setCompleting(true);
    try {
      const r = await apiOps.posComplete({
        sessionId: session.id,
        cashierId: user.id,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        method,
        discountMinor: can("pos.discount") ? discountMinor : 0,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        cashReceivedMinor: method === "cash_counter" ? cashMinor : undefined,
        idempotencyKey: key,
      });
      setReceipt({
        receiptNo: r.receiptNo,
        atLabel: new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
        method,
        totalLabel: r.totalLabel,
        cashierName: session.cashierName,
        orderId: r.orderId,
        orderReference: r.reference,
        lines: r.lines.map((l) => ({ ...l, lineTotalMinor: l.lineTotalMinor })),
        totalMinor: r.totalMinor,
        businessName: "Variety Groceries",
        changeLabel: r.changeMinor > 0 ? r.changeLabel : undefined,
      });
      setLines([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount("");
      setCashReceived("");
      toast({ title: `Sale completed · ${r.receiptNo}`, description: "Stock consumed once; storefront availability updated." });
    } catch (e) {
      toast({ title: "Sale failed", description: e instanceof ApiError ? e.message : "The service rejected the sale — nothing was deducted.", variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  const hold = async () => {
    if (!lines.length || !session) return;
    try {
      const label = customerName.trim() || `Held ${new Date().toLocaleTimeString("en-GB")}`;
      await apiOps.posHold({ sessionId: session.id, cashierId: user.id, label, lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) });
      setLines([]);
      setCustomerName("");
      const d = await apiOps.posDrafts(session.id);
      setDrafts(d);
      toast({ title: "Sale held", description: "Stock stays reserved for 20 minutes — the same expiry rules apply." });
    } catch (e) {
      toast({ title: "Could not hold", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    }
  };

  const resume = async (d: Draft) => {
    try {
      const r = await apiOps.posResume(d.id);
      const products = await apiOps.posSearch("");
      const next: PosLine[] = [];
      for (const l of r.lines) {
        const v = products.find((p) => p.variantId === l.variantId);
        if (v) next.push({ variantId: v.variantId, productId: v.productId, productName: v.productName, variantName: v.variantName, unit: v.unit, priceMinor: l.unitPriceMinor, quantity: l.quantity, image: v.image, availableToSell: v.availableToSell, barcode: v.barcode });
      }
      setLines(next);
      await apiOps.posReleaseDraft(d.id);
      setDrafts((prev) => prev.filter((x) => x.id !== d.id));
      toast({ title: `Resumed “${r.label}”`, description: "Quantities revalidated against current availability." });
    } catch (e) {
      toast({ title: "Could not resume", description: e instanceof ApiError ? e.message : "The hold may have expired.", variant: "destructive" });
      if (session) setDrafts(await apiOps.posDrafts(session.id));
    }
  };

  const lookup = async () => {
    try {
      const found = await apiOps.posReceiptLookup(receiptNo.trim());
      setReceipt({
        receiptNo: found.receiptNo,
        atLabel: found.atLabel,
        method: found.method,
        totalLabel: found.totalLabel,
        cashierName: found.cashierName,
        orderId: found.orderId,
        orderReference: found.orderReference,
        lines: found.lines.map((l) => ({ productName: l.productName, variantName: l.variantName, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, lineTotalMinor: l.unitPriceMinor * Number(l.quantity) })),
        totalMinor: found.totalMinor,
        businessName: "Variety Groceries",
      });
      setLookupOpen(false);
    } catch (e) {
      toast({ title: "Receipt not found", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    }
  };

  if (bootError) return <ErrorState message={bootError} onRetry={boot} />;

  // no session: open one first
  if (!session) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-10">
        <h1 className="font-serif text-2xl font-bold">Counter sales (POS)</h1>
        <div className="space-y-4 rounded-xl border bg-card p-5">
          <div className="space-y-1">
            <h2 className="font-semibold">Open a cashier session</h2>
            <p className="text-sm text-muted-foreground">
              Counter sales are attached to a session so cash can be reconciled at close. You are{" "}
              {user.name}.
            </p>
          </div>
          <div>
            <Label htmlFor="pos-float">Opening float (₵)</Label>
            <Input id="pos-float" className="h-11" inputMode="decimal" value={floatInput} onChange={(e) => setFloatInput(e.target.value)} placeholder="e.g. 100" />
          </div>
          {can("pos.use") ? (
            <Button className="h-12 w-full" onClick={openSession} disabled={sessionBusy}>
              {sessionBusy ? "Opening…" : "Open session"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Your demo role cannot use the POS.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Counter sales (POS)</h1>
          <p className="text-sm text-muted-foreground">
            Session {session.id} · {session.cashierName} · opened {session.openedAtLabel} UTC
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10" onClick={() => setLookupOpen(true)}>
            <Search className="size-4" aria-hidden /> Transaction lookup
          </Button>
          <Button asChild variant="outline" className="h-10">
            <Link href="/admin/cashier-sessions">Close session</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* search & results */}
        <div className="space-y-3">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              searchRef.current?.blur();
            }}
          >
            <Label htmlFor="pos-search" className="sr-only">Search or scan barcode</Label>
            <div className="relative">
              <Barcode className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="pos-search"
                ref={searchRef}
                type="search"
                autoFocus
                className="h-14 pl-11 text-lg"
                placeholder="Scan barcode or search products…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                key={user.id}
              />
            </div>
          </form>

          {searching ? (
            <LoadingState rows={2} label="Searching products" />
          ) : query.trim() && results.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No product matches “{query}”. Try the product name, or scan its barcode.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {results.map((r) => (
                <button
                  key={r.variantId}
                  type="button"
                  onClick={() => addLine(r)}
                  disabled={!r.isAvailable}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border bg-card p-2.5 text-left transition-colors hover:border-primary/60 hover:bg-accent/50",
                    !r.isAvailable && "cursor-not-allowed opacity-60 hover:border-border hover:bg-card"
                  )}
                >
                  <span className="relative aspect-[5/4] overflow-hidden rounded-lg bg-muted" aria-hidden>
                    <Image src={r.image} alt="" fill sizes="180px" className="object-cover" />
                    {!r.isAvailable ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-bold text-destructive">
                        OUT OF STOCK
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.productName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.variantName} · {r.availableToSell} avail</span>
                  </span>
                  <span className="font-bold text-primary">{r.priceLabel}</span>
                </button>
              ))}
            </div>
          )}

          {!query.trim() ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Start typing to search, or scan a barcode (try <code className="rounded bg-muted px-1 font-mono">6001234000011</code> for
              tomatoes). Availability is live — the final unit reserved online cannot be sold here.
            </p>
          ) : null}

          {/* held drafts */}
          {drafts.length ? (
            <div className="rounded-xl border bg-card">
              <h2 className="border-b p-3 text-sm font-semibold">Held sales ({drafts.length})</h2>
              <ul className="divide-y">
                {drafts.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div>
                      <p className="font-medium">{d.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.lineCount} lines · {formatMoney(d.totalMinor)} · held {d.createdAtLabel} · expires{" "}
                        {new Date(d.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => resume(d)}>
                      <Play className="size-3.5" aria-hidden /> Resume
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* cart */}
        <aside className="h-fit space-y-3 rounded-xl border bg-card p-4 lg:sticky lg:top-20" aria-label="Sale cart">
          <h2 className="font-semibold">Current sale</h2>
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Cart is empty — scan or tap products to add them.
            </p>
          ) : (
            <ul className="scroll-soft max-h-72 space-y-2 overflow-y-auto">
              {lines.map((l) => (
                <li key={l.variantId} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="relative size-12 shrink-0 overflow-hidden rounded bg-muted" aria-hidden>
                    <Image src={l.image} alt="" fill sizes="48px" className="object-cover" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.productName}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.variantName} · {l.priceLabel}</p>
                    <QuantityInput
                      size="sm"
                      value={l.quantity}
                      max={l.availableToSell}
                      onChange={(q) => setLines((prev) => (q === "0" ? prev.filter((x) => x.variantId !== l.variantId) : prev.map((x) => (x.variantId === l.variantId ? { ...x, quantity: q } : x))))}
                      ariaLabel={`Quantity for ${l.productName}`}
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatMoney(l.priceMinor * Number(l.quantity))}</p>
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={`Remove ${l.productName}`} onClick={() => setLines((prev) => prev.filter((x) => x.variantId !== l.variantId))}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="pos-cname">Customer (optional)</Label>
              <Input id="pos-cname" className="h-10" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in" />
            </div>
            <div>
              <Label htmlFor="pos-cphone">Phone (optional)</Label>
              <Input id="pos-cphone" className="h-10" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+233…" inputMode="tel" />
            </div>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{formatMoney(subtotal)}</span></div>
            {can("pos.discount") ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Discount (₵)</span>
                <Input className="h-9 w-28 text-right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" aria-label="Discount amount" />
              </div>
            ) : null}
            {discountMinor > 0 ? <div className="flex justify-between text-muted-foreground"><span>Discount applied</span><span className="tabular-nums">−{formatMoney(discountMinor)}</span></div> : null}
            <div className="flex justify-between text-base font-bold"><span>Total</span><span className="tabular-nums">{formatMoney(total)}</span></div>
          </div>

          {/* payment method */}
          <div>
            <Label>Payment</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ["cash_counter", "Cash", Banknote],
                ["mobile_money", "MoMo", Smartphone],
                ["card_hosted", "Card", CreditCard],
              ] as const).map(([m, label, Icon]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg border text-xs font-medium transition-colors",
                    method === m ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                  )}
                  aria-pressed={method === m}
                >
                  <Icon className="size-4" aria-hidden /> {label}
                </button>
              ))}
            </div>
          </div>

          {method === "cash_counter" ? (
            <div className="space-y-1">
              <Label htmlFor="pos-cash">Cash received (₵)</Label>
              <Input id="pos-cash" className="h-11 text-lg" inputMode="decimal" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder="0.00" />
              {cashMinor >= 0 ? (
                <p className={cn("text-sm", cashMinor < total ? "text-destructive" : "font-medium text-success")}>
                  {cashMinor < total ? `Short by ${formatMoney(total - cashMinor)}` : `Change: ${formatMoney(changeMinor)}`}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
              {method === "mobile_money" ? "Customer approves the Mobile Money prompt; the provider outcome is recorded on the order." : "Card payment captured on the terminal; status is recorded on the order."}
            </p>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button size="lg" className="h-12" onClick={complete} disabled={!lines.length || completing}>
              {completing ? "Completing…" : `Complete · ${formatMoney(total)}`}
            </Button>
            <Button size="lg" variant="outline" className="h-12" onClick={hold} disabled={!lines.length} aria-label="Hold current sale">
              <Pause className="size-4" aria-hidden />
            </Button>
          </div>
          {idempotencyKey ? (
            <p className="text-[11px] text-muted-foreground">Last completion key: <span className="font-mono">{idempotencyKey}</span> — replays are idempotent.</p>
          ) : null}
        </aside>
      </div>

      {/* receipt dialog with print */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="size-5 text-primary" aria-hidden /> Receipt {receipt?.receiptNo}
            </DialogTitle>
            <DialogDescription>Sale completed — stock consumed once.</DialogDescription>
          </DialogHeader>
          {receipt ? (
            <div className="print-area space-y-2 rounded-xl border p-4 font-mono text-sm">
              <div className="text-center">
                <p className="font-bold">{receipt.businessName}</p>
                <p className="text-xs text-muted-foreground">varietygrocery.com (demo)</p>
                <p className="text-xs text-muted-foreground">{receipt.atLabel} UTC</p>
              </div>
              <ul className="space-y-1">
                {receipt.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{l.quantity}× {l.productName} <span className="text-muted-foreground">({l.variantName})</span></span>
                    <span className="tabular-nums">{formatMoney(l.lineTotalMinor)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>TOTAL</span>
                <span className="tabular-nums">{receipt.totalLabel}</span>
              </div>
              {receipt.changeLabel ? <p>Change: {receipt.changeLabel}</p> : null}
              <p className="text-xs text-muted-foreground">
                {receipt.method.replace(/_/g, " ")} · {receipt.cashierName} · order {receipt.orderReference}
              </p>
              <p className="text-center text-[10px] text-muted-foreground">Demo receipt — no real payment</p>
            </div>
          ) : null}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="h-11" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Print receipt
            </Button>
            <Button asChild variant="outline" className="h-11">
              <Link href={`/admin/returns?orderId=${receipt?.orderId}`} onClick={() => setReceipt(null)}>
                <RotateCcw className="size-4" aria-hidden /> Start a return
              </Link>
            </Button>
            <Button className="h-11" onClick={() => setReceipt(null)}>New sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* transaction lookup */}
      <Dialog open={lookupOpen} onOpenChange={setLookupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transaction lookup</DialogTitle>
            <DialogDescription>Find a completed counter sale by receipt number (e.g. R-00001).</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="lookup-no">Receipt number</Label>
            <Input id="lookup-no" className="h-11 font-mono" value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="R-00001" />
          </div>
          <DialogFooter>
            <Button className="h-11" onClick={lookup} disabled={!receiptNo.trim()}>Look up</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
