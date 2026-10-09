"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/features/checkout/cart-store";
import type { CatalogProduct } from "@/services/client";
import { formatMoney } from "@/lib/money";
import { Check, Plus } from "lucide-react";

/**
 * Product tile used in storefront grids. Two columns on small phones,
 * expanding on larger screens. Quick-add uses the first available
 * variant; the product page handles full variant choice.
 */
export function ProductTile({ product, priority }: { product: CatalogProduct; priority?: boolean }) {
  const { add } = useCart();
  const { toast } = useToast();
  const available = product.variants.filter((v) => v.isAvailable);
  const [variantId, setVariantId] = useState(available[0]?.id ?? product.variants[0]?.id ?? "");

  const chosen = product.variants.find((v) => v.id === variantId) ?? available[0];

  const quickAdd = () => {
    if (!chosen?.isAvailable) return;
    add({
      variantId: chosen.id,
      productId: product.id,
      quantity: "1",
      name: `${product.name} — ${chosen.name}`,
      image: product.image,
      priceMinor: chosen.priceMinor,
    });
    toast({
      title: "Added to cart",
      description: `${product.name} — ${chosen.name}`,
    });
  };

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <Link
        href={`/products/${product.slug}`}
        className="relative block aspect-[5/4] overflow-hidden bg-muted focus-visible:outline-2"
        aria-label={`${product.name} — view details`}
      >
        <Image
          src={product.image}
          alt={`${product.name} product tile`}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          priority={priority}
        />
        {chosen?.compareAtPriceMinor ? (
          <span className="absolute left-2 top-2 rounded-full bg-brand-amber px-2 py-0.5 text-xs font-bold text-primary-foreground">
            Offer
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link href={`/products/${product.slug}`} className="font-medium leading-snug hover:underline focus-visible:underline">
          {product.name}
        </Link>

        {product.variants.length > 1 && available.length > 0 ? (
          <Select value={variantId} onValueChange={setVariantId} aria-label={`${product.name} variant`}>
            <SelectTrigger className="h-9 w-full text-sm" size="sm">
              <SelectValue placeholder="Choose size" />
            </SelectTrigger>
            <SelectContent>
              {product.variants.map((v) => (
                <SelectItem key={v.id} value={v.id} disabled={!v.isAvailable}>
                  {v.name} · {v.priceLabel}
                  {v.isAvailable ? "" : " (out of stock)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">{chosen?.name ?? product.variants[0]?.name}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="leading-tight">
            <p className="font-bold text-primary">{chosen?.priceLabel ?? product.minPriceLabel}</p>
            {chosen?.compareAtPriceMinor ? (
              <p className="text-xs text-muted-foreground line-through">{formatMoney(chosen.compareAtPriceMinor)}</p>
            ) : null}
          </div>
          {chosen?.isAvailable ? (
            <Button
              size="sm"
              className="h-10 min-w-10 px-3"
              onClick={quickAdd}
              aria-label={`Add ${product.name} (${chosen.name}) to cart`}
            >
              <Plus className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only sm:ml-1">Add</span>
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-10" disabled>
              Sold out
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Compact horizontal line used on the cart page and order summaries. */
export function TileCheck() {
  return <Check className="size-4" aria-hidden />;
}
