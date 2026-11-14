"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, parseMoneyToMinor } from "@/lib/money";
import type {
  AdminProductRow, PosCashSaleView, PosHoldView,
  PosQuoteView, PosTillReconciliationView,
} from "@/services/contracts";
import { ApiError } from "@/services/adapters/types";
import { verifiedPosUat, type CashierTillList } from "./verified-pos-uat-transport";
import { PosCustomerPicker, type PosCustomerSelection } from "./pos-customer-picker";

type CartLine = { variantId: string; quantity: string };
type ProductChoice = {
  id: string; label: string; priceMinor: number;
  available: string; isAvailable: boolean;
};
const enabled = process.env.NEXT_PUBLIC_POS_COUNTER_UAT === "1";

function describeError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === "UNAUTHENTICATED") return "Sign in as a real cashier or administrator to use the staged POS.";
    if (cause.code === "FORBIDDEN") return "Only an assigned cashier or administrator can perform these test transactions.";
    if (cause.code === "POS_LOCATION_NOT_SUPPORTED") return "Choose a till at the configured test stock location.";
    return cause.message;
  }
  return cause instanceof Error ? cause.message : "The staging operation could not be verified.";
}

export function VerifiedPosUat() {
  const [csrf, setCsrf] = useState("");
  const [actorName, setActorName] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [tills, setTills] = useState<CashierTillList | null>(null);
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [tillId, setTillId] = useState("");
  const [chosenVariant, setChosenVariant] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<PosCustomerSelection>({ mode: "walk_in" });
  const [quote, setQuote] = useState<PosQuoteView | null>(null);
  const [hold, setHold] = useState<PosHoldView | null>(null);
  const [sale, setSale] = useState<PosCashSaleView | null>(null);
  const [report, setReport] = useState<PosTillReconciliationView | null>(null);
  const [cashInput, setCashInput] = useState("");
  const [handoverNote, setHandoverNote] = useState("");
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [goodsConfirmed, setGoodsConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.all([verifiedPosUat.session(), verifiedPosUat.tills(), verifiedPosUat.products()])
      .then(([session, list, catalogue]) => {
        if (!active) return;
        if (!["admin", "cashier"].includes(session.actor.role) || !session.csrfToken) {
          setError("A real authorised cashier or administrator session with CSRF protection is required.");
          return;
        }
        setCsrf(session.csrfToken);
        setActorName(`${session.actor.name} (${session.actor.role})`);
        setActorRole(session.actor.role);
        setTills(list);
        setProducts(catalogue);
        // Operators explicitly select the correct stock location; no silent default.
        setTillId("");
      })
      .catch(cause => { if (active) setError(describeError(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const choices = useMemo<ProductChoice[]>(() =>
    products.filter(product => product.isPublished).flatMap(product =>
      product.variants.filter(variant => variant.isActive).map(variant => ({
        id: variant.id,
        label: `${product.name} / ${variant.name}`,
        priceMinor: variant.priceMinor,
        available: variant.availableToSell,
        isAvailable: variant.isAvailable,
      }))
    ), [products]);

  const activeTill = tills?.sessions.find(t => t.id === tillId && t.status === "open");
  const selectedChoice = choices.find(choice => choice.id === chosenVariant);
  const tenderMinor = parseMoneyToMinor(cashInput) ?? -1;
  const totalMinor = hold?.subtotalMinor ?? quote?.pricing.totalMinor ?? 0;

  function resetCart() {
    setCart([]); setQuote(null); setHold(null); setSale(null); setReport(null);
    setCashInput(""); setHandoverNote(""); setCashConfirmed(false); setGoodsConfirmed(false);
    setCustomer({ mode: "walk_in" });
    setNotice(null); setError(null);
  }

  async function execute(operation: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null);
    try { await operation(); }
    catch (cause) { setError(describeError(cause)); }
    finally { setBusy(false); }
  }

  async function refresh() {
    await execute(async () => {
      const [list, catalogue] = await Promise.all([verifiedPosUat.tills(), verifiedPosUat.products()]);
      setTills(list); setProducts(catalogue);
      if (!list.sessions.some(x => x.id === tillId && x.status === "open")) {
        setTillId("");
        if (!hold) { setQuote(null); setCart([]); }
      }
      setNotice("Verified till and sample-stock records refreshed.");
    });
  }

  function addProduct() {
    if (!selectedChoice || !selectedChoice.isAvailable || hold) return;
    if (cart.some(line => line.variantId === selectedChoice.id)) return;
    setCart(current => [...current, { variantId: selectedChoice.id, quantity: "1" }]);
    setQuote(null); setSale(null);
  }

  const validCustomer = customer.mode === "walk_in" ||
    (customer.mode === "existing" && !!customer.customerUserId) ||
    (customer.mode === "named" && customer.customerName.trim().length >= 2);

  const validCart = cart.length > 0 && cart.every(line =>
    /^\d+(\.\d{1,3})?$/.test(line.quantity) && Number(line.quantity) > 0);

  if (!enabled) return (
    <section className="mx-auto max-w-3xl space-y-3 p-6">
      <h1 className="text-2xl font-semibold">Verified POS checkout is disabled here</h1>
      <p>The cash-only transaction screen is enabled only on an authorised testing build.
        Normal retail or production payments are not activated by this page.</p>
      <Link href="/admin/pos" className="underline">Return to the existing POS demonstration</Link>
    </section>
  );

  return <main className="mx-auto max-w-5xl space-y-5 p-4 pb-12 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-primary">Variety Groceries · Isolated UAT</p>
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">Verified sample cash checkout</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Real staging API · Synthetic grocery stock · Simulated cash only
        </p>
      </div>
      <Link href={actorRole === "cashier" ? "/staff/cashier" : "/admin/cashier-sessions"} className="rounded-md border px-4 py-3 text-sm font-medium">
        Cash drawer reports
      </Link>
    </header>

    <section className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-4 text-sm leading-6">
      <strong>Testing only — no real customers or tender.</strong> This screen records
      a simulated cash sale and deducts stock in the <strong>separate UAT database</strong>.
      It must never be used for actual cash, MoMo, card payments or physical goods handover.
      Cashiers are limited to assigned locations and carts they create. Administrators manage till opening, closing and movements.
    </section>

    {loading && <p role="status" className="rounded-xl border p-4">Verifying the real staff session…</p>}
    {error && <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-xl border p-4 text-sm">{notice}</p>}
    {!loading && !csrf && <Link href="/staff/login?next=%2Fstaff%2Fpos"
      className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium">
      Sign in with your staging staff account
    </Link>}

    {!loading && csrf && <>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">1. Choose an open till</h2>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void refresh()}>Refresh stock and tills</Button>
        </div>
        <p className="text-sm text-muted-foreground">Verified staff: {actorName}. Cashiers may sell only at their assigned, active location. Select the matching open till explicitly before quoting.</p>
        <label className="block space-y-1 text-sm font-medium">
          <span>Counter shift</span>
          <select value={tillId} disabled={!!hold || busy} onChange={event => {
            setTillId(event.target.value); setQuote(null); setCart([]); setReport(null);
          }} className="min-h-11 w-full rounded-md border bg-background px-3 text-base">
            <option value="">Select a till</option>
            {(tills?.sessions ?? []).filter(t => t.status === "open").map(t =>
              <option key={t.id} value={t.id}>{t.tillCode} · {t.locationId}</option>)}
          </select>
        </label>
        {!activeTill && <p className="text-sm">No open till is selected. Create a test till through the authorised administrator workflow first.</p>}
        {tills && !tills.enabled && <p role="alert" className="text-sm">The staging till foundation is disabled on the server.</p>}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">2. Add sample grocery items</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 space-y-1 text-sm font-medium">
            <span>Product and variant</span>
            <select value={chosenVariant} disabled={busy || !!hold} onChange={e => setChosenVariant(e.target.value)}
              className="min-h-11 w-full rounded-md border bg-background px-3 text-base">
              <option value="">Select sample product</option>
              {choices.map(choice => <option value={choice.id} key={choice.id} disabled={!choice.isAvailable}>
                {choice.label} · {formatMoney(choice.priceMinor)} · Available {choice.available}
              </option>)}
            </select>
          </label>
          <Button type="button" disabled={busy || !activeTill || !!hold || !selectedChoice?.isAvailable}
            onClick={addProduct}>Add item</Button>
        </div>
        {choices.length === 0 && <p className="text-sm">No published sample variants are available from the staging catalogue.</p>}
        {cart.length > 0 && <div className="space-y-2">
          {cart.map(line => {
            const item = choices.find(x => x.id === line.variantId);
            return <div key={line.variantId} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <span className="min-w-[160px] flex-1 text-sm">{item?.label ?? line.variantId}</span>
              <label className="space-y-1 text-sm">
                <span>Quantity</span>
                <Input className="w-28" value={line.quantity} inputMode="decimal"
                  disabled={busy || !!hold} onChange={e => {
                    setCart(old => old.map(x => x.variantId === line.variantId
                      ? { ...x, quantity: e.target.value } : x));
                    setQuote(null);
                  }} />
              </label>
              <Button type="button" variant="outline" disabled={busy || !!hold}
                onClick={() => { setCart(old => old.filter(x => x.variantId !== line.variantId)); setQuote(null); }}>
                Remove
              </Button>
            </div>;
          })}
        </div>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !csrf || !activeTill || !validCart || !!hold}
            onClick={() => void execute(async () => {
              const result = await verifiedPosUat.quote(csrf, tillId, cart);
              setQuote(result);
              setNotice("Server quote refreshed. Quoting does not reserve stock or collect cash.");
            })}>Check price and availability</Button>
          <Button type="button" variant="outline" disabled={busy || !!hold} onClick={resetCart}>Clear basket</Button>
        </div>
        {quote && <div className="space-y-1 rounded-lg border p-3 text-sm">
          <p>Server-quoted total: <strong className="tabular-nums">{formatMoney(quote.pricing.totalMinor)}</strong></p>
          <p>{quote.pricing.ok && quote.pricing.conflicts.length === 0
            ? "All sample items qualified at the time of quotation."
            : "There is an availability or pricing conflict. Review the items."}</p>
          <p className="text-muted-foreground">Quote only: no stock has been reserved and no payment has been taken.</p>
          <Button type="button" disabled={busy || !!hold || !quote.pricing.ok || quote.pricing.conflicts.length > 0}
            onClick={() => void execute(async () => {
              const reserved = await verifiedPosUat.hold(csrf, tillId, cart);
              setHold(reserved); setNotice("Sample inventory reserved for this UAT till.");
            })}>Reserve sample stock</Button>
        </div>}
      </section>

      <PosCustomerPicker value={customer} onChange={setCustomer} disabled={busy || !!sale} />
      {hold && <section className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">3. Simulate a cash sale</h2>
        <p className="text-sm">Reserved sample cart · {formatMoney(hold.subtotalMinor)} · Expires at {new Date(hold.expiresAt).toLocaleTimeString("en-GH")}</p>
        <label className="block space-y-1 text-sm font-medium">
          <span>Simulated cash received (₵)</span>
          <Input type="text" value={cashInput} onChange={e => setCashInput(e.target.value)}
            inputMode="decimal" placeholder="e.g. 40.00" disabled={busy || !!sale} />
        </label>
        <p className="text-sm">
          Amount due: <strong>{formatMoney(totalMinor)}</strong> ·
          {tenderMinor >= totalMinor
            ? <> Sample change: <strong>{formatMoney(tenderMinor - totalMinor)}</strong></>
            : " Enter sufficient sample cash"}
        </p>
        <label className="block space-y-1 text-sm font-medium">
          <span>Simulated handover note (minimum 10 characters)</span>
          <textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-base"
            value={handoverNote} disabled={busy || !!sale} onChange={e => setHandoverNote(e.target.value)}
            placeholder="UAT simulation only: sample cash and groceries handed over" />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={cashConfirmed} disabled={busy || !!sale}
            onChange={e => setCashConfirmed(e.target.checked)} />
          <span>I confirm this is simulated cash counted for a staging-only test.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={goodsConfirmed} disabled={busy || !!sale}
            onChange={e => setGoodsConfirmed(e.target.checked)} />
          <span>I confirm this is a simulated goods handover, not a real customer transaction.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !!sale || !validCustomer || tenderMinor < hold.subtotalMinor ||
            !cashConfirmed || !goodsConfirmed || handoverNote.trim().length < 10}
            onClick={() => void execute(async () => {
              if (!window.confirm("Record this SYNTHETIC staging-only cash sale and deduct its sample stock?")) return;
              const customerInput = customer.mode === "existing"
                ? { mode: "existing" as const, customerUserId: customer.customerUserId }
                : customer.mode === "named"
                  ? { mode: "named" as const, customerName: customer.customerName.trim() }
                  : { mode: "walk_in" as const };
              const created = await verifiedPosUat.sale(csrf, hold.id, tenderMinor,
                handoverNote.trim(), customerInput);
              setSale(created);
              setNotice("Synthetic sale recorded. The server issued a cash-only test receipt.");
              try { setReport(await verifiedPosUat.reconciliation(tillId)); }
              catch { setReport(null); }
            })}>Complete simulated cash sale</Button>
          <Button type="button" variant="outline" disabled={busy || !!sale}
            onClick={() => void execute(async () => {
              await verifiedPosUat.release(csrf, hold.id);
              setHold(null); setQuote(null);
              setNotice("Sample stock reservation cancelled without recording a sale.");
            })}>Release reserved stock</Button>
        </div>
      </section>}

      {sale && <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">4. Synthetic sale completed</h2>
        <p>Reference: <strong>{sale.reference}</strong></p>
        <p>Customer: <strong>{sale.customerName}</strong> · {sale.customerMode === "existing"
          ? "Linked registered customer" : sale.customerMode === "named" ? "Named walk-in" : "Walk-in"}</p>
        <p>Sale total: <strong>{formatMoney(sale.subtotalMinor)}</strong> ·
          Simulated tender: {formatMoney(sale.cashReceivedMinor)} ·
          Change: {formatMoney(sale.changeGivenMinor)}</p>
        <p className="text-sm">This is a cash-only UAT receipt, not a tax invoice or an electronic payment confirmation.</p>
        <div className="flex flex-wrap gap-2">
          <a href={verifiedPosUat.printReceipt(sale.id)} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted">
            Open printable test receipt
          </a>
          <Button type="button" onClick={resetCart}>Start another sample basket</Button>
        </div>
        {report && <p className="rounded-md border p-3 text-sm">
          Updated cash drawer: {formatMoney(report.expectedDrawerCashMinor)} ·
          Recorded sample sales: {report.cashSalesCount}
        </p>}
      </section>}
    </>}
  </main>;
}
