"use client";

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
  const category = params.get("category") ?? "all";
  const sort = params.get("sort") ?? "popular";

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === "all") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page"); // new filter set → back to page 1
    startTransition(() => router.push(`/shop${next.toString() ? `?${next}` : ""}`, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={pending ? "true" : "false"}>
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
            <SelectItem key={c.id} value={c.id}>
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
  );
}
