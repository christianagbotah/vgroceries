"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { QuantityInput } from "@/components/shared/quantity-input";
import { useCart } from "@/features/checkout/cart-store";
import { flyProductToCart } from "@/features/checkout/cart-motion";
import type { CatalogProduct, CatalogVariant } from "@/services/client";
import { ShoppingCart, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Variant selection, price, quantity and current availability.
 * A saved link to a sold-out product shows a clear unavailable state
 * with purchasing disabled.
 */
export function ProductPurchasePanel({ product, onAdded }: { product: CatalogProduct; onAdded?: () => void }) {
  const available = product.variants.filter((v) => v.isAvailable);
  const [variantId, setVariantId] = useState(available[0]?.id ?? product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const { add } = useCart();
  const reducedMotion = useReducedMotion();
  const addRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const variant = product.variants.find((v) => v.id === variantId);
  const isAvailable = !!variant?.isAvailable;

  const addToCart = () => {
    if (!variant || !isAvailable) return;
    add({
      variantId: variant.id,
      productId: product.id,
      quantity,
      name: `${product.name} — ${variant.name}`,
      image: product.featuredImage?.url ?? product.image,
      priceMinor: variant.priceMinor,
    });
    const localImage = panelRef.current?.closest("[data-vg-quicklook-root]")
      ?.querySelector<HTMLImageElement>("[data-vg-product-hero] img");
    flyProductToCart(addRef.current,
      localImage ?? document.querySelector<HTMLImageElement>("[data-vg-product-hero] img"));
    onAdded?.();
  };

  return (
    <div ref={panelRef} className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-primary/15 bg-white/75 p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-primary">Your selected pack</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={variantId}
            initial={reducedMotion ? false : { opacity: 0, y: 9 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: reducedMotion ? 0 : .22 }}
            className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-base font-bold">{variant?.name ?? "Choose a pack"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{variant?.isAvailable ? "Ready to add · Final availability checked at checkout" : "Currently unavailable"}</p>
            </div>
            <p className="font-serif text-3xl font-black text-[color:var(--brand-green-deep)]">{variant?.priceLabel ?? "—"}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Choose an option</legend>
        <RadioGroup
          value={variantId}
          onValueChange={(next) => { setVariantId(next); setQuantity("1"); }}
          className="grid gap-2"
          aria-label={`${product.name} variants`}
        >
          {product.variants.map((v: CatalogVariant) => (
            <Label
              key={v.id}
              data-clickable
              htmlFor={`variant-${v.id}`}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 font-normal transition-colors",
                "hover:border-primary/50 focus-within:border-primary",
                variantId === v.id && "border-primary bg-primary/5",
                !v.isAvailable && "cursor-not-allowed opacity-60"
              )}
            >
              <span className="flex items-center gap-3">
                <RadioGroupItem value={v.id} id={`variant-${v.id}`} disabled={!v.isAvailable} />
                <span>
                  <span className="block text-sm font-medium">{v.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {v.isAvailable ? `${v.availableToSell} available to sell` : "Out of stock"}
                    {v.purchaseUnit ? ` · 1 ${v.purchaseUnit.altUnit} = ${v.purchaseUnit.factor}` : ""}
                  </span>
                </span>
              </span>
              <span className="text-right">
                <span className="block font-bold text-primary">{v.priceLabel}</span>
                {v.compareAtPriceMinor ? (
                  <span className="block text-xs text-muted-foreground line-through">{v.compareAtLabel}</span>
                ) : null}
              </span>
            </Label>
          ))}
        </RadioGroup>
      </fieldset>

      {isAvailable && variant ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <QuantityInput
              value={quantity}
              onChange={setQuantity}
              max={variant.availableToSell}
              unit={variant.unit}
              ariaLabel={`Quantity of ${product.name} ${variant.name}`}
            />
            <Button ref={addRef} size="lg" className="h-12 flex-1 min-w-40" onClick={addToCart}>
              <ShoppingCart className="size-5" aria-hidden /> Add to cart
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Stock is re-checked again at checkout — adding to the cart does not reserve items.
          </p>
        </div>
      ) : (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Currently unavailable.</strong> This item is sold out or its stock is fully
            reserved. Purchasing is disabled — check back after the next stock delivery.
          </p>
        </div>
      )}
    </div>
  );
}
