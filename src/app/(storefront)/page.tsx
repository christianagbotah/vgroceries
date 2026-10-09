import Link from "next/link";
import { getStore } from "@/services/mock/store";
import { catalogEntry } from "@/services/mock/router";
import { isProductPurchasable } from "@/services/mock/engine/availability";
import { ProductTile } from "@/features/catalog/product-tile";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BadgePercent, Leaf, MapPin, Store, Truck } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Server-rendered homepage: shop first — compact, useful, no oversized hero. */
export default function HomePage() {
  const store = getStore();

  const categories = store.categories
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      ...c,
      count: store.products.filter((p) => p.categoryId === c.id && isProductPurchasable(store, p.id)).length,
    }));

  // offers: variants with compare-at price that are available
  const offerProducts = store.products
    .filter((p) => p.isPublished)
    .filter((p) => p.variants.some((vid) => store.variants.find((v) => v.id === vid)?.compareAtPriceMinor && isProductPurchasable(store, p.id)))
    .slice(0, 4)
    .map((p) => catalogEntry(store, p.id));

  // popular by order history
  const salesCount = new Map<string, number>();
  for (const o of store.orders) {
    if (o.fulfilmentStatus === "cancelled") continue;
    for (const lid of o.lines) {
      const l = store.orderLines.find((x) => x.id === lid);
      if (l) salesCount.set(l.productId, (salesCount.get(l.productId) ?? 0) + Number(l.quantity));
    }
  }
  const popular = [...salesCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pid]) => store.products.find((p) => p.id === pid))
    .filter((p): p is NonNullable<typeof p> => !!p && isProductPurchasable(store, p.id))
    .slice(0, 8)
    .map((p) => catalogEntry(store, p.id));

  const trendingNew = store.products
    .filter((p) => p.isPublished && isProductPurchasable(store, p.id) && !salesCount.has(p.id))
    .slice(0, 4)
    .map((p) => catalogEntry(store, p.id));

  const order = store.orders.find((o) => o.reference === "VG-8Q2M1A");

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10">
      {/* compact intro band — shopping starts on the first screen */}
      <section aria-labelledby="home-intro" className="mt-4 grid gap-3 rounded-2xl border bg-card p-4 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-2xl space-y-2">
          <h1 id="home-intro" className="font-serif text-2xl font-bold leading-tight sm:text-3xl">
            Fresh groceries for everyday Ghanaian cooking
          </h1>
          <p className="text-[15px] text-muted-foreground">
            Shop market-fresh produce, grains, oils and home essentials with clear prices. Choose
            delivery across Accra or collect in store — you only ever see what is actually available
            to buy today.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button asChild size="lg" className="h-12 px-6">
              <Link href="/shop">
                Start shopping <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12">
              <Link href="/shop?category=cat_fp">Browse fresh produce</Link>
            </Button>
          </div>
        </div>
        <ul className="grid gap-2 text-sm sm:grid-cols-3 lg:w-[340px]">
          <li className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
            <Truck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>Delivery slots across Accra zones</span>
          </li>
          <li className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
            <Store className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>Collect in store, pay at the counter</span>
          </li>
          <li className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
            <Leaf className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>Only available stock is shown</span>
          </li>
        </ul>
      </section>

      {/* categories */}
      <section aria-labelledby="home-cats" className="mt-8">
        <div className="flex items-end justify-between gap-2">
          <h2 id="home-cats" className="font-serif text-xl font-bold">Shop by category</h2>
          <Link href="/shop" className="text-sm font-medium text-primary hover:underline focus-visible:underline">
            View all groceries
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/categories/${c.slug}`}
              className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-3 text-sm font-medium hover:border-primary/50 hover:bg-accent"
            >
              <span className="truncate">{c.name}</span>
              <Badge variant="secondary" className="shrink-0 tabular-nums">{c.count}</Badge>
            </Link>
          ))}
        </div>
      </section>

      {/* offers */}
      {offerProducts.length > 0 ? (
        <section aria-labelledby="home-offers" className="mt-8">
          <div className="flex items-center gap-2">
            <BadgePercent className="size-5 text-brand-amber" aria-hidden />
            <h2 id="home-offers" className="font-serif text-xl font-bold">This week&apos;s offers</h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {offerProducts.map((p, i) => (
              <ProductTile key={p.id} product={p} priority={i < 2} />
            ))}
          </div>
        </section>
      ) : null}

      {/* popular */}
      <section aria-labelledby="home-popular" className="mt-8">
        <h2 id="home-popular" className="font-serif text-xl font-bold">Popular right now</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {popular.map((p) => (
            <ProductTile key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* fresh finds */}
      {trendingNew.length > 0 ? (
        <section aria-labelledby="home-fresh" className="mt-8">
          <h2 id="home-fresh" className="font-serif text-xl font-bold">Fresh finds</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {trendingNew.map((p) => (
              <ProductTile key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}

      {/* demo note + track order helper */}
      <section aria-labelledby="home-demo" className="mt-10 grid gap-3 rounded-2xl border border-dashed bg-muted/40 p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <h2 id="home-demo" className="text-sm font-semibold">Prototype demo data</h2>
          <p className="text-sm text-muted-foreground">
            All products, prices and stock on this storefront are fictional demo fixtures for the
            varietygrocery.com prototype. Payment providers are not connected; no real payments are
            taken.
          </p>
        </div>
        <div className="flex flex-col justify-center gap-2 rounded-xl bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="size-4 text-primary" aria-hidden /> Tracking a demo order?
          </p>
          {order ? (
            <p className="text-sm text-muted-foreground">
              Try reference <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{order.reference}</code> with
              code <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{order.verificationCode}</code> —
              last updated {formatDateTime(order.events[order.events.length - 1].at)} UTC.{" "}
              {order.paymentStatus === "partially_refunded" ? `Includes a ${formatMoney(4000)} partial refund demo.` : null}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Use your order reference and code from checkout.</p>
          )}
          <div>
            <Button asChild variant="outline" size="sm" className="h-10">
              <Link href="/track">Track an order</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
