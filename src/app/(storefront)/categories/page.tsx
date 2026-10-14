import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getCategories, getCategoryProducts } from "@/services/server-data";
import { EmptyState } from "@/components/shared/states";
import { ArrowRight, ShoppingBasket } from "lucide-react";
import { categoryImageFor } from "@/lib/product-image-map";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All categories",
  description: "Browse every grocery category at Variety Groceries — fresh produce, grains, proteins, household essentials and more.",
};

export default async function CategoriesIndexPage() {
  const categories = await getCategories();
  const withCounts = await Promise.all(categories.map(async (c) => ({ category: c, products: await getCategoryProducts(c.id) })));

  return (
    <div className="mx-auto max-w-[1500px] px-3 pb-10 sm:px-4">
      <div className="mt-4 rounded-2xl border bg-gradient-to-r from-[#eef5e5] to-[#fff7df] px-5 py-6 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-xs font-semibold text-muted-foreground"><Link href="/" className="hover:underline">Home</Link><span aria-hidden> / </span><span>Categories</span></nav>
        <h1 className="mt-2 font-serif text-3xl font-black tracking-tight text-[color:var(--brand-green-deep)] sm:text-4xl">Shop by category</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/70">Explore the store visually — from market-fresh produce and Ghanaian staples to dairy, drinks, household care and family essentials.</p>
      </div>

      {categories.length === 0 ? (
        <div className="mt-6"><EmptyState icon={ShoppingBasket} title="No categories yet" description="Categories appear here once the catalogue is populated." /></div>
      ) : (
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {withCounts.map(({ category, products }) => (
            <li key={category.id}>
              <Link href={`/categories/${category.slug}`} className="category-photo-card group flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_5px_18px_rgba(0,0,0,.045)] transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2">
                <div className="relative aspect-[1.55/1] overflow-hidden bg-muted"><Image src={categoryImageFor(category.slug)} alt={`${category.name} grocery category`} fill sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 300px" className="object-cover transition duration-300 group-hover:scale-105" /></div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3"><h2 className="font-serif text-lg font-bold group-hover:text-primary">{category.name}</h2><span className="rounded-full bg-primary/8 px-2 py-1 text-[10px] font-extrabold text-primary">{products.length} available</span></div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{category.description}</p>
                  <p className="mt-4 flex items-center gap-1.5 text-xs font-bold text-primary">Shop {category.name.toLowerCase()} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
