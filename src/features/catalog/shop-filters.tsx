"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";

export interface ShopFilterCategory {
  id: string;
  slug: string;
  name: string;
  count: number;
}

/** One desktop row of filters; wraps naturally on mobile. Preserves state via the URL. */
export function ShopFilters({
  categories,
  total,
}: {
  categories: ShopFilterCategory[];
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const query = params.get("query") ?? "";
  const rawCategory = params.get("category") ?? "";
  const category = categories.find((c) => c.slug === rawCategory || c.id === rawCategory)?.slug ?? "all";
  const sort = params.get("sort") ?? "popular";

  const nextHref = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === "all") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    return `/shop${next.toString() ? `?${next}` : ""}`;
  };

  const update = (patch: Record<string, string>) => {
    startTransition(() => router.push(nextHref(patch), { scroll: false }));
  };

  return (
    <div className="space-y-3" data-pending={pending ? "true" : "false"}>
      <div className="flex flex-wrap items-center gap-2">
      <form
        role="search"
        className="relative min-w-0 flex-1 sm:min-w-52"
        onSubmit={(e) => {
          e.preventDefault();
          const value = (e.currentTarget.elements.namedItem("shop-q") as HTMLInputElement).value;
          update({ query: value.trim() });
        }}
      >
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          name="shop-q"
          type="search"
          defaultValue={query}
          placeholder="Search available groceries…"
          className="h-11 pl-9"
          aria-label="Search groceries"
          key={query}
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 size-9 -translate-y-1/2"
            aria-label="Clear search"
            onClick={() => update({ query: "" })}
          >
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </form>

      <Select value={category} onValueChange={(v) => update({ category: v })} aria-label="Filter by category">
        <SelectTrigger className="h-11 w-full sm:w-52">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.slug}>
              {c.name} ({c.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={(v) => update({ sort: v })} aria-label="Sort products">
        <SelectTrigger className="h-11 w-full sm:w-44">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="popular">Most popular</SelectItem>
          <SelectItem value="price-asc">Price: low to high</SelectItem>
          <SelectItem value="price-desc">Price: high to low</SelectItem>
          <SelectItem value="name">Name A–Z</SelectItem>
        </SelectContent>
      </Select>

      <p className="ml-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {total} available {total === 1 ? "item" : "items"}
      </p>
      </div>

      <nav id="category-filter-chips" className="flex gap-2 overflow-x-auto pb-1" aria-label="Quick category filters">
        {[{ slug: "all", name: "All groceries", count: total }, ...categories].map((c) => {
          const active = category === c.slug;
          return (
            <Link
              key={c.slug}
              href={nextHref({ category: c.slug })}
              aria-current={active ? "page" : undefined}
              className={active
                ? "whitespace-nowrap rounded-full border border-primary bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                : "whitespace-nowrap rounded-full border bg-white px-3 py-2 text-xs font-bold text-foreground transition hover:border-primary/35 hover:bg-primary/5"}
            >
              {c.name}{c.slug === "all" ? "" : ` (${c.count})`}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
