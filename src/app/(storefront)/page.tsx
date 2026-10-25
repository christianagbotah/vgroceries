import Image from "next/image";
import Link from "next/link";
import { getHomeData, getShopData } from "@/services/server-data";
import type { CatalogProduct } from "@/services/contracts";
import { ProductTile } from "@/features/catalog/product-tile";
import { AdSenseSlot } from "@/components/ads/adsense-slot";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BadgePercent,
  CheckCircle2,
  Leaf,
  MapPin,
  Package,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Store,
  Tags,
  Truck,
  UserRound,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import {
  categoryImageFor,
  storefrontHeroImage,
  storefrontPantryPromoImage,
  storefrontProducePromoImage,
} from "@/lib/product-image-map";

export const dynamic = "force-dynamic";

function unique(products: CatalogProduct[]) {
  return products.filter((product, index, all) => all.findIndex((candidate) => candidate.id === product.id) === index);
}

function inCategories(products: CatalogProduct[], slugs: string[], limit = 8) {
  const wanted = new Set(slugs);
  return products.filter((product) => product.categorySlug && wanted.has(product.categorySlug)).slice(0, limit);
}

function ProductSection({
  id,
  eyebrow,
  title,
  copy,
  products,
  href = "/shop",
  linkLabel = "View all",
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  copy: string;
  products: CatalogProduct[];
  href?: string;
  linkLabel?: string;
}) {
  if (!products.length) return null;
  return (
    <section id={id} className="mt-8" aria-label={title}>
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <div>
          {eyebrow ? <p className="mb-1 text-[11px] font-black uppercase tracking-[0.16em] text-primary">{eyebrow}</p> : null}
          <h2 className="font-serif text-2xl font-black tracking-tight text-[color:var(--brand-green-deep)] sm:text-3xl">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">{copy}</p>
        </div>
        <Link href={href} className="hidden shrink-0 items-center text-xs font-bold text-primary hover:underline sm:inline-flex">{linkLabel} <ArrowRight className="ml-1 size-3.5" /></Link>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {products.map((product, index) => <ProductTile key={product.id} product={product} priority={index < 2} />)}
      </div>
      <Link href={href} className="mt-3 inline-flex items-center text-xs font-bold text-primary hover:underline sm:hidden">{linkLabel} <ArrowRight className="ml-1 size-3.5" /></Link>
    </section>
  );
}

export default async function HomePage() {
  const [{ categories, offers, popular, trendingNew, demoTrack }, catalogue] = await Promise.all([
    getHomeData(),
    getShopData({ sort: "name", page: 1, perPage: 48 }),
  ]);

  const allProducts = catalogue.items;
  const valuePicks = unique([
    ...offers,
    ...allProducts.filter((product) => product.variants.some((variant) => Boolean(variant.compareAtPriceMinor))),
    ...popular,
    ...trendingNew,
    ...allProducts,
  ]).slice(0, 8);
  const freshMarket = inCategories(allProducts, ["fresh-produce", "meat-fish"], 8);
  const pantry = inCategories(allProducts, ["grains-staples", "oils-sauces"], 8);
  const freshArrivals = unique([...trendingNew, ...allProducts]).slice(0, 8);
  const familyFavourites = inCategories(allProducts, ["beverages", "snacks", "dairy-eggs", "baby-family"], 8);
  const homeCare = inCategories(allProducts, ["household", "personal-care"], 8);
  const freshProduceCategory = categories.find((category) => category.slug === "fresh-produce");

  return (
    <div className="mx-auto max-w-[1500px] px-3 pb-12 sm:px-4">
      <section className="storefront-hero relative mt-3 min-h-[350px] overflow-hidden rounded-[26px] border bg-[#eef4e8] shadow-[0_16px_50px_rgba(6,64,43,0.10)] lg:min-h-[420px]" aria-labelledby="home-hero-title">
        <Image src={storefrontHeroImage} alt="Abundant fresh groceries ready for shopping" fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#f9fbee] via-[#f9fbee]/95 to-[#f9fbee]/10 lg:via-[#f9fbee]/72" />
        <div className="relative z-10 max-w-[760px] px-5 py-8 sm:px-10 sm:py-11 lg:px-12 lg:py-14">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-xs font-bold text-primary shadow-sm backdrop-blur"><Leaf className="size-3.5" /> Fresh selection · live availability</span>
          <h1 id="home-hero-title" className="mt-4 max-w-[700px] font-serif text-[42px] font-black leading-[0.95] tracking-[-0.045em] text-[color:var(--brand-green-deep)] sm:text-6xl lg:text-[70px]">
            Fresh Groceries <span className="text-brand-amber">Delivered to Your Door</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-foreground/80 sm:text-base">
            Shop fresh produce, Ghanaian staples, proteins, dairy, drinks and household essentials in one stock-aware store. Choose configured delivery or collection and follow your order from checkout to handover.
          </p>
          <div className="mt-5 grid max-w-2xl grid-cols-2 gap-2 text-[11px] font-bold sm:grid-cols-4">
            <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#e3eed1] text-primary"><Leaf className="size-4" /></span>Fresh everyday picks</div>
            <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#e3eed1] text-primary"><Truck className="size-4" /></span>Delivery &amp; collection</div>
            <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#e3eed1] text-primary"><ShieldCheck className="size-4" /></span>Stock-aware checkout</div>
            <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#e3eed1] text-primary"><Tags className="size-4" /></span>Prices in Ghana cedis</div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button asChild size="lg" className="h-12 rounded-xl px-6 shadow-lg shadow-primary/15"><Link href="/shop">Start shopping <ArrowRight className="size-4" /></Link></Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-primary/25 bg-white/85 px-5"><Link href="/assistant"><Sparkles className="size-4 text-brand-amber" /> Ask shopping assistant</Link></Button>
          </div>
        </div>
        <div className="absolute right-5 top-5 hidden rotate-[-2deg] rounded-[28px_8px_28px_10px] bg-brand-amber/95 px-7 py-5 text-center shadow-xl lg:block">
          <p className="font-serif text-3xl font-black italic leading-none text-[color:var(--brand-green-deep)]">Fresh choices</p>
          <p className="mt-2 text-xs font-extrabold text-[color:var(--brand-green-deep)]">for brighter everyday living</p>
        </div>
      </section>

      <section className="mt-4" aria-labelledby="home-categories">
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div><h2 id="home-categories" className="font-serif text-2xl font-black tracking-tight">Shop by category</h2><p className="text-xs text-muted-foreground">Jump directly into the department you need.</p></div>
          <Link href="/categories" className="shrink-0 text-xs font-bold text-primary hover:underline">All categories <ArrowRight className="ml-1 inline size-3.5" /></Link>
        </div>
        <div className="category-image-grid grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
          {categories.slice(0, 10).map((category) => (
            <Link key={category.id} href={`/shop?category=${encodeURIComponent(category.slug)}`} className="group overflow-hidden rounded-xl border bg-white shadow-[0_4px_16px_rgba(0,0,0,.05)] transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="relative aspect-[1.55/1] overflow-hidden bg-muted"><Image src={categoryImageFor(category.slug)} alt={`${category.name} category`} fill sizes="(max-width:640px) 50vw, 180px" className="object-cover transition duration-300 group-hover:scale-105" /></div>
              <div className="flex items-center justify-between gap-1 px-2.5 py-2"><span className="truncate text-xs font-extrabold">{category.name}</span><span className="text-[10px] font-bold text-muted-foreground">{category.count}</span></div>
            </Link>
          ))}
        </div>
      </section>

      <AdSenseSlot slot={process.env.NEXT_PUBLIC_ADSENSE_HOME_TOP_SLOT} className="mt-5" />

      <section id="home-offers" className="mt-8" aria-labelledby="home-value-picks">
        <div className="mb-3 flex items-end justify-between gap-4 px-1">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-primary"><BadgePercent className="size-3.5" /> Featured products · Today’s value picks</p>
            <h2 id="home-value-picks" className="font-serif text-2xl font-black tracking-tight text-[color:var(--brand-green-deep)] sm:text-3xl">Offers worth adding</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">Current offers and useful everyday groceries, selected only from products the store can actually sell now.</p>
          </div>
          <Link href="/shop" className="hidden shrink-0 items-center text-xs font-bold text-primary hover:underline sm:inline-flex">See the full shop <ArrowRight className="ml-1 size-3.5" /></Link>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">{valuePicks.map((product, index) => <ProductTile key={product.id} product={product} priority={index < 2} />)}</div>
      </section>

      <section className="storefront-promo-grid mt-8 grid gap-3 lg:grid-cols-[1.7fr_1fr]" aria-label="Store promotions">
        <article className="relative min-h-[190px] overflow-hidden rounded-2xl bg-[color:var(--brand-green-deep)] p-6 text-white sm:p-8">
          <Image src={storefrontProducePromoImage} alt="Colourful basket of fresh produce" fill sizes="(max-width:1024px) 100vw, 65vw" className="object-cover object-right opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--brand-green-deep)] via-[color:var(--brand-green-deep)]/90 to-transparent" />
          <div className="relative max-w-lg"><p className="text-xs font-black uppercase tracking-[0.16em] text-brand-amber">Market basket</p><h2 className="mt-2 font-serif text-3xl font-black leading-none sm:text-4xl">Healthy choices for a <span className="text-brand-amber">brighter tomorrow</span></h2><p className="mt-3 text-sm leading-relaxed text-white/80">Build a basket around fresh produce, proteins and Ghanaian staples without losing sight of current availability.</p><Button asChild className="mt-5 h-10 bg-brand-amber text-[color:var(--brand-green-deep)] hover:bg-brand-amber/90"><Link href={freshProduceCategory ? `/shop?category=${encodeURIComponent(freshProduceCategory.slug)}` : "/shop"}>Shop fresh produce <ArrowRight className="size-3.5" /></Link></Button></div>
        </article>
        <article className="relative min-h-[190px] overflow-hidden rounded-2xl bg-[#fff4d8] p-6 sm:p-8">
          <Image src={storefrontPantryPromoImage} alt="Pantry groceries and household essentials" fill sizes="(max-width:1024px) 100vw, 35vw" className="object-cover object-right opacity-65" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#fff4d8] via-[#fff4d8]/95 to-transparent" />
          <div className="relative max-w-[285px]"><p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Need ideas?</p><h2 className="mt-2 font-serif text-3xl font-black leading-none text-[color:var(--brand-green-deep)]">Smart shopping assistance</h2><p className="mt-3 text-xs leading-relaxed text-foreground/70">Ask for ingredients or a budget basket and review available catalogue suggestions before buying.</p><Button asChild variant="outline" className="mt-5 h-10 border-primary/25 bg-white/80"><Link href="/assistant"><Sparkles className="size-3.5 text-brand-amber" /> Try assistant</Link></Button></div>
        </article>
      </section>

      <ProductSection id="home-fresh" eyebrow="Market fresh" title="Fresh from the market" copy="Produce and proteins for soups, stews, sides and everyday family meals." products={freshMarket} href="/shop?category=fresh-produce" linkLabel="Shop fresh produce" />
      <ProductSection id="home-essentials" eyebrow="Kitchen essentials" title="Everyday essentials" copy="Pantry & everyday staples — rice, grains, beans, cooking oils, sauces and other cupboard basics for regular household shopping." products={pantry} href="/shop?category=grains-staples" linkLabel="Shop pantry staples" />

      <section className="mt-8 grid gap-3 lg:grid-cols-3" aria-labelledby="basket-planning-title">
        <article className="rounded-2xl border bg-gradient-to-br from-[#edf6e8] to-white p-5 sm:p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">Quick top-up</p>
          <h2 id="basket-planning-title" className="mt-2 font-serif text-2xl font-black text-[color:var(--brand-green-deep)]">Plan your next basket</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Use categories and search to refill only what the household needs, then review availability before checkout.</p>
          <Link href="/shop" className="mt-4 inline-flex items-center text-sm font-bold text-primary hover:underline">Browse all groceries <ArrowRight className="ml-1 size-4" /></Link>
        </article>
        <article className="rounded-2xl border bg-white p-5 sm:p-6">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="size-5" /></div>
          <h3 className="mt-4 font-serif text-xl font-black">Budget basket helper</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Tell the shopping assistant your budget and review suggestions drawn from available catalogue items.</p>
          <Link href="/assistant" className="mt-4 inline-flex items-center text-sm font-bold text-primary hover:underline">Ask the assistant <ArrowRight className="ml-1 size-4" /></Link>
        </article>
        <article className="rounded-2xl border bg-white p-5 sm:p-6">
          <div className="flex size-10 items-center justify-center rounded-full bg-brand-amber/20 text-[color:var(--brand-green-deep)]"><UserRound className="size-5" /></div>
          <h3 className="mt-4 font-serif text-xl font-black">Save time next visit</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Create an account to keep your profile, follow orders and use saved lists for repeat shopping.</p>
          <Link href="/account/signup" className="mt-4 inline-flex items-center text-sm font-bold text-primary hover:underline">Create an account <ArrowRight className="ml-1 size-4" /></Link>
        </article>
      </section>

      <ProductSection id="home-arrivals" eyebrow="New in the catalogue" title="Fresh arrivals" copy="Recently added and newly available groceries worth discovering on your next shop." products={freshArrivals} href="/shop?sort=name" linkLabel="Browse new finds" />

      <section id="home-shop-by-need" className="mt-9 rounded-[26px] border bg-gradient-to-br from-white via-[#fbfcf7] to-[#eef5e7] p-5 sm:p-7" aria-labelledby="home-shop-by-need-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">More ways to discover</p><h2 id="home-shop-by-need-title" className="mt-1 font-serif text-3xl font-black text-[color:var(--brand-green-deep)]">Shop by lifestyle and need</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Jump into common shopping missions without hunting through the full catalogue.</p></div>
          <Link href="/categories" className="text-sm font-bold text-primary hover:underline">Explore every category <ArrowRight className="ml-1 inline size-4" /></Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/shop?category=fresh-produce" className="rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30"><Leaf className="size-5 text-primary" /><h3 className="mt-3 font-bold">Fresh cooking basket</h3><p className="mt-1 text-xs text-muted-foreground">Produce for soups, stews, sides and family meals.</p></Link>
          <Link href="/shop?category=grains-staples" className="rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30"><ShoppingBasket className="size-5 text-primary" /><h3 className="mt-3 font-bold">Pantry restock</h3><p className="mt-1 text-xs text-muted-foreground">Grains and everyday staples for the cupboard.</p></Link>
          <Link href="/shop?category=beverages" className="rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30"><Package className="size-5 text-primary" /><h3 className="mt-3 font-bold">Drinks &amp; quick top-ups</h3><p className="mt-1 text-xs text-muted-foreground">Refreshments and convenient add-ons for the household.</p></Link>
          <Link href="/shop?category=household" className="rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30"><Store className="size-5 text-primary" /><h3 className="mt-3 font-bold">Home care</h3><p className="mt-1 text-xs text-muted-foreground">Cleaning and household essentials in the same order.</p></Link>
        </div>
      </section>

      <ProductSection eyebrow="For the family" title="Drinks, snacks & family favourites" copy="Beverages, dairy, snacks and convenient family items for school days, workdays and weekends." products={familyFavourites} href="/shop?category=beverages" linkLabel="Shop drinks & snacks" />

      <AdSenseSlot slot={process.env.NEXT_PUBLIC_ADSENSE_HOME_MID_SLOT} />

      <ProductSection eyebrow="For the home" title="Home & personal care" copy="Household cleaning and personal-care essentials kept alongside your grocery order." products={homeCare} href="/shop?category=household" linkLabel="Shop household care" />

      <section id="home-how-it-works" className="mt-9 rounded-[26px] border bg-[#f8faf4] p-5 sm:p-7" aria-labelledby="how-variety-works">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">Simple from basket to handover</p>
          <h2 id="how-variety-works" className="mt-2 font-serif text-3xl font-black text-[color:var(--brand-green-deep)]">How Variety works</h2>
          <p className="mt-2 text-sm text-muted-foreground">A straightforward shopping flow built around current stock, fulfilment choice and order visibility.</p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl bg-white p-5 shadow-sm"><span className="grid size-11 place-items-center rounded-full bg-primary/10 font-black text-primary">1</span><Search className="mt-4 size-5 text-primary" /><h3 className="mt-2 font-bold">Browse live catalogue</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Search or filter categories and choose from products currently available to sell.</p></article>
          <article className="rounded-2xl bg-white p-5 shadow-sm"><span className="grid size-11 place-items-center rounded-full bg-primary/10 font-black text-primary">2</span><ShoppingBasket className="mt-4 size-5 text-primary" /><h3 className="mt-2 font-bold">Review your basket</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Choose variants and quantities, then let checkout revalidate price and availability.</p></article>
          <article className="rounded-2xl bg-white p-5 shadow-sm"><span className="grid size-11 place-items-center rounded-full bg-primary/10 font-black text-primary">3</span><Package className="mt-4 size-5 text-primary" /><h3 className="mt-2 font-bold">Receive &amp; track</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Use configured delivery or collection and follow supported order milestones from the tracking page.</p></article>
        </div>
      </section>

      <section className="mt-6 grid gap-2 rounded-2xl border bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4" aria-label="Why shop with Variety Groceries">
        <div className="flex items-center gap-3 p-2"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Leaf className="size-5" /></span><div><p className="text-sm font-bold">Fresh selection</p><p className="text-[11px] text-muted-foreground">Purchasable lists follow sellable stock.</p></div></div>
        <div className="flex items-center gap-3 p-2"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Truck className="size-5" /></span><div><p className="text-sm font-bold">Flexible fulfilment</p><p className="text-[11px] text-muted-foreground">Configured delivery or store collection.</p></div></div>
        <div className="flex items-center gap-3 p-2"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="size-5" /></span><div><p className="text-sm font-bold">Controlled checkout</p><p className="text-[11px] text-muted-foreground">Price and availability are revalidated.</p></div></div>
        <div className="flex items-center gap-3 p-2"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Store className="size-5" /></span><div><p className="text-sm font-bold">Connected inventory</p><p className="text-[11px] text-muted-foreground">Online and counter sales share stock.</p></div></div>
      </section>

      <section id="home-customer-tools" className="mt-8 grid gap-3 overflow-hidden rounded-[26px] bg-[color:var(--brand-green-deep)] p-6 text-white md:grid-cols-[1.35fr_.65fr] md:p-8" aria-label="Customer support and account">
        <div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-brand-amber">Shop with confidence</p><h2 className="mt-2 font-serif text-3xl font-black">Plan, track and repeat your shop</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/75">Your grocery journey does not end at checkout. Create an account, track an order, review order history, manage returns where eligible, or use the help centre when you need support.</p><div className="mt-5 flex flex-wrap gap-2"><Button asChild className="bg-brand-amber text-[color:var(--brand-green-deep)] hover:bg-brand-amber/90"><Link href="/account/signup">Create your free account</Link></Button><Button asChild variant="secondary"><Link href="/track">Track an order</Link></Button><Button asChild variant="secondary"><Link href="/help">Visit help centre</Link></Button></div></div>
        <div className="grid grid-cols-2 gap-2 self-center"><div className="rounded-2xl bg-white/8 p-4"><CheckCircle2 className="size-5 text-brand-amber" /><p className="mt-3 text-sm font-bold">Order history</p><p className="mt-1 text-xs text-white/65">Available inside customer accounts.</p></div><div className="rounded-2xl bg-white/8 p-4"><MapPin className="size-5 text-brand-amber" /><p className="mt-3 text-sm font-bold">Delivery info</p><p className="mt-1 text-xs text-white/65">Review configured zones and fulfilment information.</p></div></div>
      </section>

      <AdSenseSlot slot={process.env.NEXT_PUBLIC_ADSENSE_HOME_BOTTOM_SLOT} />

      <section aria-labelledby="home-demo" className="mt-6 grid gap-3 rounded-2xl border border-dashed bg-muted/35 p-4 sm:grid-cols-2">
        <div><h2 id="home-demo" className="text-sm font-bold">Prototype demo data</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Products, stock, prices and customer records in this environment are fictional fixtures. External payment and courier integrations are not represented as connected unless explicitly labelled.</p></div>
        <div className="rounded-xl bg-white p-3"><p className="flex items-center gap-2 text-xs font-bold"><MapPin className="size-4 text-primary" /> Tracking a demo order?</p>{demoTrack ? <p className="mt-1 text-xs text-muted-foreground">Try reference <code className="rounded bg-muted px-1 py-0.5 font-mono">{demoTrack.reference}</code> with code <code className="rounded bg-muted px-1 py-0.5 font-mono">{demoTrack.verificationCode}</code> · last updated {formatDateTime(demoTrack.lastUpdatedAt)} UTC.</p> : <p className="mt-1 text-xs text-muted-foreground">Use the order reference and verification code supplied at checkout.</p>}<Link href="/track" className="mt-2 inline-flex items-center text-xs font-bold text-primary hover:underline">Track an order <ArrowRight className="ml-1 size-3.5" /></Link></div>
      </section>
    </div>
  );
}
