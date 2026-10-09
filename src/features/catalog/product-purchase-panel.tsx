"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { QuantityInput } from "@/components/shared/quantity-input";
import { useCart } from "@/features/checkout/cart-store";
import { useToast } from "@/hooks/use-toast";
import type { CatalogProduct, CatalogVariant } from "@/services/client";
import { ShoppingCart, TriangleAlert } from "lucide-react";
import { formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";

/**
 * Variant selection, price, quantity and current availability.
 * A saved link to a sold-out product shows a clear unavailable state
 * with purchasing disabled.
 */
export function ProductPurchasePanel({ product }: { product: CatalogProduct }) {
  const available = product.variants.filter((v) => v.isAvailable);
  const [variantId, setVariantId] = useState(available[0]?.id ?? product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const { add } = useCart();
  const { toast } = useToast();

  const variant = product.variants.find((v) => v.id === variantId);
  const isAvailable = !!variant?.isAvailable;

  const addToCart = () => {
    if (!variant || !isAvailable) return;
    add({
      variantId: variant.id,
      productId: product.id,
      quantity,
      name: `${product.name} — ${variant.name}`,
      image: product.image,
      priceMinor: variant.priceMinor,
    });
    toast({
      title: "Added to cart",
      description: `${formatQty(quantity)} × ${product.name} — ${variant.name}`,
    });
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Choose an option</legend>
        <RadioGroup
          value={variantId}
          onValueChange={setVariantId}
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
            <Button size="lg" className="h-12 flex-1 min-w-40" onClick={addToCart}>
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
