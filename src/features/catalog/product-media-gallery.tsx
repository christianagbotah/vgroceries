"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { CatalogMediaImage } from "@/services/contracts";

interface ProductMediaGalleryProps {
  productName: string;
  featuredImage?: CatalogMediaImage;
  gallery: CatalogMediaImage[];
  fallbackImage: string;
}

type DisplayMedia = CatalogMediaImage & { isLegacyFallback?: boolean };

export function ProductMediaGallery({ productName, featuredImage, gallery, fallbackImage }: ProductMediaGalleryProps) {
  const media = useMemo<DisplayMedia[]>(() => {
    const ordered: DisplayMedia[] = [];
    const seen = new Set<string>();

    if (featuredImage) {
      ordered.push(featuredImage);
      seen.add(featuredImage.id);
    }

    for (const item of gallery) {
      if (!seen.has(item.id)) {
        ordered.push(item);
        seen.add(item.id);
      }
    }

    if (!ordered.length) {
      ordered.push({
        id: `legacy:${productName}`,
        url: fallbackImage,
        altText: `${productName} product photo`,
        width: 1200,
        height: 1200,
        isLegacyFallback: true,
      });
    }

    return ordered;
  }, [fallbackImage, featuredImage, gallery, productName]);

  const [activeId, setActiveId] = useState(media[0].id);
  const active = media.find((item) => item.id === activeId) ?? media[0];

  return (
    <div className="space-y-3">
      <div className="relative aspect-[1.12/1] overflow-hidden rounded-2xl bg-[#f7f8f2]">
        <Image
          src={active.url}
          alt={active.altText || `${productName} grocery product photo`}
          fill
          priority
          unoptimized={!active.isLegacyFallback}
          sizes="(max-width:1024px) 100vw, 650px"
          className="product-detail-photo object-cover"
        />
      </div>

      {media.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" aria-label={`${productName} image gallery`}>
          {media.map((item, index) => {
            const selected = item.id === active.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`View ${productName} image ${index + 1}`}
                aria-pressed={selected}
                onClick={() => setActiveId(item.id)}
                className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary shadow-sm" : "border-transparent hover:border-primary/30"}`}
              >
                <Image
                  src={item.url}
                  alt=""
                  fill
                  unoptimized={!item.isLegacyFallback}
                  sizes="100px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        {featuredImage || gallery.length
          ? "Storefront photography is selected from approved product media."
          : "This product is using its legacy catalogue image until approved product media is published."}
      </p>
    </div>
  );
}
