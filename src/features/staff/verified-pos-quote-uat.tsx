"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  AdminProductRow,
  CashierTillSessionView,
  PosQuoteView,
} from "@/services/contracts";
import { ApiError } from "@/services/adapters/types";
import { isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";
import { formatMoney, parseMoneyToMinor } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VerifiedPosCustomerPicker } from "@/features/staff/verified-pos-customer-picker";
import { posCustomerLookupUatEnabled } from "@/features/staff/verified-pos-customer-lookup";
import { verifiedPosCashHistoryUatEnabled } from "@/features/staff/verified-pos-cash-history-client";
import {
  assertVerifiedPosQuoteUat,
  getVerifiedPosPreviewData,
  previewVerifiedPosQuote,
  verifiedPosQuoteUatEnabled,
} from "./verified-pos-quote-client";

type BasketLine = { variantId: string; quantity: string };
type Choice = {
  id: string;
  label: string;
  priceMinor: number;
  availability: string;
  isAvailable: boolean;
  barcode: string;
};

const describeFailure = (error: unknown) =>
  error instanceof ApiError
    ? error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED"
      ? "Only a real authorised administrator may preview POS quotes."
      : error.message
    : "The POS preview could not be verified. No reservation or payment was made.";

export function VerifiedPosQuoteUat() {
  const [tills, setTills] = useState<CashierTillSessionView[]>([]);
  const [serverEnabled, setServerEnabled] = useState(false);
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adminName, setAdminName] = useState("");
  const [revision, setRevision] = useState(0);
  const [tillId, setTillId] = useState("");
  const [query, setQuery] = useState("");
  const [chosenVariant, setChosenVariant] = useState("");
  const [cart, setCart] = useState<BasketLine[]>([]);
  const [quote, setQuote] = useState<PosQuoteView | null>(null);
  const [tender, setTender] = useState("");
  const changeToken = useRef(0);

  useEffect(() => {
    if (!verifiedPosQuoteUatEnabled) return;
    let current = true;
    const load = async () => {
      try {
        assertVerifiedPosQuoteUat({
          enabled: verifiedPosQuoteUatEnabled,
          demo: isDemoStaffSessionActive(),
          apiBase: process.env.NEXT_PUBLIC_API_BASE_URL,
        });
        const { apiOps } = await import("@/services/client");
        const session = await apiOps.staffSession();
        if (session.actor.role !== "admin")
          throw new ApiError("FORBIDDEN", "A real administrator account is required.");
        const data = await getVerifiedPosPreviewData();
        if (!current) return;
        setAdminName(session.actor.name);
        setTills(data.tills);
        setProducts(data.products);
        setServerEnabled(data.enabled);
        setTillId(previous => data.tills.some(t => t.id === previous && t.status === "open")
          ? previous : "");
        setError("");
      } catch (cause) {
        if (current) {
          setError(describeFailure(cause));
          setTills([]);
          setProducts([]);
          setServerEnabled(false);
        }
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return () => { current = false; };
  }, [revision]);

  const choices = useMemo<Choice[]>(() => products.filter(p => p.isPublished)
    .flatMap(p => p.variants.filter(v => v.isActive).map(v => ({
      id: v.id,
      label: p.name + " · " + v.name,
      priceMinor: v.priceMinor,
      availability: v.availableToSell,
      isAvailable: v.isAvailable,
      barcode: v.barcode ?? "",
    }))), [products]);
  const filtered = useMemo(() => choices.filter(c =>
    !query.trim() || (c.label + " " + c.barcode).toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())).slice(0, 80), [choices, query]);

  const selected = choices.find(choice => choice.id === chosenVariant);
  const activeTill = tills.find(till => till.id === tillId && till.status === "open");
  const unique = new Set(cart.map(line => line.variantId)).size === cart.length;
  const validCart = unique && cart.length > 0 && cart.length <= 100 &&
    cart.every(line =>
      /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(line.quantity) &&
      Number(line.quantity) > 0
    );
  const estimatedTender = parseMoneyToMinor(tender);
  const estimatedChange = quote && estimatedTender !== null && estimatedTender >= quote.pricing.totalMinor
    ? estimatedTender - quote.pricing.totalMinor
    : null;

  const invalidateQuote = () => {
    ++changeToken.current;
    setQuote(null);
  };
  const refresh = () => {
    invalidateQuote();
    setError("");
    setLoading(true);
    setRevision(value => value + 1);
  };
  const addItem = () => {
    if (!selected?.isAvailable || cart.some(line => line.variantId === selected.id) ||
      cart.length >= 100) return;
    invalidateQuote();
    setCart(current => [...current, { variantId: selected.id, quantity: "1" }]);
  };
  const checkPrice = async () => {
    if (!activeTill || !serverEnabled || !validCart || loading || busy) return;
    setBusy(true);
    setError("");
    const ticket = ++changeToken.current;
    try {
      const next = await previewVerifiedPosQuote({ sessionId: activeTill.id, lines: cart });
      if (ticket === changeToken.current) setQuote(next);
    } catch (cause) {
      if (ticket === changeToken.current) setError(describeFailure(cause));
    } finally { setBusy(false); }
  };

  if (!verifiedPosQuoteUatEnabled) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 rounded-xl border p-6">
        <h1 className="font-serif text-2xl font-bold">Verified counter preview is disabled</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          The real counter quote screen is available only on explicitly approved UAT builds.
          The public store and all POS transactions remain unaffected.
        </p>
        <Button asChild variant="outline"><Link href="/admin/pos">Return to POS</Link></Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-primary">Administrator preview · Quote only</p>
          <h1 className="font-serif text-3xl font-bold">Verified grocery counter</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Build a sample basket and request authoritative prices from the POS quote API.
            Nothing on this screen reserves stock, records cash or hands goods over.
          </p>
        </div>
        <Button variant="outline" disabled={busy || loading} onClick={refresh}
          className="min-h-11">Refresh tills and stock</Button>
      </header>
      <p role="status" className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-4 text-sm leading-6">
        Isolated testing only. Never use this page as evidence of a completed sale,
        a received payment, a tax invoice or a stock movement.
      </p>
      {loading ? <p role="status" className="rounded-xl border p-4 text-sm">
        Verifying administrator and retrieving till and product data…
      </p> : null}
      {error ? <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error}</p> : null}
      {adminName && !loading ? <p className="text-sm text-muted-foreground">
        Verified administrator: <strong>{adminName}</strong>. Backend staff permissions are checked on each request.
      </p> : null}
      {!loading && !serverEnabled ? <p role="status" className="rounded-xl border p-4 text-sm">
        The POS till foundation is disabled on this API. Quoting is unavailable.
      </p> : null}
      {!loading && adminName && serverEnabled ? (
        <>
          <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="text-lg font-semibold">1. Choose an active till</h2>
            <label htmlFor="verified-pos-quote-till" className="block text-sm font-medium">Counter till</label>
            <select id="verified-pos-quote-till" value={tillId}
              className="min-h-12 w-full rounded-md border bg-background px-3 text-base"
              disabled={busy} onChange={event => {
                invalidateQuote();
                setCart([]);
                setTillId(event.target.value);
              }}>
              <option value="">Select an open till</option>
              {tills.filter(till => till.status === "open").map(till =>
                <option value={till.id} key={till.id}>
                  {till.tillCode} · {till.locationId}
                </option>)}
            </select>
            {!activeTill ? <p className="text-sm text-muted-foreground">
              No till selected. An administrator must open a test till through the separate authorised till workflow.
            </p> : null}
          </section>
          <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="text-lg font-semibold">2. Build a grocery basket</h2>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-end">
              <div className="space-y-1">
                <label htmlFor="verified-pos-product-search" className="text-sm font-medium">Filter products</label>
                <Input id="verified-pos-product-search" value={query} maxLength={120}
                  placeholder="Name or barcode" className="min-h-12"
                  onChange={event => setQuery(event.target.value)} />
              </div>
              <div className="min-w-0 space-y-1">
                <label htmlFor="verified-pos-variant" className="text-sm font-medium">Product and variant</label>
                <select id="verified-pos-variant" value={chosenVariant} disabled={busy}
                  onChange={event => setChosenVariant(event.target.value)}
                  className="min-h-12 w-full min-w-0 rounded-md border bg-background px-3 text-base">
                  <option value="">Choose a grocery item</option>
                  {filtered.map(product => <option key={product.id} value={product.id}
                    disabled={!product.isAvailable}>
                    {product.label} · {formatMoney(product.priceMinor)} · Stock {product.availability}
                  </option>)}
                </select>
              </div>
              <Button className="min-h-12" disabled={busy || !activeTill ||
                !selected?.isAvailable || cart.length >= 100} onClick={addItem}>
                Add item
              </Button>
            </div>
            {choices.length === 0 ? <p className="text-sm text-muted-foreground">
              No published, active grocery items were returned by the API.
            </p> : null}
            {cart.length > 0 ? <div className="space-y-2">
              {cart.map(line => {
                const item = choices.find(choice => choice.id === line.variantId);
                return (
                  <div key={line.variantId} className="grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_130px_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">{item?.label ?? "Unknown product"}</p>
                      <p className="text-xs text-muted-foreground">Displayed price {item ? formatMoney(item.priceMinor) : "unavailable"} · final price is server-quoted</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs" htmlFor={"verified-pos-qty-" + line.variantId}>Quantity</label>
                      <Input id={"verified-pos-qty-" + line.variantId} value={line.quantity}
                        inputMode="decimal" className="min-h-11"
                        disabled={busy} maxLength={18}
                        onChange={event => {
                          invalidateQuote();
                          setCart(current => current.map(row => row.variantId === line.variantId
                            ? { ...row, quantity: event.target.value } : row));
                        }} />
                    </div>
                    <Button variant="outline" className="min-h-11" disabled={busy}
                      onClick={() => {
                        invalidateQuote();
                        setCart(current => current.filter(row => row.variantId !== line.variantId));
                      }}>Remove</Button>
                  </div>
                );
              })}
            </div> : null}
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-12" disabled={!activeTill || !validCart || busy}
                onClick={() => void checkPrice()}>
                {busy ? "Checking with server…" : "Check price and availability"}
              </Button>
              <Button variant="outline" className="min-h-12" disabled={busy || cart.length === 0}
                onClick={() => { invalidateQuote(); setCart([]); }}>
                Clear basket
              </Button>
            </div>
            {quote ? <section className="space-y-3 rounded-lg border p-4" aria-labelledby="verified-quote-outcome">
              <h3 id="verified-quote-outcome" className="text-lg font-semibold">Server price preview</h3>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(quote.pricing.totalMinor)}</p>
              <p className="text-sm">{quote.pricing.ok && !quote.pricing.conflicts.length
                ? "Items are eligible at the time of this quote."
                : "Some items are unavailable or their prices changed. Review and quote again."}</p>
              <p className="text-xs text-muted-foreground">
                Pricing does not reserve stock. Current inventory and price are rechecked at an actual sale.
              </p>
              <div className="space-y-1">
                <label htmlFor="verified-pos-tender" className="text-sm font-medium">
                  Optional tender calculator (₵; does not accept money)
                </label>
                <Input id="verified-pos-tender" inputMode="decimal" maxLength={16}
                  placeholder="e.g. 50.00" value={tender} onChange={event => setTender(event.target.value)}
                  className="min-h-11 sm:max-w-xs" />
                <p className="text-sm">
                  {estimatedChange !== null
                    ? "Estimated change: " + formatMoney(estimatedChange)
                    : "Enter an amount at least equal to the quote to preview change."}
                </p>
              </div>
              <p className="text-sm font-semibold">Quote only — no sale, reservation or payment buttons.</p>
            </section> : null}
          </section>
          {posCustomerLookupUatEnabled ? <VerifiedPosCustomerPicker disabled={busy}
            scopeNote="Administrators may search active registered accounts across Variety Groceries. Phone numbers are masked." /> : null}
        </>
      ) : null}
      {verifiedPosCashHistoryUatEnabled ? <>
        <Button asChild variant="outline"><Link href="/admin/pos/verified-uat/history">Review verified cash-sale history</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/pos/verified-uat/reconciliation">Review cash drawer reconciliation</Link></Button>
      </> : null}
      <Button asChild variant="outline"><Link href="/admin/pos">Back to POS overview</Link></Button>
    </main>
  );
}
