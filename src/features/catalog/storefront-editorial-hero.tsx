"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowRight, Leaf, ShieldCheck, ShoppingBasket, Sparkles, Truck } from "lucide-react";
import type { CmsHomepageView } from "@/services/contracts";
import {
  storefrontHeroImage,
  storefrontPantryPromoImage,
  storefrontProducePromoImage,
} from "@/lib/product-image-map";

export function StorefrontEditorialHero({ content }: { content: CmsHomepageView }) {
  const reducedMotion = useReducedMotion();
  const reveal = (delay = 0) => ({
    initial: reducedMotion ? false : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reducedMotion ? 0 : .72, delay: reducedMotion ? 0 : delay, ease: "easeOut" as const },
  });

  return (
    <section
      aria-labelledby="home-hero-title"
      className="relative isolate mt-3 overflow-hidden rounded-[26px] bg-[#073b2c] text-[#f9f8e9] shadow-[0_22px_65px_rgba(3,52,33,.17)] sm:rounded-[34px]"
    >
      <div className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 72% 14%,rgba(214,232,149,.16),transparent 34%)," +
            "radial-gradient(circle at 13% 89%,rgba(246,188,87,.11),transparent 40%)," +
            "linear-gradient(128deg,#073b2c 7%,#074b38 69%,#175e40 100%)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 left-[35%] size-[390px] rounded-full border border-white/10 sm:size-[650px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 left-[40%] size-[360px] rounded-full border border-white/[.08] sm:size-[590px]" />

      <div className="relative grid min-h-[560px] items-center lg:grid-cols-[minmax(0,1.02fr)_minmax(0,.98fr)]">
        <div className="relative z-20 px-6 pb-12 pt-10 sm:px-11 sm:pb-14 sm:pt-12 lg:px-14 lg:py-16">
          <motion.div {...reveal(.03)}
            className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-[.13em] text-[#eaf5dc] backdrop-blur-xl sm:text-xs">
            <Leaf className="size-4 shrink-0 text-[#f3c973]" aria-hidden />
            <span>{content.badge}</span>
          </motion.div>
          <motion.p {...reveal(.13)}
            className="max-w-sm text-xs font-semibold uppercase tracking-[.26em] text-[#d4e6b9]">
            The feel-good grocery run
          </motion.p>
          <motion.h1 {...reveal(.18)} id="home-hero-title"
            className="mt-3 max-w-[660px] font-serif text-[clamp(3.1rem,7vw,6.7rem)] font-black leading-[.94] tracking-[-.056em]">
            {content.headline}
            <span className="mt-1 block text-[#f7c76f] italic">
              {content.emphasis}
            </span>
          </motion.h1>
          <motion.p {...reveal(.3)}
            className="mt-6 max-w-[540px] text-sm leading-7 text-[#e5eee2]/90 sm:text-base">
            {content.body}
          </motion.p>
          <motion.div {...reveal(.39)} className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={content.primaryCtaHref}
              className="group inline-flex min-h-13 items-center justify-center gap-3 rounded-full bg-[#f8cd78] px-6 py-3.5 text-sm font-black text-[#113d2b] shadow-[0_14px_34px_rgba(8,17,5,.2)] transition-all duration-300 hover:-translate-y-1 hover:bg-[#ffe09a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
              <ShoppingBasket className="size-5" aria-hidden />
              {content.primaryCtaLabel}
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link href={content.secondaryCtaHref}
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full border border-white/40 bg-white/10 px-5 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition-all duration-300 hover:border-white/80 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
              <Sparkles className="size-4 text-[#f3c973]" aria-hidden />
              {content.secondaryCtaLabel}
            </Link>
          </motion.div>

          <motion.div {...reveal(.48)} className="mt-9 flex max-w-[530px] flex-wrap gap-x-5 gap-y-3 border-t border-white/15 pt-6">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/80"><Leaf className="size-4 text-[#bce49c]" /> Thoughtfully chosen</span>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/80"><Truck className="size-4 text-[#bce49c]" /> Delivery or collection</span>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/80"><ShieldCheck className="size-4 text-[#bce49c]" /> Stock checked at checkout</span>
          </motion.div>
        </div>

        <div aria-label="Editorial grocery photography" className="relative isolate min-h-[360px] overflow-hidden px-5 pb-12 sm:min-h-[440px] lg:h-full lg:min-h-[570px] lg:pb-0">
          <div className="absolute bottom-5 left-1/2 top-6 w-[min(88%,520px)] -translate-x-1/2 rounded-[46%_46%_30%_30%] border border-white/15 bg-[#e0ead5]/15 lg:bottom-12 lg:top-10" aria-hidden />
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, scale: .88, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: reducedMotion ? 0 : .9, ease: "easeOut", delay: .23 }}
            className="absolute inset-x-8 bottom-8 top-7 overflow-hidden rounded-[45%_45%_24%_24%] border-[7px] border-white/10 shadow-[0_25px_65px_rgba(0,0,0,.28)] sm:inset-x-16 lg:inset-x-9 lg:bottom-12 lg:top-9"
          >
            <Image src={storefrontHeroImage} alt="A fresh market basket with colourful grocery ingredients"
              fill priority sizes="(max-width:1024px) 90vw, 45vw"
              className="object-cover object-center transition-transform duration-700 hover:scale-105" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b392b]/55 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <span className="inline-flex rounded-full border border-white/30 bg-[#0b3a2a]/65 px-4 py-2 text-xs font-bold tracking-wide text-white backdrop-blur-md">
                Every basket starts somewhere beautiful
              </span>
            </div>
          </motion.div>
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 30, rotate: -10 }}
            animate={{ opacity: 1, y: 0, rotate: -7 }}
            transition={{ duration: .8, delay: .7 }}
            className="absolute bottom-5 left-3 hidden w-[28%] max-w-[170px] overflow-hidden rounded-[22px] border-[5px] border-[#fff8e5] bg-white shadow-[0_20px_35px_rgba(0,0,0,.27)] sm:block lg:bottom-[12%] lg:left-0"
          >
            <div className="relative aspect-[4/5]">
              <Image src={storefrontProducePromoImage} alt="Fresh produce selection"
                fill sizes="170px" className="object-cover" />
            </div>
            <p className="py-2 text-center font-serif text-xs font-black italic text-[#155038]">Market fresh</p>
          </motion.div>
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, x: 34, rotate: 10 }}
            animate={{ opacity: 1, x: 0, rotate: 7 }}
            transition={{ duration: .8, delay: .82 }}
            className="absolute right-3 top-4 hidden w-[26%] max-w-[150px] overflow-hidden rounded-[22px] border-[5px] border-[#fff8e5] bg-white shadow-[0_20px_35px_rgba(0,0,0,.27)] sm:block lg:right-3 lg:top-[12%]"
          >
            <div className="relative aspect-[4/4]">
              <Image src={storefrontPantryPromoImage} alt="Pantry essentials" fill sizes="160px" className="object-cover" />
            </div>
            <p className="py-2 text-center font-serif text-xs font-black italic text-[#155038]">Pantry love</p>
          </motion.div>
          <div aria-hidden className="absolute right-5 top-1/2 hidden size-16 -translate-y-1/2 rotate-12 place-items-center rounded-full bg-[#f7cb6e] text-[#1d512f] shadow-xl sm:grid lg:right-1">
            <ArrowDownRight className="size-7" />
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/10 bg-[#062e22]/70 px-5 py-3.5 text-center text-[10px] font-extrabold uppercase tracking-[.15em] text-[#deebda] sm:text-xs sm:tracking-[.23em]">
        Fresh essentials <span aria-hidden className="mx-2 text-[#f5c576]">✦</span>
        Ghanaian favourites <span aria-hidden className="mx-2 text-[#f5c576]">✦</span>
        Everyday convenience
      </div>
    </section>
  );
}
