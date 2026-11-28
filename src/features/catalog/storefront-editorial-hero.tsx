"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Leaf, Pause, Play, ShoppingBasket, ShieldCheck, Truck, Package, Search,
} from "lucide-react";
import type { CatalogProduct, CmsHomepageView } from "@/services/contracts";
import {
  storefrontHeroImage,
  storefrontPantryPromoImage,
  storefrontProducePromoImage,
} from "@/lib/product-image-map";

const AUTO_ADVANCE_MS = 5600;

type HeroSlide = {
  id: string;
  badge: string;
  eyebrow: string;
  headline: string;
  emphasis: string;
  body: string;
  image: string;
  alt: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  productFeatured?: boolean;
};

export function buildStorefrontHeroSlides(content: CmsHomepageView, products: CatalogProduct[]): HeroSlide[] {
  const slides: HeroSlide[] = [
    {
      id: "welcome", badge: content.badge, eyebrow: "A fresher way to shop",
      headline: content.headline, emphasis: content.emphasis, body: content.body,
      image: storefrontHeroImage, alt: "A market basket filled with colourful groceries",
      ctaLabel: content.primaryCtaLabel, ctaHref: content.primaryCtaHref,
      secondaryCtaLabel: content.secondaryCtaLabel, secondaryCtaHref: content.secondaryCtaHref,
    },
    {
      id: "fresh", badge: "Market fresh", eyebrow: "Colour for your kitchen",
      headline: "Fresh choices", emphasis: "for every meal",
      body: "Explore produce, vegetables and ingredients for your favourite Ghanaian dishes. Check availability before checkout.",
      image: storefrontProducePromoImage, alt: "Colourful fresh produce for everyday meals",
      ctaLabel: "Shop fresh produce", ctaHref: "/shop?category=fresh-produce",
      secondaryCtaLabel: "Explore categories", secondaryCtaHref: "/categories",
    },
    {
      id: "pantry", badge: "Everyday essentials", eyebrow: "Your weekly restock",
      headline: "Fill the pantry", emphasis: "with favourites",
      body: "Find kitchen staples, cooking essentials and household supplies together in one convenient shop.",
      image: storefrontPantryPromoImage, alt: "An assortment of pantry groceries and everyday essentials",
      ctaLabel: "Explore pantry staples", ctaHref: "/shop?category=grains-staples",
      secondaryCtaLabel: "Shop all groceries", secondaryCtaHref: "/shop",
    },
  ];
  const seen = new Set<string>();
  for (const product of products) {
    if (slides.length >= 6) break;
    if (!product.anyAvailable || !product.slug || !product.image || seen.has(product.id)) continue;
    seen.add(product.id);
    slides.push({
      id: `product-${product.id}`, badge: "Featured grocery", eyebrow: product.categoryName || "Discover the selection",
      headline: product.name, emphasis: product.minPriceLabel ? `From ${product.minPriceLabel}` : "In the market",
      body: product.shortDescription?.trim() || "Discover more about this grocery and review the current product details.",
      image: product.featuredImage?.url || product.image,
      alt: product.featuredImage?.altText || `${product.name} grocery product image`,
      ctaLabel: "Explore this product", ctaHref: `/products/${encodeURIComponent(product.slug)}`,
      secondaryCtaLabel: "Browse more groceries", secondaryCtaHref: "/shop",
      productFeatured: Boolean(product.featuredImage),
    });
  }
  return slides;
}

/** FreshMarket 001: cream canvas, editorial typography, grocery photography
 * and functional controls. Storefront content remains CMS-driven. */
export function StorefrontEditorialHero({
  content, featuredProducts = [],
}: {
  content: CmsHomepageView;
  featuredProducts?: CatalogProduct[];
}) {
  const reduceMotion = useReducedMotion();
  const slides = useMemo(() => buildStorefrontHeroSlides(content, featuredProducts), [content, featuredProducts]);
  const [active, setActive] = useState(0);
  const [playbackStopped, setPlaybackStopped] = useState(false);
  const current = slides[active] ?? slides[0];
  const productSlide = current.id.startsWith("product-");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = playbackStopped || hovered || focused || Boolean(reduceMotion);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") setActive(index => (index + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(interval);
  }, [slides.length, paused]);

  const navigate = (index: number) => setActive((index + slides.length) % slides.length);
  const transition = reduceMotion ? { duration: 0 } : { duration: .68, ease: "easeInOut" as const };

  return (
    <section
      data-storefront-template="freshmarket-001"
      aria-labelledby="home-hero-title"
      aria-roledescription="carousel"
      aria-label="Featured grocery promotions and products"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          navigate(active + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}
      className="relative isolate mt-3 overflow-hidden rounded-[24px] border border-[#e2e6d7] bg-[#fafbf3] text-[#142d1d] shadow-[0_12px_40px_rgba(41,68,25,.09)] sm:rounded-[32px]"
    >
      <div className="relative grid min-h-0 md:min-h-[420px] md:grid-cols-[46%_54%] lg:min-h-[480px] xl:min-h-[510px]">
        {/* Real HTML copy and CTAs, never baked into the photograph. */}
        <div className="relative z-20 flex min-w-0 flex-col justify-center px-5 pb-5 pt-7 sm:px-9 sm:pt-10 md:py-12 lg:pl-12 lg:pr-2 xl:pl-16">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={current.id}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
              transition={transition}
              className="min-w-0"
            >
              <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full bg-[#e9f1da] px-3.5 py-2 text-[11px] font-semibold text-[#285b2c]">
                <Leaf className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{current.badge}</span>
              </div>
              <h1 id="home-hero-title" className={`font-serif font-black leading-[1.08] tracking-[-.045em] text-balance break-words ${productSlide ? "text-[clamp(1.9rem,3.3vw,3.25rem)]" : "text-[clamp(2rem,4.1vw,4.25rem)]"}`}>
                {current.headline}{" "}<span className="text-[#16703b]">{current.emphasis}</span>
              </h1>
              <p className="mt-4 max-w-[475px] text-sm leading-relaxed text-[#53634e] sm:text-base md:line-clamp-4">{current.body}</p>
              <div data-hero-actions className="mt-5 grid w-full min-w-0 grid-cols-2 items-stretch gap-2 sm:mt-7 sm:gap-3">
                <Link href={current.ctaHref} className="inline-flex h-full min-h-12 w-full min-w-0 items-center justify-center gap-1.5 rounded-full sm:gap-2 bg-[#087438] px-2 py-2.5 text-center text-xs font-bold leading-tight text-white shadow-sm transition hover:bg-[#075c2e] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087438] sm:px-3 sm:text-sm lg:px-4">
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{current.ctaLabel}</span><ArrowRight className="hidden size-3.5 shrink-0 min-[360px]:block sm:size-4" aria-hidden />
                </Link>
                <Link href={current.secondaryCtaHref} className="inline-flex h-full min-h-12 w-full min-w-0 items-center justify-center gap-1.5 rounded-full sm:gap-2 bg-[#ffcf42] px-2 py-2.5 text-center text-xs font-bold leading-tight text-[#26351c] transition hover:bg-[#f5bc22] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087438] sm:px-3 sm:text-sm lg:px-4">
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{current.secondaryCtaLabel}</span><ArrowRight className="hidden size-3.5 shrink-0 min-[360px]:block sm:size-4" aria-hidden />
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="relative min-h-[215px] overflow-hidden sm:min-h-[300px] md:min-h-full">
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              key={current.id}
              initial={false}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={transition}
              className="absolute inset-0"
            >
              <Image src={current.image} alt={current.alt} fill unoptimized={Boolean(current.productFeatured)} priority={active === 0} sizes="(max-width:767px) 100vw, 55vw" className={productSlide ? "object-contain p-5" : "object-cover object-center"} />
            </motion.div>
          </AnimatePresence>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#fafbf3] via-transparent to-transparent md:bg-gradient-to-r md:from-[#fafbf3] md:via-[#fafbf3]/0 md:to-transparent" aria-hidden />
          <div className="absolute right-3 top-3 hidden items-center gap-3 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-[0_8px_30px_rgba(36,65,23,.13)] sm:flex md:right-5 md:top-7">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8f3dc] text-[#168041]"><ShoppingBasket className="size-5" aria-hidden /></span>
            <div><p className="text-xs font-bold">Explore our selection</p><p className="mt-0.5 text-[11px] text-[#586754]">Groceries for every day</p></div>
          </div>
          <Link href="/track" className="absolute bottom-4 left-4 flex items-center gap-3 rounded-2xl border border-white/80 bg-white/95 px-3.5 py-3 text-[#173d28] shadow-[0_8px_30px_rgba(36,65,23,.13)] transition hover:bg-[#eef6df] md:bottom-9 md:left-8">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#fff1c6] text-[#775718]"><Truck className="size-5" aria-hidden /></span>
            <div><p className="text-xs font-bold">Track your order</p><p className="mt-0.5 text-[11px] text-[#586754]">Follow delivery updates</p></div>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <Leaf aria-hidden className="pointer-events-none absolute left-[39%] top-5 z-10 hidden size-12 rotate-[28deg] fill-[#a6c66f]/30 text-[#86a858]/50 lg:block" />
      </div>
      <div className="relative z-20 mx-3 mt-1 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#e4e9da] bg-[#e4e9da] shadow-sm sm:mx-6 md:grid-cols-4 lg:mx-8">
        {[
          {Icon:Leaf,title:"Fresh selection",body:"Browse seasonal groceries"},
          {Icon:ShieldCheck,title:"Secure checkout",body:"Review prices before paying"},
          {Icon:Package,title:"Flexible fulfilment",body:"Delivery or collection options"},
          {Icon:Search,title:"Easy shopping",body:"Find your everyday essentials"},
        ].map(({Icon,title,body})=>(
          <div key={title} className="flex min-w-0 items-center gap-2 bg-white px-3 py-3.5 sm:gap-3 sm:px-4 sm:py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eff5e3] text-[#36753b] sm:size-11"><Icon className="size-[19px]" aria-hidden /></span>
            <div className="min-w-0"><p className="text-[11px] font-bold leading-tight sm:text-[13px]">{title}</p><p className="mt-1 text-[10px] leading-tight text-[#61715b] sm:text-xs">{body}</p></div>
          </div>
        ))}
      </div>
      <div className="flex min-h-[55px] items-center justify-between gap-2 px-4 py-2 sm:px-8">
        <div className="flex items-center gap-1" role="group" aria-label="Choose a featured slide">
          {slides.map((slide,index)=>(
            <button type="button" key={slide.id} onClick={()=>navigate(index)} aria-label={`Show featured slide ${index+1}: ${slide.headline}`} aria-current={index===active?"true":undefined} className="group grid size-8 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-[#087438]">
              <span aria-hidden className={`h-2 rounded-full transition-all ${index===active?"w-6 bg-[#087438]":"w-2 bg-[#b8c9ab] group-hover:bg-[#6d985d]"}`}/>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-medium tabular-nums text-[#586754] sm:inline">{active+1} / {slides.length}</span>
          <button type="button" disabled={Boolean(reduceMotion)} onClick={()=>setPlaybackStopped(value=>!value)} aria-label={playbackStopped?"Play featured slideshow":"Pause featured slideshow"} className="grid size-10 place-items-center rounded-full border border-[#d4dfca] bg-white hover:bg-[#edf5e4] focus-visible:outline-2 focus-visible:outline-[#087438] disabled:opacity-50">
            {playbackStopped||reduceMotion?<Play className="size-4" aria-hidden/>:<Pause className="size-4" aria-hidden/>}
          </button>
          <button type="button" onClick={()=>navigate(active-1)} aria-label="Previous featured slide" className="grid size-10 place-items-center rounded-full border border-[#d4dfca] bg-white hover:bg-[#edf5e4] focus-visible:outline-2 focus-visible:outline-[#087438]"><ArrowLeft className="size-4" aria-hidden/></button>
          <button type="button" onClick={()=>navigate(active+1)} aria-label="Next featured slide" className="grid size-10 place-items-center rounded-full bg-[#087438] text-white hover:bg-[#075c2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087438]"><ArrowRight className="size-4" aria-hidden/></button>
        </div>
      </div>
      <p className="sr-only" aria-live={paused?"polite":"off"}>Slide {active+1} of {slides.length}: {current.headline}</p>
    </section>
  );
}
