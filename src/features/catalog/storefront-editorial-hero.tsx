"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BadgePercent, Leaf, Pause, Play,
  ShieldCheck, ShoppingBasket, Sparkles, Truck,
} from "lucide-react";
import type { CatalogProduct, CmsHomepageView } from "@/services/contracts";
import {
  storefrontHeroImage,
  storefrontPantryPromoImage,
  storefrontProducePromoImage,
} from "@/lib/product-image-map";

const AUTO_ADVANCE_MS = 6200;

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

/**
 * Lightweight homepage carousel. Curated CMS hero text and existing promo
 * photography lead; currently saleable catalogue items supply product slides,
 * using approved featured media where available. No unpublished/review media.
 */
export function StorefrontEditorialHero({
  content, featuredProducts = [],
}: {
  content: CmsHomepageView;
  featuredProducts?: CatalogProduct[];
}) {
  const reduceMotion = useReducedMotion();
  const slides = useMemo(() => buildStorefrontHeroSlides(content, featuredProducts), [content, featuredProducts]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [playbackStopped, setPlaybackStopped] = useState(false);
  const current = slides[active] ?? slides[0];

  useEffect(() => {
    if (slides.length < 2 || reduceMotion || paused || playbackStopped) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") setActive(index => (index + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(interval);
  }, [slides.length, reduceMotion, paused, playbackStopped]);

  const navigate = (index: number) => setActive((index + slides.length) % slides.length);
  const transition = reduceMotion ? { duration: 0 } : { duration: .64, ease: "easeInOut" as const };

  return (
    <section
      aria-labelledby="home-hero-title"
      aria-roledescription="carousel"
      aria-label="Featured grocery promotions and products"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setPaused(false);
      }}
      className="relative isolate mt-3 overflow-hidden rounded-[24px] bg-[#073b2c] text-[#f9f8e9] shadow-[0_22px_65px_rgba(3,52,33,.17)] sm:rounded-[34px]"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden
        style={{ backgroundImage: "radial-gradient(circle at 78% 10%,rgba(239,209,129,.16),transparent 34%),linear-gradient(125deg,#073b2c 0%,#09523d 78%,#0a3b2c 100%)" }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-36 left-[35%] size-[570px] rounded-full border border-white/10" />

      <div className="relative grid min-h-[530px] min-w-0 items-center lg:grid-cols-[minmax(0,1.03fr)_minmax(0,.97fr)] lg:min-h-[570px]">
        <div className="relative z-20 min-w-0 px-5 pb-8 pt-10 sm:px-10 sm:pb-11 sm:pt-14 lg:px-14 lg:py-16">
          <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-[.13em] text-[#eaf5dc] backdrop-blur-xl sm:text-xs">
            <Leaf className="size-4 shrink-0 text-[#f3c973]" aria-hidden />
            <span className="min-w-0 truncate">{current.badge}</span>
          </div>
          <AnimatePresence initial={false} mode="wait">
            <motion.div key={current.id} initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
              transition={transition} aria-live="off" className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.22em] text-[#d4e6b9] sm:text-xs">{current.eyebrow}</p>
              <h1 id="home-hero-title" className="mt-3 max-w-[660px] break-words font-serif text-[clamp(2.65rem,6vw,6.2rem)] font-black leading-[.98] tracking-[-.047em]">
                {current.headline}
                <span className="mt-1 block text-[#f7c76f] italic">{current.emphasis}</span>
              </h1>
              <p className="mt-5 line-clamp-3 max-w-[530px] text-sm leading-6 text-[#e5eee2]/95 sm:text-base sm:leading-7">
                {current.body}
              </p>
              {/* Keep BOTH actions on one horizontal row on phones.
                  Text may wrap within a button, never force the second button
                  onto a separate row or widen the mobile viewport. */}
              <div className="mt-6 grid min-w-0 grid-cols-2 items-stretch gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
                <Link href={current.ctaHref}
                  className="inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-1 rounded-full bg-[#f8cd78] px-2 py-2.5 text-center text-[11px] font-black leading-[1.2] text-[#113d2b] transition hover:-translate-y-0.5 hover:bg-[#ffe09a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-auto sm:gap-2 sm:px-5 sm:py-3 sm:text-sm">
                  <ShoppingBasket className="size-3.5 shrink-0 sm:size-4" aria-hidden />
                  <span className="min-w-0 break-words">{current.ctaLabel}</span>
                  <ArrowRight className="hidden size-4 shrink-0 sm:block" aria-hidden />
                </Link>
                <Link href={current.secondaryCtaHref}
                  className="inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-1 rounded-full border border-white/40 bg-white/10 px-2 py-2.5 text-center text-[11px] font-bold leading-[1.2] text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-auto sm:gap-2 sm:px-4 sm:py-3 sm:text-xs">
                  <Sparkles className="size-3.5 shrink-0 text-[#f3c973] sm:size-4" aria-hidden />
                  <span className="min-w-0 break-words">{current.secondaryCtaLabel}</span>
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/15 pt-5 text-[11px] font-semibold text-white/80 sm:text-xs">
            <span className="inline-flex items-center gap-1.5"><Leaf className="size-4 text-[#bce49c]" aria-hidden /> Carefully selected</span>
            <span className="inline-flex items-center gap-1.5"><Truck className="size-4 text-[#bce49c]" aria-hidden /> Delivery & collection</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-[#bce49c]" aria-hidden /> Stock checked</span>
          </div>
        </div>

        <div className="relative isolate h-[300px] min-w-0 overflow-hidden sm:h-[390px] lg:h-full lg:min-h-[570px]"
          aria-label="Featured grocery photography">
          <AnimatePresence initial={false}>
            <motion.div key={current.id}
              initial={reduceMotion ? false : { opacity: 0, scale: 1.055 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: .985 }}
              transition={transition}
              className="absolute inset-x-5 bottom-6 top-0 overflow-hidden rounded-[36px] border-[6px] border-white/10 shadow-[0_25px_65px_rgba(0,0,0,.28)] sm:inset-x-10 lg:inset-x-7 lg:bottom-9 lg:top-8">
              <Image src={current.image} alt={current.alt} fill
                unoptimized={Boolean(current.productFeatured)} priority={active === 0}
                sizes="(max-width:1024px) 95vw, 48vw" className="object-cover" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#052b20]/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-2 sm:bottom-6 sm:left-6">
                <span className="min-w-0 truncate rounded-full border border-white/20 bg-[#0b3a2a]/75 px-3.5 py-2 text-xs font-bold text-white backdrop-blur-sm">
                  {current.eyebrow}
                </span>
                <span className="shrink-0 rounded-full bg-white/90 px-3 py-2 text-[10px] font-black text-[#124730]">
                  {String(active + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
                </span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-white/15 bg-[#062e22]/80 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-1.5" role="group" aria-label="Choose a featured slide">
          {slides.map((slide, index) => (
            <button type="button" key={slide.id} onClick={() => navigate(index)}
              aria-label={`Show featured slide ${index + 1}: ${slide.headline}`}
              aria-current={index === active ? "true" : undefined}
              className="group flex size-9 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <span aria-hidden className={`h-1.5 rounded-full transition-all duration-300 ${index === active ? "w-7 bg-[#f8cd78]" : "w-2.5 bg-white/40 group-hover:bg-white/80"}`} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPlaybackStopped(value => !value)}
            aria-label={playbackStopped ? "Play featured slideshow" : "Pause featured slideshow"}
            className="grid size-9 place-items-center rounded-full border border-white/25 transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            {playbackStopped ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
          </button>
          <button type="button" onClick={() => navigate(active - 1)} aria-label="Previous featured slide"
            className="grid size-9 place-items-center rounded-full border border-white/25 transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <ArrowLeft className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={() => navigate(active + 1)} aria-label="Next featured slide"
            className="grid size-9 place-items-center rounded-full bg-[#f8cd78] text-[#113d2b] transition hover:bg-[#ffe09a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div aria-hidden className="relative h-1 bg-white/10">
        <motion.div key={current.id} className="h-full origin-left bg-[#f8cd78]"
          initial={{ scaleX: 0 }} animate={{ scaleX: paused || playbackStopped || reduceMotion ? 0 : 1 }}
          transition={{ duration: paused || playbackStopped || reduceMotion ? 0 : AUTO_ADVANCE_MS / 1000, ease: "linear" }} />
      </div>
    </section>
  );
}
