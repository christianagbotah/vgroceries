import Image from "next/image";
import Link from "next/link";
import { getProductData } from "@/services/server-data";
import { ProductPurchasePanel } from "@/features/catalog/product-purchase-panel";
import { ProductTile } from "@/features/catalog/product-tile";
import { Badge } from "@/components/ui/badge";
import { Heart, Leaf, RotateCcw, ShieldCheck, Store, Truck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface ProductPageProps { params: Promise<{ slug: string }>; }

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProductData(slug);
  if (!data) return { title: "Product not found" };
  return { title: data.product.name, description: data.product.shortDescription, openGraph: { title: data.product.name, description: data.product.shortDescription } };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const data = await getProductData(slug);
  if (!data) notFound();
  const { product: entry, related, purchasable } = data;

  return (
    <div className="mx-auto max-w-[1500px] px-3 pb-10 sm:px-4">
      <nav aria-label="Breadcrumb" className="mt-4 text-xs font-semibold text-muted-foreground"><Link href="/" className="hover:underline">Home</Link><span aria-hidden> / </span><Link href="/shop" className="hover:underline">Shop</Link><span aria-hidden> / </span><Link href={`/categories/${entry.categorySlug}`} className="hover:underline">{entry.categoryName}</Link><span aria-hidden> / </span><span aria-current="page">{entry.name}</span></nav>

      <section className="mt-3 grid gap-5 rounded-2xl border bg-white p-3 shadow-[0_8px_30px_rgba(5,70,48,.06)] sm:p-5 lg:grid-cols-[minmax(0,48%)_minmax(0,52%)] lg:gap-8 lg:p-7">
        <div className="space-y-3">
          <div className="product-detail-photo relative aspect-[1.12/1] overflow-hidden rounded-2xl bg-[#f7f8f2]">
            <Image src={entry.image} alt={`${entry.name} grocery product photo`} fill sizes="(max-width:1024px) 100vw, 650px" className="object-cover" priority />
            <div className="absolute left-3 top-3 flex flex-wrap gap-2">{entry.variants.some((v) => v.compareAtPriceMinor) ? <span className="rounded-full bg-brand-amber px-3 py-1 text-[11px] font-black text-[color:var(--brand-green-deep)] shadow">Offer</span> : null}<span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-primary shadow-sm backdrop-blur">Demo catalogue</span></div>
            <Link href="/account/lists" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-white/90 text-primary shadow-sm backdrop-blur hover:bg-white" aria-label={`Add ${entry.name} to wishlist`}><Heart className="size-5" /></Link>
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Demo catalogue photography is representative. The production media workflow will store approved featured and gallery images per product.</p>
        </div>

        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">{entry.categoryName ? <Badge variant="secondary" className="rounded-full">{entry.categoryName}</Badge> : null}{purchasable ? <Badge className="rounded-full border-success/30 bg-success/10 text-success">In stock</Badge> : <Badge variant="outline">Unavailable</Badge>}</div>
          <h1 className="mt-3 font-serif text-3xl font-black tracking-tight text-[color:var(--brand-green-deep)] sm:text-4xl lg:text-5xl">{entry.name}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{entry.shortDescription}</p>

          <div className="mt-5 rounded-2xl border border-primary/10 bg-[#fbfcf8] p-4 sm:p-5"><ProductPurchasePanel product={entry} /></div>

          <div className="mt-5 rounded-2xl border bg-white p-4"><h2 className="flex items-center gap-2 text-sm font-bold"><Leaf className="size-4 text-primary" /> About this item</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{entry.description}</p><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Ingredient and allergen suitability is not inferred by the demo. Always verify the physical label where applicable.</p></div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            <div className="rounded-xl bg-primary/5 p-3"><Truck className="mb-2 size-4 text-primary" /><strong className="block text-foreground">Delivery</strong><span className="text-muted-foreground">Configured Accra zones</span></div>
            <div className="rounded-xl bg-primary/5 p-3"><Store className="mb-2 size-4 text-primary" /><strong className="block text-foreground">Collection</strong><span className="text-muted-foreground">Store pickup option</span></div>
            <div className="rounded-xl bg-primary/5 p-3"><ShieldCheck className="mb-2 size-4 text-primary" /><strong className="block text-foreground">Stock check</strong><span className="text-muted-foreground">Revalidated at checkout</span></div>
            <div className="rounded-xl bg-primary/5 p-3"><RotateCcw className="mb-2 size-4 text-primary" /><strong className="block text-foreground">Returns</strong><span className="text-muted-foreground">Tracked workflow</span></div>
          </div>
        </div>
      </section>

      {related.length > 0 ? <section aria-labelledby="related-heading" className="mt-8"><div className="mb-3 flex items-end justify-between"><div><h2 id="related-heading" className="font-serif text-2xl font-bold">More in {entry.categoryName}</h2><p className="text-xs text-muted-foreground">Other available products from the same department.</p></div><Link href={`/categories/${entry.categorySlug}`} className="text-xs font-bold text-primary hover:underline">View category →</Link></div><div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{related.map((p) => <ProductTile key={p.id} product={p} />)}</div></section> : null}
    </div>
  );
}
