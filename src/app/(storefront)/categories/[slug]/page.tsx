import Image from "next/image";
import Link from "next/link";
import { getCategories, getCategory, getCategoryProducts } from "@/services/server-data";
import { ProductTile } from "@/features/catalog/product-tile";
import { EmptyState } from "@/components/shared/states";
import { categoryImageFor } from "@/lib/product-image-map";
import { ArrowRight, Leaf } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface CategoryPageProps { params: Promise<{ slug: string }>; }

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  return { title: category ? category.name : "Category", description: category?.description ?? "Shop by category at Variety Groceries." };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category || !category.isActive) notFound();
  const entries = await getCategoryProducts(category.id);
  const siblings = (await getCategories()).filter((c) => c.id !== category.id);

  return (
    <div className="mx-auto max-w-[1500px] px-3 pb-10 sm:px-4">
      <section className="category-rich-hero relative mt-3 min-h-[230px] overflow-hidden rounded-2xl border bg-[#eff5e7] shadow-sm">
        <Image src={categoryImageFor(category.slug)} alt={`${category.name} category`} fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#f8f9ed] via-[#f8f9ed]/95 to-[#f8f9ed]/25" />
        <div className="relative z-10 max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
          <nav aria-label="Breadcrumb" className="text-xs font-semibold text-muted-foreground"><Link href="/" className="hover:underline">Home</Link><span aria-hidden> / </span><Link href="/categories" className="hover:underline">Categories</Link><span aria-hidden> / </span><span>{category.name}</span></nav>
          <p className="mt-4 flex items-center gap-2 text-xs font-bold text-primary"><Leaf className="size-4" /> Grocery department</p>
          <h1 className="mt-1 font-serif text-4xl font-black tracking-tight text-[color:var(--brand-green-deep)]">{category.name}</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/75">{category.description}</p>
          <p className="mt-3 text-xs font-bold text-primary">{entries.length} available {entries.length === 1 ? "item" : "items"} · sold-out products are hidden</p>
        </div>
      </section>

      <div className="mt-5">
        {entries.length === 0 ? (
          <EmptyState title="Nothing available here right now" description="Everything in this category is currently reserved or sold out. Try the full shop." action={{ label: "Browse all groceries", href: "/shop" }} />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{entries.map((p, i) => <ProductTile key={p.id} product={p} priority={i < 6} />)}</div>
        )}
      </div>

      <section className="mt-8 rounded-2xl border bg-white p-4 sm:p-5" aria-label="Explore other categories">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-serif text-lg font-bold">Explore more departments</h2><Link href="/categories" className="text-xs font-bold text-primary hover:underline">All categories <ArrowRight className="ml-1 inline size-3.5" /></Link></div>
        <div className="flex gap-2 overflow-x-auto pb-1">{siblings.map((c) => <Link key={c.id} href={`/categories/${c.slug}`} className="whitespace-nowrap rounded-full border px-3 py-2 text-xs font-bold hover:border-primary/40 hover:bg-primary/5">{c.name}</Link>)}</div>
      </section>
    </div>
  );
}
