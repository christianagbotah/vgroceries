"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import type { PosCashSaleView } from "@/services/contracts";
import { ApiError } from "@/services/adapters/types";
import { isDemoStaffSessionActive } from "./staff-demo-session";
import {
  assertVerifiedPosCashHistoryUat,
  loadVerifiedPosCashHistoryPage,
  verifiedPosCashHistoryUatEnabled,
  verifiedPosReceiptPrintUrl,
} from "./verified-pos-cash-history-client";

const recordedAt = (value: string) => new Intl.DateTimeFormat("en-GH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra",
}).format(new Date(value));

export function VerifiedPosCashHistoryUat() {
  const [sales, setSales] = useState<PosCashSaleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState("");
  const [filter, setFilter] = useState("");
  const [revision, setRevision] = useState(0);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const pageRequest = useRef(false);
  const selected = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    return sales.filter(sale => !needle ||
      [sale.reference, sale.customerName, sale.tillSessionId].some(value =>
        value.toLocaleLowerCase().includes(needle)));
  }, [sales, filter]);

  useEffect(() => {
    if (!verifiedPosCashHistoryUatEnabled) {
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      setSales([]);
      setNextCursor(null);
      setCurrentCursor(null);
      setPreviousCursors([]);
      try {
        assertVerifiedPosCashHistoryUat({
          enabled: verifiedPosCashHistoryUatEnabled,
          demo: isDemoStaffSessionActive(),
          apiBase: process.env.NEXT_PUBLIC_API_BASE_URL,
        });
        const { apiOps } = await import("@/services/client");
        const identity = await apiOps.staffSession();
        if (identity.actor.role !== "admin")
          throw new ApiError("FORBIDDEN", "Only a real authorised administrator may review cash sales.");
        const page = await loadVerifiedPosCashHistoryPage();
        if (active) {
          setAdmin(identity.actor.name);
          setSales(page.sales);
          setNextCursor(page.nextCursor);
        }
      } catch (cause) {
        if (active) {
          setAdmin("");
          setSales([]);
          setError(cause instanceof ApiError &&
            (cause.code === "FORBIDDEN" || cause.code === "UNAUTHENTICATED")
              ? "Administrator access is required to review counter cash sales."
              : cause instanceof ApiError
                ? cause.message
                : "Cash sales could not be verified. No records were displayed.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [revision]);

  const navigatePage = async (cursor: string | null, older: boolean) => {
    if (loading || pageLoading || pageRequest.current || !admin) return;
    pageRequest.current = true;
    setPageLoading(true);
    setError("");
    try {
      const page = await loadVerifiedPosCashHistoryPage(cursor ?? undefined);
      setSales(page.sales);
      setNextCursor(page.nextCursor);
      setPreviousCursors(previous => older
        ? [...previous, currentCursor] : previous.slice(0, -1));
      setCurrentCursor(cursor);
      setFilter("");
    } catch (cause) {
      if (cause instanceof ApiError &&
          ["FORBIDDEN", "UNAUTHENTICATED"].includes(cause.code)) {
        // Session may have expired between pages: remove prior private data.
        setAdmin("");
        setSales([]);
        setNextCursor(null);
        setCurrentCursor(null);
        setPreviousCursors([]);
      }
      setError(cause instanceof ApiError &&
        ["FORBIDDEN", "UNAUTHENTICATED"].includes(cause.code)
          ? "Administrator access is required to review counter cash sales."
          : cause instanceof ApiError ? cause.message
            : "Could not verify another page of cash sales.");
    } finally {
      pageRequest.current = false;
      setPageLoading(false);
    }
  };

  if (!verifiedPosCashHistoryUatEnabled) {
    return <main className="mx-auto max-w-3xl space-y-3 rounded-xl border p-6">
      <h1 className="font-serif text-2xl font-semibold">Verified POS cash history is disabled</h1>
      <p className="text-sm text-muted-foreground">This read-only administrator screen requires an approved UAT build.</p>
      <Button asChild variant="outline"><Link href="/admin/pos/verified-uat">Back to POS preview</Link></Button>
    </main>;
  }

  return <main className="mx-auto max-w-6xl space-y-5 pb-12">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-primary">Verified POS · Administrator only</p>
        <h1 className="font-serif text-3xl font-bold">Counter cash sale records</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Read-only, server-paginated history of recorded cash sales (25 per page).
          This is not a complete financial ledger, tax invoice, electronic settlement or refund report.
        </p>
      </div>
      <Button variant="outline" className="min-h-11" disabled={loading || pageLoading}
        onClick={() => setRevision(value => value + 1)}>
        <RefreshCw className="size-4" aria-hidden /> Refresh records
      </Button>
    </header>

    <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm leading-6">
      <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
      Records are read from the real, authenticated POS API. This screen cannot record cash,
      reserve or release inventory, complete a sale, approve a refund or change a till.
    </p>
    {loading ? <p role="status" className="rounded-lg border p-4 text-sm">
      Verifying administrator access and fetching cash-sale history…
    </p> : null}
    {error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      {error}
    </p> : null}

    {!loading && !error && admin ? <>
      <p className="text-sm text-muted-foreground">Verified administrator: <strong>{admin}</strong>.
        Showing {sales.length} cash sale{sales.length === 1 ? "" : "s"} on page {previousCursors.length + 1}.
        Records are loaded from the server, up to 25 per page; the full ledger may contain more sales.
      </p>
      <div className="max-w-lg space-y-1">
        <label htmlFor="pos-cash-history-search" className="text-sm font-medium">
          Search this page by reference, customer or till ID
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="pos-cash-history-search" value={filter} maxLength={100}
            onChange={event => setFilter(event.target.value)}
            className="min-h-12 pl-10" placeholder="Search recent cash sales" />
        </div>
      </div>
      {!sales.length ? <p className="rounded-lg border p-5 text-sm">
        The API returned no completed cash sales. This does not confirm that a till is empty or reconciled.
      </p> : null}
      {sales.length > 0 && !selected.length ? <p role="status" className="rounded-lg border p-5 text-sm">
        No matching records on this page ({sales.length} cash sales). Other pages are not searched.
      </p> : null}
      <div className="space-y-3">
        {selected.map(sale => <article key={sale.id} className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="break-all text-base font-bold">{sale.reference}</h2>
              <p className="text-sm text-muted-foreground">{recordedAt(sale.createdAt)} · {sale.customerName}</p>
              <p className="break-all text-xs text-muted-foreground">Till: {sale.tillSessionId}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xl font-bold tabular-nums">{formatMoney(sale.subtotalMinor)}</p>
              <p className="text-xs font-medium text-muted-foreground">Physical cash · Not a tax invoice</p>
            </div>
          </div>
          <dl className="mt-4 grid gap-2 rounded-lg bg-muted/35 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-muted-foreground">Cash received</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(sale.cashReceivedMinor)}</dd></div>
            <div><dt className="text-muted-foreground">Change given</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(sale.changeGivenMinor)}</dd></div>
            <div><dt className="text-muted-foreground">Items</dt>
              <dd className="font-semibold">{sale.lines.length} line{sale.lines.length === 1 ? "" : "s"}</dd></div>
          </dl>
          <details className="mt-3 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">View recorded line amounts</summary>
            <div className="mt-3 space-y-2">
              {sale.lines.map(line => <div key={line.variantId}
                className="grid min-w-0 gap-1 border-t pt-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-4">
                <span className="min-w-0 break-all text-muted-foreground">Variant {line.variantId} · Qty {line.quantity}</span>
                <span className="tabular-nums">Unit {formatMoney(line.unitPriceMinor)}</span>
                <strong className="tabular-nums">{formatMoney(line.lineTotalMinor)}</strong>
              </div>)}
              <p className="text-xs text-muted-foreground">Variant identifiers are authoritative; immutable product names are on the server print view.</p>
            </div>
          </details>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline" className="min-h-11">
              <a href={verifiedPosReceiptPrintUrl(sale.id, process.env.NEXT_PUBLIC_API_BASE_URL!)}
                target="_blank" rel="noopener noreferrer">
                Open original cash receipt <ExternalLink className="size-4" aria-hidden />
              </a>
            </Button>
          </div>
        </article>)}
      </div>
      <nav aria-label="Cash-sale history pages" className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="button" variant="outline" className="min-h-11"
          disabled={pageLoading || previousCursors.length === 0}
          onClick={() => void navigatePage(previousCursors.at(-1) ?? null, false)}>
          Newer sales
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          Page {previousCursors.length + 1}{pageLoading ? " · Fetching…" : ""}
        </span>
        <Button type="button" variant="outline" className="min-h-11"
          disabled={pageLoading || !nextCursor}
          onClick={() => { if (nextCursor) void navigatePage(nextCursor, true); }}>
          Older sales
        </Button>
      </nav>
    </> : null}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild><Link href="/admin/pos/verified-uat/reconciliation">Review cash drawer reconciliation</Link></Button>
      <Button variant="outline" asChild><Link href="/admin/pos/verified-uat">Back to POS preview</Link></Button>
    </div>
  </main>;
}
