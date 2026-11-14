"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/features/checkout/cart-store";
import { WishlistButton } from "@/features/catalog/wishlist-button";
import { apiOps, type CatalogProduct } from "@/services/client";
import { formatMoney } from "@/lib/money";
import { Check, ShoppingCart, Star } from "lucide-react";
import { cmpQty, subQty } from "@/lib/quantity";

export function ProductTile({ product, priority }: { product: CatalogProduct; priority?: boolean }) {
  const { add } = useCart();
  const { toast } = useToast();
  const available = product.variants.filter((v) => v.isAvailable);
  const [variantId, setVariantId] = useState(available[0]?.id ?? product.variants[0]?.id ?? "");
  const [liveQuantities, setLiveQuantities] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const original = product.variants.find((v) => v.id === variantId) ?? available[0];
  const knownQty = original ? liveQuantities[original.id] ?? original.availableToSell : "0";
  const chosen = original ? { ...original, availableToSell: knownQty, isAvailable: cmpQty(knownQty, "0") > 0 } : undefined;
  const inCart = useCart((state) => state.lines.find((line) => line.variantId === chosen?.id)?.quantity ?? "0");
  const remaining = chosen ? subQty(chosen.availableToSell, inCart) : "0";
  const minimum = chosen && ["kg", "litre"].includes(chosen.unit) ? "0.001" : "1";
  const stockRemaining = chosen?.isAvailable && cmpQty(remaining, minimum) >= 0;
  const isLowStock = chosen && chosen.isAvailable && cmpQty(chosen.availableToSell, "3") <= 0;
  const productImage = product.featuredImage?.url ?? product.image;

  const quickAdd = async () => {
    if (!chosen || !stockRemaining || adding) return;
    setAdding(true);
    try {
      // Refresh this exact SKU before add: another shopper may have reserved
      // it after this catalogue tile was server-rendered.
      const products = await apiOps.byVariants([chosen.id]);
      const fresh = products.flatMap((item) => item.variants).find((item) => item.id === chosen.id);
      const latestQty = fresh?.isAvailable ? fresh.availableToSell : "0";
      setLiveQuantities((current) => ({ ...current, [chosen.id]: latestQty }));
      const alreadyInCart = useCart.getState().lines.find((line) => line.variantId === chosen.id)?.quantity ?? "0";
      const nowRemaining = subQty(latestQty, alreadyInCart);
      const quantity = ["kg", "litre"].includes(chosen.unit) && cmpQty(nowRemaining, "1") < 0 ? nowRemaining : "1";
      if (cmpQty(quantity, minimum) < 0) {
        toast({ title: "Stock limit reached", description: `Only ${latestQty} available, including ${alreadyInCart} already in your cart.`, variant: "destructive" });
        return;
      }
      const accepted = add({
        variantId: chosen.id,
        productId: product.id,
        quantity,
        name: `${product.name} — ${chosen.name}`,
        image: productImage,
        priceMinor: fresh?.priceMinor ?? chosen.priceMinor,
      }, latestQty);
      toast(accepted
        ? { title: "Added to cart", description: `${quantity} × ${product.name} — ${chosen.name}` }
        : { title: "Stock limit reached", description: `Only ${latestQty} available for this option.`, variant: "destructive" });
    } catch {
      toast({ title: "Could not verify stock", description: "Please try again before adding this item.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_4px_15px_rgba(0,0,0,.035)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_12px_28px_rgba(5,74,49,.10)]">
      <div className="product-card-photo relative aspect-[1.18/1] overflow-hidden bg-[#f8f8f4]">
        <Link href={`/products/${product.slug}`} className="absolute inset-0 focus-visible:outline-2" aria-label={`${product.name} — view details`}>
          <Image src={productImage} alt={product.featuredImage?.altText || `${product.name} product photo`} fill unoptimized={Boolean(product.featuredImage)} sizes="(max-width:640px) 50vw, (max-width:1024px) 25vw, 190px" className="object-cover transition-transform duration-300 group-hover:scale-[1.035]" priority={priority} />
        </Link>
        {chosen?.compareAtPriceMinor ? <span className="absolute left-2 top-2 rounded-full bg-brand-amber px-2 py-1 text-[10px] font-black text-[color:var(--brand-green-deep)] shadow-sm">Offer</span> : null}
        {chosen ? <WishlistButton
          compact
          className="absolute right-2 top-2"
          item={{ variantId: chosen.id, productId: product.id, name: `${product.name} — ${chosen.name}`, image: productImage, priceMinor: chosen.priceMinor, slug: product.slug }}
        /> : null}
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
            <SelectContent>{product.variants.map((v) => <SelectItem key={v.id} value={v.id} disabled={cmpQty(liveQuantities[v.id] ?? v.availableToSell, "0") <= 0}>{v.name} · {v.priceLabel}{cmpQty(liveQuantities[v.id] ?? v.availableToSell, "0") > 0 ? "" : " (out of stock)"}</SelectItem>)}</SelectContent>
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
            <>
              <p className={`mb-2 text-[11px] font-bold ${isLowStock ? "text-amber-700" : "text-muted-foreground"}`} aria-live="polite">
                {isLowStock ? `Only ${chosen.availableToSell} left` : `${chosen.availableToSell} in stock`}
                {cmpQty(inCart, "0") > 0 ? ` · ${inCart} in your cart` : ""}
              </p>
            <Button disabled={!stockRemaining || adding} className="h-9 w-full rounded-xl text-[11px] font-extrabold sm:text-xs" onClick={quickAdd} aria-label={`Add ${product.name} (${chosen.name}) to cart`}>
              <ShoppingCart className="size-3.5" /> {adding ? "Checking stock…" : stockRemaining ? "Add to cart" : "Stock limit reached"}
            </Button>
            </>
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
