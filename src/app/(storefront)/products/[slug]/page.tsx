import Link from "next/link";
import Image from "next/image";
import { getStore } from "@/services/mock/store";
import { catalogEntry } from "@/services/mock/router";
import { isProductPurchasable, sweepExpiredReservations } from "@/services/mock/engine/availability";
import { ProductPurchasePanel } from "@/features/catalog/product-purchase-panel";
import { ProductTile } from "@/features/catalog/product-tile";
import { Badge } from "@/components/ui/badge";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const store = getStore();
  const product = store.products.find((p) => p.slug === slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.name,
    description: product.shortDescription,
    openGraph: { title: product.name, description: product.shortDescription },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const store = getStore();
  sweepExpiredReservations(store);
  const product = store.products.find((p) => p.slug === slug && p.isPublished);
  if (!product) notFound();

  const entry = catalogEntry(store, product.id);
  const purchasable = isProductPurchasable(store, product.id);
  const related = store.products
    .filter((p) => p.categoryId === product.categoryId && p.id !== product.id && isProductPurchasable(store, p.id))
    .slice(0, 4)
    .map((p) => catalogEntry(store, p.id));

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10">
      <div className="mt-4">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline focus-visible:underline">Home</Link>
          <span aria-hidden> / </span>
          <Link href="/shop" className="hover:underline focus-visible:underline">Shop</Link>
          <span aria-hidden> / </span>
          <Link href={`/categories/${entry.categorySlug}`} className="hover:underline focus-visible:underline">
            {entry.categoryName}
          </Link>
          <span aria-hidden> / </span> <span aria-current="page">{product.name}</span>
        </nav>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,44%)_minmax(0,56%)] lg:gap-10">
        <div className="space-y-3">
          <div className="relative aspect-[5/4] overflow-hidden rounded-2xl border bg-muted">
            <Image
              src={entry.image}
              alt={`${product.name} product tile`}
              fill
              sizes="(max-width: 1024px) 100vw, 560px"
              className="object-cover"
              priority
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Representative product art (demo). Real photography replaces these tiles when the owner
            supplies images.
          </p>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {entry.categoryName ? <Badge variant="secondary">{entry.categoryName}</Badge> : null}
              {purchasable ? (
                <Badge className="border-success/40 bg-success/10 text-success">In stock</Badge>
              ) : (
                <Badge variant="outline">Unavailable</Badge>
              )}
              {entry.variants.some((v) => v.compareAtPriceMinor) ? (
                <Badge className="border-brand-amber/40 bg-brand-amber/15 text-[color:var(--warning-foreground)]">Offer</Badge>
              ) : null}
            </div>
            <h1 className="font-serif text-2xl font-bold sm:text-3xl">{product.name}</h1>
            <p className="text-[15px] text-muted-foreground">{product.shortDescription}</p>
          </div>

          <ProductPurchasePanel product={entry} />

          <div className="space-y-2 rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">About this item</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
            <p className="text-xs text-muted-foreground">
              We do not publish ingredient or allergen claims — always check the physical product
              label.
            </p>
          </div>

          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li className="rounded-lg bg-muted/60 p-3">Delivery slots across Accra zones</li>
            <li className="rounded-lg bg-muted/60 p-3">Collect in store and pay at the counter</li>
            <li className="rounded-lg bg-muted/60 p-3">Guest checkout — account optional</li>
            <li className="rounded-lg bg-muted/60 p-3">Easy returns with refund tracking</li>
          </ul>
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="mt-10">
          <h2 id="related-heading" className="font-serif text-xl font-bold">
            More in {entry.categoryName}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((p) => (
              <ProductTile key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
