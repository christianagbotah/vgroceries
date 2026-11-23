"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import type { CatalogMediaImage } from "@/services/contracts";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface ProductMediaGalleryProps {
  productName: string;
  featuredImage?: CatalogMediaImage;
  gallery?: CatalogMediaImage[];
  fallbackImage: string;
}
type DisplayMedia = CatalogMediaImage & { isLegacyFallback?: boolean };

export function assembleProductMedia(
  productName: string,
  featuredImage: CatalogMediaImage | undefined,
  gallery: CatalogMediaImage[] | undefined,
  fallbackImage: string,
): DisplayMedia[] {
  const seen = new Set<string>();
  const ordered: DisplayMedia[] = [];
  for (const item of [featuredImage, ...(gallery ?? [])]) {
    if (!item || seen.has(item.id)) continue;
    ordered.push(item);
    seen.add(item.id);
  }
  if (!ordered.length) ordered.push({
    id: "legacy:" + productName,
    url: fallbackImage,
    altText: productName + " product photo",
    width: 1200, height: 1200, isLegacyFallback: true,
  });
  return ordered;
}

/**
 * Accessible image storytelling with actual approved SKU photography.
 * It never invents product angles or misrepresents the physical pack.
 */
export function ProductMediaGallery({
  productName, featuredImage, gallery, fallbackImage,
}: ProductMediaGalleryProps) {
  const media = useMemo(() =>
    assembleProductMedia(productName, featuredImage, gallery, fallbackImage),
  [productName, featuredImage, gallery, fallbackImage]);
  const [activeId, setActiveId] = useState(media[0].id);
  const [direction, setDirection] = useState(1);
  const [zoomPoint, setZoomPoint] = useState<{x:number;y:number}|null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchX = useRef<number | null>(null);
  const suppressTap = useRef(false);
  const reducedMotion = useReducedMotion();
  const activeIndex = Math.max(0, media.findIndex(item => item.id === activeId));
  const active = media[activeIndex];

  function choose(index: number) {
    if (index === activeIndex || index < 0 || index >= media.length) return;
    setDirection(index > activeIndex ? 1 : -1);
    setActiveId(media[index].id);
  }
  function step(offset: number) {
    choose((activeIndex + offset + media.length) % media.length);
  }
  const movement = reducedMotion ? 0 : direction * 55;

  return (
    <div className="space-y-3" aria-label={productName + " photographs"}>
      <div
        data-vg-product-hero
        className="relative isolate aspect-[1.08/1] overflow-hidden rounded-[24px] border border-[#e9efe7] bg-[radial-gradient(ellipse_at_50%_25%,#fff_0%,#f3f7ee_57%,#e9f0e4_100%)] sm:aspect-[1.12/1]"
        onMouseMove={(event) => { if (event.pointerType === undefined) { const r=event.currentTarget.getBoundingClientRect(); setZoomPoint({x:((event.clientX-r.left)/r.width)*100,y:((event.clientY-r.top)/r.height)*100}); } }}
        onMouseLeave={() => setZoomPoint(null)}
        tabIndex={0}
        role="group"
        aria-label={productName + ": image " + (activeIndex + 1) + " of " + media.length + ". Use arrow keys to change images."}
        onKeyDown={(event) => {
          if (media.length < 2) return;
          if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
          if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
        }}
        onTouchStart={(event) => { touchX.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          if (touchX.current === null || media.length < 2) return;
          const distance = (event.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
          touchX.current = null;
          if (Math.abs(distance) > 45) {
            suppressTap.current = true;
            step(distance < 0 ? 1 : -1);
          }
        }}
      >
        <div aria-hidden className="pointer-events-none absolute -left-10 bottom-0 size-40 rounded-full bg-[#cfe3bd]/35 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-4 top-0 size-40 rounded-full bg-[#f5c36a]/15 blur-3xl" />
        <button type="button"
          className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-5px] focus-visible:outline-primary"
          aria-label={"Enlarge " + productName + " image " + (activeIndex + 1)}
          onClick={() => {
            if (suppressTap.current) { suppressTap.current = false; return; }
            setLightboxOpen(true);
          }}
        >
          <AnimatePresence initial={false} custom={movement} mode="popLayout">
            <motion.span
              key={active.id}
              custom={movement}
              initial={reducedMotion ? false : { opacity: 0, x: movement, scale: 1.035 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, x: -movement * .5, scale: .985 }}
              transition={{ duration: reducedMotion ? 0 : .42, ease: [.2, .75, .2, 1] }}
              className="absolute inset-0 block"
            >
              <Image src={active.url} alt={active.altText || productName + " product image"} fill
                priority={activeIndex === 0} unoptimized={!active.isLegacyFallback}
                sizes="(max-width:1024px) 100vw, 650px"
                className="object-contain p-2 transition-transform duration-300 sm:p-3"
                style={zoomPoint && !reducedMotion ? {transform:"scale(1.8)",transformOrigin:`${zoomPoint.x}% ${zoomPoint.y}%`} : undefined}
              />
            </motion.span>
          </AnimatePresence>

        </button>
        <span aria-hidden className="absolute left-3 top-3 z-20 inline-flex items-center gap-1 rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-bold text-[#244c37] shadow-sm backdrop-blur">
          <Images className="size-3" /> {String(activeIndex + 1).padStart(2, "0")} / {String(media.length).padStart(2, "0")}
        </span>
        {media.length > 1 ? <>
          <button type="button" aria-label="Previous product photo" onClick={() => step(-1)}
            className="absolute left-3 top-1/2 z-20 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/75 bg-white/88 text-[#174b30] shadow-md backdrop-blur transition hover:-translate-x-0.5 hover:bg-white focus-visible:outline-2 focus-visible:outline-primary">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" aria-label="Next product photo" onClick={() => step(1)}
            className="absolute right-3 top-1/2 z-20 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/75 bg-white/88 text-[#174b30] shadow-md backdrop-blur transition hover:translate-x-0.5 hover:bg-white focus-visible:outline-2 focus-visible:outline-primary">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </> : null}
      </div>

      <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2" aria-label={productName + " gallery thumbnails"}>
          {media.map((item, index) => {
            const selected = item.id === active.id;
            return (
              <button key={item.id} type="button"
                aria-label={"View " + productName + " image " + (index + 1)}
                aria-pressed={selected}
                onClick={() => choose(index)}
                onMouseEnter={() => choose(index)}
                className={
                  "relative aspect-square w-[73px] shrink-0 snap-start overflow-hidden rounded-2xl border-2 bg-[#f5f8f0] transition-all duration-300 focus-visible:outline-2 focus-visible:outline-primary sm:w-[88px] " +
                  (selected ? "scale-[.96] border-[#1d7047] shadow-[0_6px_18px_rgba(18,93,56,.18)]" : "border-transparent hover:scale-[.97] hover:border-[#82b99b]")
                }>
                <Image src={item.url} alt="" fill
                  unoptimized={!item.isLegacyFallback} sizes="90px" className="object-contain p-1" />
              </button>
            );
          })}
        </div>
      <p className="px-1 text-xs leading-relaxed text-muted-foreground" aria-live="polite">
        {featuredImage || (gallery?.length ?? 0) > 0
          ? "Showing approved product photography. Swipe, use the arrows, or enlarge to inspect details."
          : "This product is showing its catalogue image until additional approved photos are available."}
      </p>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-h-[95dvh] max-w-[min(96vw,1050px)] overflow-hidden border-none bg-[#f5f7f1] p-3 sm:p-6">
          <DialogTitle className="pr-10 text-lg font-bold">{productName}</DialogTitle>
          <DialogDescription>
            Product photograph {activeIndex + 1} of {media.length}. Use the navigation below to inspect approved photos.
          </DialogDescription>
          <div className="relative h-[min(67dvh,690px)] w-full rounded-2xl bg-white">
            <Image src={active.url} alt={active.altText || productName} fill
              unoptimized={!active.isLegacyFallback}
              sizes="(max-width:900px) 90vw, 900px" className="object-contain p-3" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="flex min-h-11 items-center gap-1 rounded-full border px-4 text-sm font-semibold disabled:opacity-40"
              onClick={() => step(-1)} disabled={media.length < 2}>
              <ChevronLeft className="size-4" /> Previous
            </button>
            <span className="text-xs font-bold tabular-nums">{activeIndex + 1} / {media.length}</span>
            <button type="button" className="flex min-h-11 items-center gap-1 rounded-full border px-4 text-sm font-semibold disabled:opacity-40"
              onClick={() => step(1)} disabled={media.length < 2}>
              Next <ChevronRight className="size-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
