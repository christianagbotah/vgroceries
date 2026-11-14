"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApiData } from "@/features/staff/admin-data";
import { apiOps } from "@/services/client";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, RefreshCw, PackageSearch } from "lucide-react";
import { formatDate } from "@/lib/format";

type Lot = Awaited<ReturnType<typeof apiOps.lots>>[number];
type Status = "available" | "expiring" | "expired" | "quarantined" | "damaged";
const LABELS: Record<Status, string> = {
  available: "Available", expiring: "Expiring soon", expired: "Expired",
  quarantined: "Quarantined", damaged: "Damaged / unusable",
};
function statusOf(lot: Lot, today: string): Status {
  if (["damaged", "waste", "disposed", "unsafe", "spoilage"].includes(lot.kind)) return "damaged";
  if (lot.isQuarantined || lot.kind !== "regular") return "quarantined";
  if (lot.expired || (lot.expiryDate && lot.expiryDate <= today)) return "expired";
  const week = new Date(Date.parse(today + "T00:00:00Z") + 7 * 86400000).toISOString().slice(0, 10);
  if (lot.expiryDate && lot.expiryDate <= week) return "expiring";
  return "available";
}
export default function StockLotsPage() {
  const { data, error, loading, reload } = useApiData(() => apiOps.lots(), []);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => (data ?? []).filter((lot) => {
    const search = [lot.productName, lot.variantName, lot.lotNumber, lot.location].join(" ").toLowerCase();
    return search.includes(q.trim().toLowerCase()) && (filter === "all" || statusOf(lot, today) === filter);
  }), [data, q, filter, today]);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div><h1 className="font-serif text-2xl font-bold">Recorded stock lots</h1>
          <p className="text-sm text-muted-foreground">Real lot balances shared with online checkout and POS.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11"><Link href="/admin/inventory"><ArrowLeft className="size-4" aria-hidden /> Stock overview</Link></Button>
          <Button variant="outline" className="h-11" disabled={loading} onClick={() => void reload()}><RefreshCw className="size-4" aria-hidden /> Refresh</Button>
        </div>
      </header>
      <p className="rounded-xl border bg-muted/40 p-3 text-sm">
        These are <strong>recorded physical quantities</strong>, not available-to-sell totals. Reservations,
        safety stock, expiry and quarantine reduce what can be sold. This report cannot modify inventory.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Search recorded lots" className="h-11 pl-9"
            placeholder="Product, variant, lot number or location" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Lot status" value={filter} onChange={(e) => setFilter(e.target.value as Status | "all")}
          className="h-11 w-full cursor-pointer rounded-lg border bg-background px-3 sm:w-48">
          <option value="all">All statuses</option>
          {(Object.keys(LABELS) as Status[]).map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}
        </select>
      </div>
      {loading ? <LoadingState rows={6} label="Loading real stock lots" /> :
        error ? <ErrorState message={error} onRetry={reload} /> :
        !(data?.length) ? <EmptyState icon={PackageSearch} title="No positive stock lots recorded"
          description="Receive goods to establish physical inventory lots." /> :
        rows.length === 0 ? <EmptyState icon={Search} title="No lots match your search" /> : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {rows.length} of {data.length} positive-balance lots
          </p>
          <div className="grid gap-2 md:hidden">
            {rows.map((lot) => <article key={lot.id} className="rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h2 className="font-semibold">{lot.productName}</h2>
                  <p className="text-sm text-muted-foreground">{lot.variantName}</p></div>
                <Badge variant="outline">{LABELS[statusOf(lot, today)]}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-muted-foreground">Lot</dt><dd className="break-all font-mono">{lot.lotNumber}</dd></div>
                <div><dt className="text-muted-foreground">Physical qty</dt><dd className="font-semibold tabular-nums">{lot.quantity}</dd></div>
                <div><dt className="text-muted-foreground">Expiry</dt><dd>{lot.expiryDate ? formatDate(lot.expiryDate) : "Not recorded"}</dd></div>
                <div><dt className="text-muted-foreground">Location</dt><dd>{lot.location}</dd></div>
              </dl>
            </article>)}
          </div>
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block"><div className="table-scroll">
            <table className="w-full text-sm"><thead className="bg-muted/60 text-left"><tr>
              <th className="p-3">Product / variant</th><th className="p-3">Lot number</th>
              <th className="p-3 text-right">Physical qty</th><th className="p-3">Expiry</th>
              <th className="p-3">Location</th><th className="p-3">Status</th>
            </tr></thead><tbody>
              {rows.map((lot) => <tr key={lot.id} className="border-t">
                <td className="p-3"><p className="font-medium">{lot.productName}</p>
                  <p className="text-xs text-muted-foreground">{lot.variantName}</p></td>
                <td className="p-3 font-mono text-xs">{lot.lotNumber}</td>
                <td className="p-3 text-right font-semibold tabular-nums">{lot.quantity}</td>
                <td className="p-3">{lot.expiryDate ? formatDate(lot.expiryDate) : "Not recorded"}</td>
                <td className="p-3">{lot.location}</td>
                <td className="p-3"><Badge variant="outline">{LABELS[statusOf(lot, today)]}</Badge></td>
              </tr>)}
            </tbody></table>
          </div></div>
        </>
      )}
    </div>
  );
}
