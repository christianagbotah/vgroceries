import Link from "next/link";
import type { Metadata } from "next";
import { getCategories, getCategoryProducts } from "@/services/server-data";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/states";
import { ArrowRight, ShoppingBasket } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All categories",
  description: "Browse every grocery category at Variety Groceries — fresh produce, grains, proteins, household essentials and more.",
};

/** Browse-all categories index — closes the /categories 404 gap. */
export default async function CategoriesIndexPage() {
  const categories = await getCategories();
  const withCounts = await Promise.all(
    categories.map(async (c) => ({ category: c, products: await getCategoryProducts(c.id) }))
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10">
      <div className="mt-4 space-y-2">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline focus-visible:underline">Home</Link>
          <span aria-hidden> / </span> <span>Categories</span>
        </nav>
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">Shop by category</h1>
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          Every aisle of the store, from market-fresh produce to household essentials. Counts show
          items available to buy today.
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={ShoppingBasket} title="No categories yet" description="Categories appear here once the catalogue is populated." />
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {withCounts.map(({ category, products }) => (
            <li key={category.id}>
              <Link
                href={`/categories/${category.slug}`}
                className="group flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md focus-visible:outline-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-serif text-lg font-bold group-hover:underline">{category.name}</h2>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {products.length} available
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{category.description}</p>
                <p className="mt-auto flex items-center gap-1.5 pt-2 text-sm font-medium text-primary">
                  Shop {category.name.toLowerCase()}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
