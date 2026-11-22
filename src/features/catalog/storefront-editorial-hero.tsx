"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Leaf, Pause, Play, ShoppingBasket, Sparkles,
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

/**
 * Compact full-bleed promotional slideshow. The image fills the *whole*
 * banner, with a dark, graduated overlay behind the readable copy.
 * A product's title and "From" price flow inline on laptop, not as two
 * enormous stacked display lines. Any slide may still wrap safely on mobile.
 *
 * Autoplay continues during hover/focus; the only user pause is the button.
 * Respect OS reduced-motion, and do not advance while the tab is hidden.
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
  const [playbackStopped, setPlaybackStopped] = useState(false);
  const current = slides[active] ?? slides[0];
  const productSlide = current.id.startsWith("product-");

  useEffect(() => {
    if (slides.length < 2 || reduceMotion || playbackStopped) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") setActive(index => (index + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(interval);
  }, [slides.length, reduceMotion, playbackStopped]);

  const navigate = (index: number) => setActive((index + slides.length) % slides.length);
  const transition = reduceMotion ? { duration: 0 } : { duration: .68, ease: "easeInOut" as const };

  return (
    <section
      aria-labelledby="home-hero-title"
      aria-roledescription="carousel"
      aria-label="Featured grocery promotions and products"
      className="relative isolate mt-3 h-[440px] min-w-0 overflow-hidden rounded-[22px] bg-[#062d23] text-white shadow-[0_15px_45px_rgba(3,52,33,.16)] min-[360px]:h-[410px] sm:h-[370px] lg:h-[clamp(350px,43vh,430px)] sm:rounded-[28px]"
    >
      {/* Crossfading photographs cover the entire banner, not a second column.
          The right edge stays clear for product photography at laptop width. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={current.id}
          initial={false}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={transition}
          className="absolute inset-0 z-0"
        >
          <Image
            src={current.image}
            alt={current.alt}
            fill
            unoptimized={Boolean(current.productFeatured)}
            priority={active === 0}
            sizes="100vw"
            className="object-cover object-[62%_center] md:object-center"
          />
        </motion.div>
      </AnimatePresence>

      {/* Deep shadow over the copy; graduate toward the clear picture.
          On phones the dark zone is lower, leaving the upper image visible. */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] md:hidden"
        style={{ background: "linear-gradient(0deg,rgba(2,28,22,.97) 0%,rgba(2,28,22,.91) 45%,rgba(2,28,22,.61) 67%,rgba(2,28,22,.07) 100%)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1] hidden md:block"
        style={{ background: "linear-gradient(90deg,rgba(3,37,29,.97) 0%,rgba(3,37,29,.91) 23%,rgba(3,37,29,.60) 54%,rgba(3,37,29,.08) 100%)" }}
        aria-hidden
      />

      <div className="relative z-10 flex h-full min-w-0 flex-col justify-end px-4 pb-[67px] pt-4 sm:px-8 sm:pb-[66px] md:justify-center md:pb-12 lg:max-w-[74%] lg:px-11 xl:max-w-[69%] xl:px-12">
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={current.id}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={transition}
            aria-live="off"
            className="min-w-0"
          >
            <div className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-[.12em] text-[#e9f2dd] backdrop-blur-sm sm:text-[10px]">
              <Leaf className="size-3 shrink-0 text-[#f3c973]" aria-hidden />
              <span className="min-w-0 truncate">{current.badge}</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#d3e5c2] sm:text-[11px]">{current.eyebrow}</p>
            <h1
              id="home-hero-title"
              className={`mt-1 max-w-full break-words font-serif font-black leading-[1.08] tracking-[-.035em] text-balance ${productSlide ? "text-[clamp(1.8rem,3vw,2.75rem)]" : "text-[clamp(2rem,3.8vw,3.5rem)]"}`}
            >
              <span>{current.headline}</span>
              {" "}
              <span className={`inline text-[#f8d184] italic ${productSlide ? "text-[.78em] font-bold tracking-[-.02em]" : ""}`}>{current.emphasis}</span>
            </h1>
            <p className="mt-2.5 line-clamp-2 max-w-[510px] text-[12px] leading-5 text-[#f1f6eb]/95 sm:text-sm sm:leading-[1.45] lg:line-clamp-2">
              {current.body}
            </p>
            {/* Both CTAs share one row on mobile, including the pantry slide.
                Text wraps *within* each button, never beyond the banner. */}
            <div className="mt-4 grid min-w-0 grid-cols-2 items-stretch gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
              <Link
                href={current.ctaHref}
                className="inline-flex min-h-11 min-w-0 w-full items-center justify-center gap-1 rounded-full bg-[#f8cd78] px-2 py-2 text-center text-[10px] font-black leading-[1.2] text-[#113d2b] transition hover:bg-[#ffe09a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white min-[360px]:text-[11px] sm:min-h-11 sm:w-auto sm:gap-2 sm:px-4 sm:py-2.5 sm:text-xs"
              >
                <ShoppingBasket className="size-3.5 shrink-0 sm:size-4" aria-hidden />
                <span className="min-w-0 break-words">{current.ctaLabel}</span>
                <ArrowRight className="hidden size-3.5 shrink-0 sm:block" aria-hidden />
              </Link>
              <Link
                href={current.secondaryCtaHref}
                className="inline-flex min-h-11 min-w-0 w-full items-center justify-center gap-1 rounded-full border border-white/50 bg-black/20 px-2 py-2 text-center text-[10px] font-bold leading-[1.2] text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white min-[360px]:text-[11px] sm:min-h-11 sm:w-auto sm:gap-2 sm:px-4 sm:py-2.5 sm:text-xs"
              >
                <Sparkles className="size-3.5 shrink-0 text-[#f3c973] sm:size-4" aria-hidden />
                <span className="min-w-0 break-words">{current.secondaryCtaLabel}</span>
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls overlay the image instead of adding a tall second section. */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex min-h-[52px] min-w-0 items-center justify-between gap-1.5 border-t border-white/15 bg-[#042b21]/60 px-3 py-2 backdrop-blur-sm sm:px-6">
        <div className="flex min-w-0 shrink items-center gap-0.5 sm:gap-1" role="group" aria-label="Choose a featured slide">
          {slides.map((slide, index) => (
            <button
              type="button"
              key={slide.id}
              onClick={() => navigate(index)}
              aria-label={`Show featured slide ${index + 1}: ${slide.headline}`}
              aria-current={index === active ? "true" : undefined}
              className="group flex size-6 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:size-8"
            >
              <span aria-hidden className={`h-1.5 rounded-full transition-all duration-300 ${index === active ? "w-5 bg-[#f8cd78]" : "w-2 bg-white/50 group-hover:bg-white/80"}`} />
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setPlaybackStopped(value => !value)}
            aria-label={playbackStopped ? "Play featured slideshow" : "Pause featured slideshow"}
            className="grid size-8 place-items-center rounded-full border border-white/30 transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:size-9"
          >
            {playbackStopped ? <Play className="size-3.5 sm:size-4" aria-hidden /> : <Pause className="size-3.5 sm:size-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => navigate(active - 1)}
            aria-label="Previous featured slide"
            className="grid size-8 place-items-center rounded-full border border-white/30 transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:size-9"
          >
            <ArrowLeft className="size-3.5 sm:size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => navigate(active + 1)}
            aria-label="Next featured slide"
            className="grid size-8 place-items-center rounded-full bg-[#f8cd78] text-[#113d2b] transition hover:bg-[#ffe09a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:size-9"
          >
            <ArrowRight className="size-3.5 sm:size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[2px] bg-white/10">
        <motion.div
          key={current.id}
          className="h-full origin-left bg-[#f8cd78]"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: playbackStopped || reduceMotion ? 0 : 1 }}
          transition={{ duration: playbackStopped || reduceMotion ? 0 : AUTO_ADVANCE_MS / 1000, ease: "linear" }}
        />
      </div>
    </section>
  );
}
