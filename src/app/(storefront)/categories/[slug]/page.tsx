import Link from "next/link";
import { getCategories, getCategory, getCategoryProducts } from "@/services/server-data";
import { ProductTile } from "@/features/catalog/product-tile";
import { EmptyState } from "@/components/shared/states";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  return {
    title: category ? category.name : "Category",
    description: category?.description ?? "Shop by category at Variety Groceries.",
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category || !category.isActive) notFound();

  // only purchasable items, sorted by name — the service applies the rules
  const entries = await getCategoryProducts(category.id);
  const siblings = (await getCategories()).filter((c) => c.id !== category.id);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10">
      <div className="mt-4 space-y-2">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline focus-visible:underline">Home</Link>
          <span aria-hidden> / </span>
          <Link href="/shop" className="hover:underline focus-visible:underline">Shop</Link>
          <span aria-hidden> / </span> <span>{category.name}</span>
        </nav>
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">{category.name}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{category.description}</p>
        <p className="text-sm text-muted-foreground">
          {entries.length} available {entries.length === 1 ? "item" : "items"} — sold-out goods are hidden.
        </p>
      </div>

      <div className="mt-5">
        {entries.length === 0 ? (
          <EmptyState
            title="Nothing available here right now"
            description="Everything in this category is currently reserved or sold out. Try the full shop."
            action={{ label: "Browse all groceries", href: "/shop" }}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {entries.map((p, i) => (
              <ProductTile key={p.id} product={p} priority={i < 4} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {siblings.map((c) => (
          <Link
            key={c.id}
            href={`/categories/${c.slug}`}
            className="rounded-full border px-3 py-1.5 text-sm hover:border-primary/50 hover:bg-accent"
          >
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
