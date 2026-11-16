"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Images, Leaf, ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { CatalogProduct } from "@/services/contracts";
import { ProductPurchasePanel } from "@/features/catalog/product-purchase-panel";
import { assembleProductMedia } from "@/features/catalog/product-media-gallery";

type QuickLookProps = {
  product: CatalogProduct;
  open: boolean;
  onOpenChange: (next: boolean) => void;
};

/**
 * An accessible, source-only preview of the EXACT catalogue SKU data.
 * No invented images, inventory mutations, account data, payment APIs,
 * or alternative cart implementation.
 */
export function ProductQuickLook({ product, open, onOpenChange }: QuickLookProps) {
  const media = assembleProductMedia(product.name, product.featuredImage,
    product.gallery, product.image);
  const [activeId, setActiveId] = useState(media[0].id);
  const [direction, setDirection] = useState(1);
  const reduced = useReducedMotion();
  const touchX = useRef<number | null>(null);
  const purchaseRef = useRef<HTMLDivElement>(null);
  const currentIndex = Math.max(0, media.findIndex(x => x.id === activeId));
  const active = media[currentIndex];

  const choose = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= media.length || nextIndex === currentIndex) return;
    setDirection(nextIndex > currentIndex ? 1 : -1);
    setActiveId(media[nextIndex].id);
  };
  const step = (delta: number) => choose((currentIndex + delta + media.length) % media.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          data-vg-quicklook-root
          className="flex max-h-[94dvh] w-[min(96vw,1050px)] max-w-[1050px] flex-col gap-0 overflow-hidden rounded-3xl border-0 bg-[#f6f8f1] p-0 shadow-[0_28px_90px_rgba(7,42,25,.3)] sm:max-w-[1050px] motion-reduce:duration-0 [&>button]:z-30 [&>button]:rounded-full [&>button]:bg-white [&>button]:p-1.5"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,.97fr)_minmax(0,1.03fr)]">
            <div className="min-w-0 bg-[radial-gradient(ellipse_at_45%_26%,white_5%,#eaf2e4_72%,#e3eddc_100%)] px-4 pb-5 pt-10 sm:px-7 sm:pb-7 sm:pt-8">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-[#246747]">
                <Images className="size-4" aria-hidden /> Product gallery
                <span className="ml-auto rounded-full bg-white/80 px-3 py-1 text-[10px] tracking-normal">
                  {currentIndex + 1} / {media.length}
                </span>
              </div>
              <div
                data-vg-product-hero
                role="group" tabIndex={0}
                aria-label={product.name + " image " + (currentIndex + 1) + " of " + media.length +
                  ". Use arrow keys or swipe to view more."}
                onKeyDown={(event) => {
                  if (media.length < 2) return;
                  if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
                  if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
                }}
                onTouchStart={(event) => { touchX.current = event.touches[0]?.clientX ?? null; }}
                onTouchEnd={(event) => {
                  if (touchX.current === null || media.length < 2) return;
                  const distance = (event.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
                  touchX.current = null;
                  if (Math.abs(distance) >= 45) step(distance < 0 ? 1 : -1);
                }}
                className="relative isolate aspect-[1.12/1] overflow-hidden rounded-[28px] border border-white/90 bg-white/55 shadow-[0_12px_35px_rgba(10,72,38,.09)] sm:aspect-[1.05/1]"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={active.id}
                    initial={reduced ? false : { opacity: 0, x: direction * 35, scale: 1.04 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={reduced ? undefined : { opacity: 0, x: -direction * 25, scale: .97 }}
                    transition={{ duration: reduced ? 0 : .32, ease: [.2, .75, .2, 1] }}
                    className="absolute inset-0 block"
                  >
                    <Image
                      src={active.url}
                      alt={active.altText || product.name + " product photo"}
                      fill
                      sizes="(max-width:1024px) 90vw, 500px"
                      unoptimized={!active.isLegacyFallback}
                      className="object-contain p-3 sm:p-5"
                    />
                  </motion.span>
                </AnimatePresence>
                {media.length > 1 ? (
                  <>
                    <button type="button" aria-label="Previous product image"
                      onClick={() => step(-1)}
                      className="absolute left-2 top-1/2 z-20 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-[#e5eddf] bg-white/90 text-[#134d30] shadow-md focus-visible:outline-2 focus-visible:outline-primary">
                      <ChevronLeft className="size-5" aria-hidden />
                    </button>
                    <button type="button" aria-label="Next product image"
                      onClick={() => step(1)}
                      className="absolute right-2 top-1/2 z-20 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-[#e5eddf] bg-white/90 text-[#134d30] shadow-md focus-visible:outline-2 focus-visible:outline-primary">
                      <ChevronRight className="size-5" aria-hidden />
                    </button>
                  </>
                ) : (
                  <span className="absolute bottom-3 left-3 rounded-full bg-white/85 px-3 py-2 text-xs font-semibold text-[#315e40]">
                    <ZoomIn className="mr-1 inline size-4" aria-hidden />
                    {active.isLegacyFallback ? "Catalogue image" : "Single approved photo"}
                  </span>
                )}
              </div>
              {media.length > 1 ? (
                <div className="mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2" aria-label="Product gallery thumbnails">
                  {media.map((item, i) => (
                    <button key={item.id} type="button"
                      onClick={() => choose(i)}
                      aria-label={"Show " + product.name + " image " + (i + 1)}
                      aria-pressed={active.id === item.id}
                      className={"relative aspect-square w-[69px] shrink-0 snap-start overflow-hidden rounded-xl border-2 bg-white transition-all focus-visible:outline-2 focus-visible:outline-primary " +
                        (active.id === item.id ? "border-[#197446] shadow-md" : "border-transparent hover:border-[#94ba9c]")}>
                      <Image src={item.url} alt="" fill unoptimized={!item.isLegacyFallback}
                        sizes="75px" className="object-contain p-1" />
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-xs text-[#5d7764]">
                {active.isLegacyFallback
                  ? "A catalogue placeholder is shown. Verify exact packaging before purchase."
                  : "Only approved product photographs are shown. Exact physical packaging takes priority."}
              </p>
            </div>

            <div className="min-w-0 space-y-4 px-5 pb-7 pt-9 sm:px-8 sm:pb-8 sm:pt-8 lg:overflow-y-auto">
              <div className="pr-7">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.16em] text-[#287246]">
                  <Leaf className="size-4" aria-hidden /> {product.categoryName ?? "Fresh essentials"}
                </p>
                <DialogTitle className="mt-3 font-serif text-3xl font-black leading-tight tracking-[-.04em] text-[#103d2c] sm:text-4xl">
                  {product.name}
                </DialogTitle>
                <DialogDescription className="mt-3 text-sm leading-6 text-[#5b705e]">
                  {product.shortDescription || "Choose an available pack and quantity for your basket."}
                </DialogDescription>
              </div>

              <div ref={purchaseRef} className="scroll-mt-5 rounded-2xl border border-[#dae9d5] bg-white p-3.5 shadow-[0_6px_24px_rgba(12,63,32,.04)] sm:p-4">
                <ProductPurchasePanel product={product} onAdded={() => onOpenChange(false)} />
              </div>

              <div className="space-y-2 rounded-xl bg-[#eaf2e6] p-4">
                <p className="text-xs font-black uppercase tracking-[.08em] text-[#2e6c48]">A closer look</p>
                <p className="line-clamp-4 text-sm leading-6 text-[#3a6146]">
                  {product.description || product.shortDescription}
                </p>
                <p className="text-xs leading-5 text-[#627664]">
                  For allergens and ingredients, verify the label on the physical package.
                </p>
              </div>

              <Link href={"/products/" + encodeURIComponent(product.slug)}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-[#126b41] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                See full product details <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#dce6d7] bg-white/95 px-4 py-3 shadow-[0_-8px_25px_rgba(14,62,37,.08)] backdrop-blur lg:hidden">
            <div>
              <p className="text-xs font-extrabold text-[#144a32]">{product.anyAvailable ? "Choose your pack" : "Check available options"}</p>
              <p className="text-[10px] text-[#667b6a]">Final price checked at checkout</p>
            </div>
            <button type="button"
              onClick={() => purchaseRef.current?.scrollIntoView({
                behavior: reduced ? "auto" : "smooth", block: "start",
              })}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-[#0c5938] px-4 text-xs font-black text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              View pack sizes <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
