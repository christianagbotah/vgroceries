"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/features/checkout/cart-store";
import { flyProductToCart } from "@/features/checkout/cart-motion";
import { WishlistButton } from "@/features/catalog/wishlist-button";
import { selectedPurchasableVariant } from "@/features/catalog/selected-purchasable-variant";
import type { CatalogProduct } from "@/services/client";
import { formatMoney } from "@/lib/money";
import { Check, ShoppingCart } from "lucide-react";

export function ProductTile({ product, priority }: { product: CatalogProduct; priority?: boolean }) {
  const { add } = useCart();
  const { toast } = useToast();
  const photoRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const available = product.variants.filter((v) => v.isAvailable);
  const [variantId, setVariantId] = useState(available[0]?.id ?? product.variants[0]?.id ?? "");
  const chosen = product.variants.find((v) => v.id === variantId);
  const purchasable = selectedPurchasableVariant(product.variants, variantId);
  const productImage = product.featuredImage?.url ?? product.image;

  const quickAdd = () => {
    // Do not add a different pack size when the selected SKU becomes unavailable.
    if (!purchasable) return;
    add({
      variantId: purchasable.id,
      productId: product.id,
      quantity: "1",
      name: `${product.name} — ${purchasable.name}`,
      image: productImage,
      priceMinor: purchasable.priceMinor,
    });
    flyProductToCart(addRef.current, photoRef.current?.querySelector("img"));
    toast({ title: "Added to cart", description: `${product.name} — ${purchasable.name}` });
  };

  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_4px_15px_rgba(0,0,0,.035)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_12px_28px_rgba(5,74,49,.10)]">
      <div ref={photoRef} className="product-card-photo relative aspect-[1.18/1] overflow-hidden bg-[#f8f8f4]">
        <Link href={`/products/${product.slug}`} className="absolute inset-0 focus-visible:outline-2" aria-label={`${product.name} — view details`}>
          <Image src={productImage} alt={product.featuredImage?.altText || `${product.name} product photo`} fill unoptimized={Boolean(product.featuredImage)} sizes="(max-width:640px) 50vw, (max-width:1024px) 25vw, 190px" className="object-cover transition-transform duration-300 group-hover:scale-[1.035]" priority={priority} />
        </Link>
        {purchasable?.compareAtPriceMinor ? <span className="absolute left-2 top-2 rounded-full bg-brand-amber px-2 py-1 text-[10px] font-black text-[color:var(--brand-green-deep)] shadow-sm">Offer</span> : null}
        {purchasable ? <WishlistButton
          compact
          className="absolute right-2 top-2"
          item={{ variantId: purchasable.id, productId: product.id, name: `${product.name} — ${purchasable.name}`, image: productImage, priceMinor: purchasable.priceMinor, slug: product.slug }}
        /> : null}
      </div>

      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
        <Link href={`/products/${product.slug}`} className="line-clamp-2 text-sm font-extrabold leading-snug tracking-[-0.01em] hover:text-primary hover:underline sm:text-[15px]">{product.name}</Link>

        {product.variants.length > 1 && available.length > 0 ? (
          <Select value={variantId} onValueChange={setVariantId} aria-label={`${product.name} variant`}>
            <SelectTrigger className="mt-2 h-11 min-h-11 w-full rounded-lg bg-muted/35 px-2 text-xs shadow-none sm:text-sm" size="sm"><SelectValue placeholder="Choose size" /></SelectTrigger>
            <SelectContent>{product.variants.map((v) => <SelectItem key={v.id} value={v.id} className="min-h-11" disabled={!v.isAvailable}>{v.name} · {v.priceLabel}{v.isAvailable ? "" : " (out of stock)"}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <p className="mt-1 truncate text-xs text-muted-foreground">{chosen?.name ?? "Choose an available size"}</p>
        )}

        <div className="mt-auto pt-2">
          <div className="mb-2 flex min-h-8 items-end gap-1.5">
            <p className="text-base font-black leading-none text-[color:var(--brand-green-deep)]">{chosen?.priceLabel ?? product.minPriceLabel}</p>
            {purchasable?.compareAtPriceMinor ? <p className="text-[10px] leading-none text-muted-foreground line-through">{formatMoney(purchasable.compareAtPriceMinor)}</p> : null}
          </div>
          {available.length > 0 && !purchasable ? (
            <p role="status" className="mb-2 text-xs font-medium text-amber-800">Selected size unavailable. Choose another available size.</p>
          ) : null}
          {purchasable ? (
            <Button ref={addRef} className="h-11 w-full rounded-xl text-xs font-extrabold sm:text-sm" onClick={quickAdd} aria-label={`Add ${product.name} (${purchasable.name}) to cart`}>
              <ShoppingCart className="size-3.5" /> Add to cart
            </Button>
          ) : (
            <Button variant="outline" className="h-11 w-full rounded-xl" disabled>{available.length ? "Choose available size" : "Sold out"}</Button>
          )}
        </div>
      </div>
    </article>
  );
}

export function TileCheck() {
  return <Check className="size-4" aria-hidden />;
}
