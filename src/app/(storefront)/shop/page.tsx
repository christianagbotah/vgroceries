import Image from "next/image";
import Link from "next/link";
import { getCategories, getShopData } from "@/services/server-data";
import { ProductTile } from "@/features/catalog/product-tile";
import { ShopFilters } from "@/features/catalog/shop-filters";
import { EmptyState, NoResults } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { PaginationNav } from "@/components/shared/pagination";
import { AdSenseSlot } from "@/components/ads/adsense-slot";
import { storefrontPantryPromoImage } from "@/lib/product-image-map";
import { ArrowRight, Leaf, ShoppingBasket } from "lucide-react";
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
  const perPage = 18;
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
    <div className="mx-auto max-w-[1500px] px-3 pb-10 sm:px-4">
      <section className="shop-rich-header relative mt-3 overflow-hidden rounded-2xl border bg-[#eff5e7] shadow-sm">
        <Image src={storefrontPantryPromoImage} alt="Grocery pantry selection" fill sizes="100vw" className="object-cover object-right opacity-65" priority />
        <div className="absolute inset-0 bg-gradient-to-r from-[#f8f9ec] via-[#f8f9ec]/95 to-[#f8f9ec]/25" />
        <div className="relative z-10 max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
          <nav aria-label="Breadcrumb" className="text-xs font-semibold text-muted-foreground"><Link href="/" className="hover:underline">Home</Link><span aria-hidden> / </span><span>Shop</span></nav>
          <div className="mt-2 flex items-center gap-2 text-xs font-bold text-primary"><Leaf className="size-4" /> Available catalogue</div>
          <h1 className="mt-1 font-serif text-3xl font-black tracking-tight text-[color:var(--brand-green-deep)] sm:text-4xl">All groceries</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/75">Browse fresh produce, staples, drinks, household care and more. Sold-out goods stay out of purchasable lists until stock returns.</p>
          <div className="mt-3 flex items-center gap-2 text-xs font-bold"><ShoppingBasket className="size-4 text-brand-amber" /><span>{total} available {total === 1 ? "product" : "products"}</span></div>
        </div>
      </section>

      <div className="mt-3 rounded-2xl border bg-white p-3 shadow-sm sm:p-4"><ShopFilters categories={categories} total={total} /></div>

      <AdSenseSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SHOP_TOP_SLOT} className="mt-4" />

      <div className="mt-4">
        {entries.length === 0 ? (
          search ? <NoResults query={search} /> : category ? (
            <EmptyState title="Nothing available in this category yet" description="Stock is currently reserved or sold out. Check back soon or browse other categories." action={{ label: "Browse all groceries", href: "/shop" }} />
          ) : <EmptyState title="No products available" description="Stock will appear once goods are received." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {entries.map((p, i) => <ProductTile key={p.id} product={p} priority={i < 6} />)}
            </div>
            {pages > 1 ? <div className="mt-7 flex justify-center"><PaginationNav page={page} pages={pages} buildHref={buildHref} /></div> : null}
          </>
        )}
      </div>

      {category ? <Button asChild variant="ghost" size="sm" className="mt-6 h-10"><Link href="/shop">Clear category filter <ArrowRight className="size-3.5" /></Link></Button> : null}
    </div>
  );
}
