import Image from "next/image";
import Link from "next/link";
import { getHomeData } from "@/services/server-data";
import { ProductTile } from "@/features/catalog/product-tile";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BadgePercent,
  Leaf,
  MapPin,
  ShieldCheck,
  Sparkles,
  Store,
  Tags,
  Truck,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import {
  categoryImageFor,
  storefrontHeroImage,
  storefrontPantryPromoImage,
  storefrontProducePromoImage,
} from "@/lib/product-image-map";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { categories, offers, popular, trendingNew, demoTrack } = await getHomeData();
  const featured = [...offers, ...popular, ...trendingNew]
    .filter((product, index, all) => all.findIndex((candidate) => candidate.id === product.id) === index)
    .slice(0, 8);
  const freshProduceCategory = categories.find((category) => category.slug === "fresh-produce");

  return (
    <div className="mx-auto max-w-[1500px] px-3 pb-10 sm:px-4">
      <section className="storefront-hero relative mt-3 min-h-[330px] overflow-hidden rounded-[26px] border bg-[#eef4e8] shadow-[0_16px_50px_rgba(6,64,43,0.10)] lg:min-h-[390px]" aria-labelledby="home-hero-title">
        <Image src={storefrontHeroImage} alt="Abundant fresh groceries ready for shopping" fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#f9fbee] via-[#f9fbee]/95 to-[#f9fbee]/10 lg:via-[#f9fbee]/72" />
        <div className="relative z-10 max-w-[720px] px-5 py-7 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-xs font-bold text-primary shadow-sm backdrop-blur"><Leaf className="size-3.5" /> Fresh selection · clear availability</span>
          <h1 id="home-hero-title" className="mt-4 max-w-[680px] font-serif text-[42px] font-black leading-[0.95] tracking-[-0.045em] text-[color:var(--brand-green-deep)] sm:text-6xl lg:text-[70px]">
            Fresh Groceries <span className="text-brand-amber">Delivered to Your Door</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-foreground/80 sm:text-base">
            Shop market-fresh produce, Ghanaian staples, dairy, drinks and household essentials. Choose delivery in configured Accra zones or collect in store — only sellable stock is offered.
          </p>
          <div className="mt-5 grid max-w-xl grid-cols-2 gap-2 text-[11px] font-bold sm:grid-cols-4">
            <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#e3eed1] text-primary"><Leaf className="size-4" /></span>Fresh &amp; premium</div>
            <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#e3eed1] text-primary"><Truck className="size-4" /></span>Delivery &amp; collection</div>
            <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#e3eed1] text-primary"><ShieldCheck className="size-4" /></span>Trusted workflow</div>
            <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#e3eed1] text-primary"><Tags className="size-4" /></span>Clear prices</div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button asChild size="lg" className="h-12 rounded-xl px-6 shadow-lg shadow-primary/15"><Link href="/shop">Shop fresh groceries <ArrowRight className="size-4" /></Link></Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-primary/25 bg-white/85 px-5"><Link href="/assistant"><Sparkles className="size-4 text-brand-amber" /> Ask shopping assistant</Link></Button>
          </div>
        </div>
        <div className="absolute right-5 top-5 hidden rotate-[-2deg] rounded-[28px_8px_28px_10px] bg-brand-amber/95 px-7 py-5 text-center shadow-xl lg:block">
          <p className="font-serif text-3xl font-black italic leading-none text-[color:var(--brand-green-deep)]">Fresh choices</p>
          <p className="mt-2 text-xs font-extrabold text-[color:var(--brand-green-deep)]">for brighter everyday living</p>
        </div>
      </section>

      <section className="mt-3" aria-labelledby="home-categories">
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          <div><h2 id="home-categories" className="font-serif text-2xl font-bold tracking-tight">Shop by category</h2><p className="text-xs text-muted-foreground">Browse useful grocery departments with current sellable stock.</p></div>
          <Link href="/categories" className="shrink-0 text-xs font-bold text-primary hover:underline">View categories <ArrowRight className="ml-1 inline size-3.5" /></Link>
        </div>
        <div className="category-image-grid grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
          {categories.slice(0, 10).map((c) => (
            <Link key={c.id} href={`/categories/${c.slug}`} className="group overflow-hidden rounded-xl border bg-white shadow-[0_4px_16px_rgba(0,0,0,.05)] transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="relative aspect-[1.55/1] overflow-hidden bg-muted"><Image src={categoryImageFor(c.slug)} alt={`${c.name} category`} fill sizes="(max-width:640px) 50vw, 180px" className="object-cover transition duration-300 group-hover:scale-105" /></div>
              <div className="flex items-center justify-between gap-1 px-2.5 py-2"><span className="truncate text-xs font-extrabold">{c.name}</span><ArrowRight className="size-3.5 shrink-0 text-primary" /></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="home-featured">
        <div className="mb-2 flex items-end justify-between gap-3 px-1"><div><h2 id="home-featured" className="font-serif text-2xl font-bold tracking-tight">Featured products</h2><p className="text-xs text-muted-foreground">A fuller preview of popular picks, current offers and fresh finds with current availability and pricing.</p></div><Link href="/shop" className="text-xs font-bold text-primary hover:underline">View all products <ArrowRight className="ml-1 inline size-3.5" /></Link></div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8">{featured.map((p, i) => <ProductTile key={p.id} product={p} priority={i < 2} />)}</div>
      </section>

      <section className="storefront-promo-grid mt-5 grid gap-3 lg:grid-cols-[1.7fr_1fr]" aria-label="Store promotions">
        <article className="relative min-h-[155px] overflow-hidden rounded-2xl bg-[color:var(--brand-green-deep)] p-6 text-white sm:p-7">
          <Image src={storefrontProducePromoImage} alt="Colourful basket of fresh produce" fill sizes="(max-width:1024px) 100vw, 65vw" className="object-cover object-right opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--brand-green-deep)] via-[color:var(--brand-green-deep)]/90 to-transparent" />
          <div className="relative max-w-md"><h2 className="font-serif text-3xl font-bold leading-none">Healthy choices for a <span className="text-brand-amber">brighter tomorrow</span></h2><p className="mt-2 text-xs leading-relaxed text-white/80">Fresh produce, pantry staples and household essentials — all connected to one stock-aware shopping flow.</p><Button asChild className="mt-4 h-9 bg-brand-amber text-[color:var(--brand-green-deep)] hover:bg-brand-amber/90"><Link href={freshProduceCategory ? `/shop?category=${encodeURIComponent(freshProduceCategory.id)}` : "/shop"}>Shop fresh produce <ArrowRight className="size-3.5" /></Link></Button></div>
        </article>
        <article className="relative min-h-[155px] overflow-hidden rounded-2xl bg-[#fff4d8] p-6 sm:p-7">
          <Image src={storefrontPantryPromoImage} alt="Pantry groceries and household essentials" fill sizes="(max-width:1024px) 100vw, 35vw" className="object-cover object-right opacity-65" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#fff4d8] via-[#fff4d8]/95 to-transparent" />
          <div className="relative max-w-[250px]"><h2 className="font-serif text-3xl font-bold leading-none text-[color:var(--brand-green-deep)]">Smart shopping assistance</h2><p className="mt-2 text-xs leading-relaxed text-foreground/70">Ask for ingredients or a budget basket and review available catalogue suggestions before buying.</p><Button asChild variant="outline" className="mt-4 h-9 border-primary/25 bg-white/80"><Link href="/assistant"><Sparkles className="size-3.5 text-brand-amber" /> Try assistant</Link></Button></div>
        </article>
      </section>

      <section className="mt-4 grid gap-2 rounded-2xl border bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4" aria-label="Why shop with Variety Groceries">
        <div className="flex items-center gap-3 p-2"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Leaf className="size-5" /></span><div><p className="text-sm font-bold">Fresh selection</p><p className="text-[11px] text-muted-foreground">Only available products are purchasable.</p></div></div>
        <div className="flex items-center gap-3 p-2"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Truck className="size-5" /></span><div><p className="text-sm font-bold">Flexible fulfilment</p><p className="text-[11px] text-muted-foreground">Configured delivery or store collection.</p></div></div>
        <div className="flex items-center gap-3 p-2"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="size-5" /></span><div><p className="text-sm font-bold">Controlled checkout</p><p className="text-[11px] text-muted-foreground">Availability and price revalidated at checkout.</p></div></div>
        <div className="flex items-center gap-3 p-2"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Store className="size-5" /></span><div><p className="text-sm font-bold">One stock model</p><p className="text-[11px] text-muted-foreground">Online and counter sales share inventory.</p></div></div>
      </section>

      <section aria-labelledby="home-demo" className="mt-6 grid gap-3 rounded-2xl border border-dashed bg-muted/35 p-4 sm:grid-cols-2">
        <div><h2 id="home-demo" className="text-sm font-bold">Prototype demo data</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Products, stock, prices and customer records in this environment are fictional fixtures. External payment and courier integrations are not represented as connected unless explicitly labelled.</p></div>
        <div className="rounded-xl bg-white p-3"><p className="flex items-center gap-2 text-xs font-bold"><MapPin className="size-4 text-primary" /> Tracking a demo order?</p>{demoTrack ? <p className="mt-1 text-xs text-muted-foreground">Try reference <code className="rounded bg-muted px-1 py-0.5 font-mono">{demoTrack.reference}</code> with code <code className="rounded bg-muted px-1 py-0.5 font-mono">{demoTrack.verificationCode}</code> · last updated {formatDateTime(demoTrack.lastUpdatedAt)} UTC.</p> : <p className="mt-1 text-xs text-muted-foreground">Use the order reference and verification code supplied at checkout.</p>}<Link href="/track" className="mt-2 inline-flex items-center text-xs font-bold text-primary hover:underline">Track an order <ArrowRight className="ml-1 size-3.5" /></Link></div>
      </section>
    </div>
  );
}
