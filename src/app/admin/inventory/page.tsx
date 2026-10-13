"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState, EmptyState, NoResults } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Info, Search } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof apiOps.inventory>>["rows"][number];

export default function AdminInventoryPage() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const { data, loading, error, reload } = useApiData(
    () => apiOps.inventory({ q: q || undefined, filter: filter === "all" ? undefined : filter }),
    [q, filter]
  );

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const summary = data?.summary;
  const filtering = filter !== "all" || !!q;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Stock overview</h1>
          <p className="text-sm text-muted-foreground">
            One stock model shared by every selling channel — shop floor (demo), with backroom and
            quarantine locations.
          </p>
        </div>
        <Button asChild variant="outline" className="h-10">
          <Link href="/admin/inventory/expiry">Expiry &amp; quarantine</Link>
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          <strong>Available to sell</strong> = sellable physical (unexpired, undamaged, unquarantined
          lots) − active reservations − safety stock. The same held quantity is never subtracted
          twice: reservations are counted once, separately from lot quantities.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="relative min-w-0 flex-1 sm:min-w-56"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(searchInput.trim());
          }}
        >
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" className="h-11 pl-9" placeholder="Product or variant…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search stock" key={q} />
        </form>
        <Select value={filter} onValueChange={setFilter} aria-label="Filter stock">
          <SelectTrigger className="h-11 w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All items</SelectItem>
            <SelectItem value="low">Low stock (≤ 3)</SelectItem>
            <SelectItem value="zero">Zero available</SelectItem>
            <SelectItem value="reserved">Has reservations</SelectItem>
          </SelectContent>
        </Select>
        {filtering ? (
          <button type="button" className="h-11 rounded-lg border px-3 text-sm hover:bg-accent" onClick={() => { setFilter("all"); setQ(""); setSearchInput(""); }}>
            Clear
          </button>
        ) : null}
      </div>

      {summary ? (
        <dl className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3 text-sm sm:grid-cols-3 lg:grid-cols-6" aria-label="Stock state summary">
          {[
            { label: "Sellable physical", value: summary.sellablePhysical, hint: "unexpired, undamaged" },
            { label: "Reserved", value: summary.reserved, hint: "active holds" },
            { label: "Safety floor", value: summary.safetyStock, hint: "never sold" },
            { label: "Available to sell", value: summary.availableToSell, hint: "what the shop shows", strong: true },
            { label: "Quarantined", value: summary.quarantined, hint: "awaiting inspection", warn: true },
            { label: "Damaged / expired", value: summary.damagedExpired, hint: "written off / unusable", warn: true },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/50 p-2.5">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className={cn("text-lg font-bold tabular-nums", s.strong && "text-primary", s.warn && "text-[color:var(--warning-foreground)]")}>
                {s.value}
              </dd>
              <p className="text-[11px] text-muted-foreground">{s.hint}</p>
            </div>
          ))}
        </dl>
      ) : null}

      {loading ? (
        <LoadingState rows={8} label="Loading stock" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        q ? <NoResults query={q} /> : <EmptyState title="No stock rows" />
      ) : (
        <>
          {/* mobile: card list */}
          <ul className="space-y-2 md:hidden" aria-label="Stock">
            {rows.map((r: Row) => (
              <li key={r.variantId} className="rounded-xl border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/products/${r.productId}`} className="min-w-0 font-medium hover:underline focus-visible:underline">
                    <span className="block truncate">{r.productName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.variantName}</span>
                  </Link>
                  <span className={cn("shrink-0 text-lg font-bold tabular-nums", Number(r.availableToSell) === 0 ? "text-destructive" : Number(r.availableToSell) <= 3 ? "text-[color:var(--warning-foreground)]" : "")}>
                    {r.availableToSell}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
                  <div className="rounded bg-muted/60 p-1.5">
                    <dt className="text-muted-foreground">Physical</dt>
                    <dd className="font-semibold tabular-nums">{r.sellablePhysical}</dd>
                  </div>
                  <div className="rounded bg-muted/60 p-1.5">
                    <dt className="text-muted-foreground">Reserved</dt>
                    <dd className="font-semibold tabular-nums">{r.reserved}</dd>
                  </div>
                  <div className="rounded bg-muted/60 p-1.5">
                    <dt className="text-muted-foreground">Safety</dt>
                    <dd className="font-semibold tabular-nums">{r.safetyStock}</dd>
                  </div>
                </dl>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {r.lotCount} lot{r.lotCount === 1 ? "" : "s"}
                  {r.nextExpiry ? ` · next expiry ${formatDateTime(r.nextExpiry).split(",")[0]}` : ""}
                </p>
              </li>
            ))}
          </ul>
          {/* md+: table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-semibold">Item</th>
                  <th className="p-3 text-right font-semibold">Sellable physical</th>
                  <th className="p-3 text-right font-semibold">Reserved</th>
                  <th className="p-3 text-right font-semibold">Safety</th>
                  <th className="p-3 text-right font-semibold">Available to sell</th>
                  <th className="hidden p-3 font-semibold md:table-cell">Lots</th>
                  <th className="hidden p-3 font-semibold lg:table-cell">Next expiry</th>
                  <th className="hidden p-3 font-semibold xl:table-cell">Last movement</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: Row) => (
                  <tr key={r.variantId} className="border-t hover:bg-accent/50">
                    <td className="p-3">
                      <Link href={`/admin/products/${r.productId}`} className="font-medium hover:underline focus-visible:underline">
                        {r.productName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{r.variantName}</p>
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.sellablePhysical}</td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(r.reserved) > 0 ? (
                        <span className="font-medium text-primary">{r.reserved}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{r.safetyStock}</td>
                    <td className="p-3 text-right">
                      {Number(r.availableToSell) === 0 ? (
                        <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">0 — hidden from shop</Badge>
                      ) : Number(r.availableToSell) <= 3 ? (
                        <span className="font-bold tabular-nums text-[color:var(--warning-foreground)]">{r.availableToSell}</span>
                      ) : (
                        <span className="font-semibold tabular-nums">{r.availableToSell}</span>
                      )}
                    </td>
                    <td className="hidden p-3 text-muted-foreground md:table-cell">{r.lotCount}</td>
                    <td className="hidden p-3 text-muted-foreground lg:table-cell">
                      {r.nextExpiry ? formatDateTime(r.nextExpiry).split(",")[0] : "—"}
                    </td>
                    <td className="hidden p-3 text-muted-foreground xl:table-cell">
                      {r.lastMovement && r.lastMovementAt ? `${r.lastMovement.replace(/_/g, " ")} ${formatDateTime(r.lastMovementAt).split(",")[1] ?? ""}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
