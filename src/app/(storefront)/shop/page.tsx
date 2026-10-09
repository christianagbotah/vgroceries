import Link from "next/link";
import { getCategories, getShopData } from "@/services/server-data";
import { ProductTile } from "@/features/catalog/product-tile";
import { ShopFilters } from "@/features/catalog/shop-filters";
import { EmptyState, NoResults } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { PaginationNav } from "@/components/shared/pagination";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop groceries",
  description: "Browse every available grocery at Variety Groceries — fresh produce, grains, oils, dairy, beverages and household essentials in Ghana.",
};

interface ShopPageProps {
  searchParams: Promise<{ query?: string; category?: string; sort?: string; page?: string }>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const sp = await searchParams;

  const search = (sp.query ?? "").toLowerCase().trim();
  const category = sp.category ?? "";
  const sort = sp.sort ?? "popular";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const perPage = 12;

  // the service applies availability rules, search, filter, sort and pagination
  const categories = await getCategories();
  const result = await getShopData({ query: search, category, sort, page, perPage });
  const entries = result.items;
  const total = result.total;
  const pages = result.pages;

  const buildHref = (nextPage: number) => {
    const qs = new URLSearchParams();
    if (search) qs.set("query", search);
    if (category) qs.set("category", category);
    if (sort !== "popular") qs.set("sort", sort);
    if (nextPage > 1) qs.set("page", String(nextPage));
    return `/shop${qs.toString() ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10">
      <div className="mt-4 space-y-2">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline focus-visible:underline">Home</Link>
          <span aria-hidden> / </span> <span>Shop</span>
        </nav>
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">All groceries</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Every item below is available to buy right now. Sold-out goods are hidden until stock
          returns — browse with confidence.
        </p>
      </div>

      <div className="sticky top-[104px] z-20 -mx-4 mt-4 border-y bg-background/95 px-4 py-3 backdrop-blur lg:top-[128px]">
        <ShopFilters categories={categories} total={total} />
      </div>

      <div className="mt-5">
        {entries.length === 0 ? (
          search ? (
            <NoResults query={search} />
          ) : category ? (
            <EmptyState
              title="Nothing available in this category yet"
              description="Stock is currently reserved or sold out. Check back soon or browse other categories."
              action={{ label: "Browse all groceries", href: "/shop" }}
            />
          ) : (
            <EmptyState title="No products available" description="Stock will appear once goods are received." />
          )
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {entries.map((p, i) => (
                <ProductTile key={p.id} product={p} priority={i < 4} />
              ))}
            </div>
            {pages > 1 ? (
              <div className="mt-6 flex justify-center">
                <PaginationNav page={page} pages={pages} buildHref={buildHref} />
              </div>
            ) : null}
          </>
        )}
      </div>

      {category ? (
        <Button asChild variant="ghost" size="sm" className="mt-6 h-10">
          <Link href="/shop">Clear category filter</Link>
        </Button>
      ) : null}
    </div>
  );
}
