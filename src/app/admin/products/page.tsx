"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { apiOps } from "@/services/client";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Boxes } from "lucide-react";
import { useApiData } from "@/features/staff/admin-data";

type ProductRow = Awaited<ReturnType<typeof apiOps.adminProducts>>[number];

export default function AdminProductsPage() {
  const { can } = useStaff();
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useApiData(() => apiOps.adminProducts(q || undefined), [q]);
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  if (loading && !data) return <LoadingState rows={6} label="Loading products" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} products · variants, prices, availability and publication.
          </p>
        </div>
        {can("catalog.view") ? (
          <Link href="/admin/categories" className="text-sm font-medium text-primary hover:underline focus-visible:underline">Manage categories</Link>
        ) : null}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" className="h-11 pl-9" placeholder="Search products…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search products" />
      </div>

      {!rows.length ? (
        <EmptyState icon={Boxes} title="No products match" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-semibold">Product</th>
                  <th className="p-3 font-semibold">Category</th>
                  <th className="p-3 font-semibold">Variants & prices</th>
                  <th className="p-3 font-semibold">Publication</th>
                  <th className="p-3 text-right font-semibold">Availability</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p: ProductRow) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted" aria-hidden>
                          <Image src={p.image} alt="" fill sizes="40px" className="object-cover" />
                        </span>
                        <div className="min-w-0">
                          <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline focus-visible:underline">{p.name}</Link>
                          <p className="truncate text-xs text-muted-foreground">{p.shortDescription}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.categoryName}</td>
                    <td className="p-3">
                      <ul className="space-y-0.5 text-xs">
                        {p.variants.slice(0, 3).map((v) => (
                          <li key={v.id}>
                            <span className="font-medium">{v.priceLabel}</span> · {v.name}
                            {!v.isAvailable ? <span className="ml-1 text-destructive">(0 avail)</span> : <span className="ml-1 text-muted-foreground">({v.availableToSell})</span>}
                          </li>
                        ))}
                        {p.variants.length > 3 ? <li className="text-muted-foreground">+{p.variants.length - 3} more…</li> : null}
                      </ul>
                    </td>
                    <td className="p-3">
                      {p.isPublished ? (
                        <Badge variant="outline" className="border-success/40 bg-success/10 text-success">Published</Badge>
                      ) : (
                        <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">Unpublished</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {p.anyAvailable ? (
                        <Badge variant="secondary">In stock</Badge>
                      ) : (
                        <Badge variant="outline" className="border-warning/40 bg-warning/10 text-[color:var(--warning-foreground)]">No sellable stock</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Zero-availability products stay published in the catalogue but are hidden from storefront
        lists, search, recommendations and offers; saved links show a clear unavailable state.
      </p>
    </div>
  );
}
