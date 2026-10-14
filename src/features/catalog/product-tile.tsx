"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/features/checkout/cart-store";
import type { CatalogProduct } from "@/services/client";
import { formatMoney } from "@/lib/money";
import { Check, Heart, ShoppingCart, Star } from "lucide-react";

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
    toast({ title: "Added to cart", description: `${product.name} — ${chosen.name}` });
  };

  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_4px_15px_rgba(0,0,0,.035)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_12px_28px_rgba(5,74,49,.10)]">
      <div className="product-card-photo relative aspect-[1.18/1] overflow-hidden bg-[#f8f8f4]">
        <Link href={`/products/${product.slug}`} className="absolute inset-0 focus-visible:outline-2" aria-label={`${product.name} — view details`}>
          <Image src={product.image} alt={`${product.name} product photo`} fill sizes="(max-width:640px) 50vw, (max-width:1024px) 25vw, 190px" className="object-cover transition-transform duration-300 group-hover:scale-[1.035]" priority={priority} />
        </Link>
        {chosen?.compareAtPriceMinor ? <span className="absolute left-2 top-2 rounded-full bg-brand-amber px-2 py-1 text-[10px] font-black text-[color:var(--brand-green-deep)] shadow-sm">Offer</span> : null}
        <Button asChild variant="secondary" size="icon" className="absolute right-2 top-2 size-8 rounded-full bg-white/90 shadow-sm backdrop-blur hover:bg-white" aria-label={`Wishlist ${product.name}`}>
          <Link href="/account/lists"><Heart className="size-4" /></Link>
        </Button>
      </div>

      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-brand-amber" aria-label="Popular product preview">
          <Star className="size-3 fill-current" /><Star className="size-3 fill-current" /><Star className="size-3 fill-current" /><Star className="size-3 fill-current" /><Star className="size-3 fill-current" />
          <span className="ml-0.5 text-muted-foreground">demo</span>
        </div>
        <Link href={`/products/${product.slug}`} className="line-clamp-2 text-[13px] font-extrabold leading-snug tracking-[-0.01em] hover:text-primary hover:underline sm:text-sm">{product.name}</Link>

        {product.variants.length > 1 && available.length > 0 ? (
          <Select value={variantId} onValueChange={setVariantId} aria-label={`${product.name} variant`}>
            <SelectTrigger className="mt-2 h-8 w-full rounded-lg bg-muted/35 px-2 text-[11px] shadow-none" size="sm"><SelectValue placeholder="Choose size" /></SelectTrigger>
            <SelectContent>{product.variants.map((v) => <SelectItem key={v.id} value={v.id} disabled={!v.isAvailable}>{v.name} · {v.priceLabel}{v.isAvailable ? "" : " (out of stock)"}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{chosen?.name ?? product.variants[0]?.name}</p>
        )}

        <div className="mt-auto pt-2">
          <div className="mb-2 flex min-h-8 items-end gap-1.5">
            <p className="text-base font-black leading-none text-[color:var(--brand-green-deep)]">{chosen?.priceLabel ?? product.minPriceLabel}</p>
            {chosen?.compareAtPriceMinor ? <p className="text-[10px] leading-none text-muted-foreground line-through">{formatMoney(chosen.compareAtPriceMinor)}</p> : null}
          </div>
          {chosen?.isAvailable ? (
            <Button className="h-9 w-full rounded-xl text-[11px] font-extrabold sm:text-xs" onClick={quickAdd} aria-label={`Add ${product.name} (${chosen.name}) to cart`}>
              <ShoppingCart className="size-3.5" /> Add to cart
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-9 w-full rounded-xl" disabled>Sold out</Button>
          )}
        </div>
      </div>
    </article>
  );
}

export function TileCheck() {
  return <Check className="size-4" aria-hidden />;
}
