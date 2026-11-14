"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { QuantityInput } from "@/components/shared/quantity-input";
import { useCart } from "@/features/checkout/cart-store";
import { useToast } from "@/hooks/use-toast";
import { apiOps, type CatalogProduct, type CatalogVariant } from "@/services/client";
import { ShoppingCart, TriangleAlert } from "lucide-react";
import { cmpQty, formatQty, subQty } from "@/lib/quantity";
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
  const [liveQuantities, setLiveQuantities] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const { add } = useCart();
  const { toast } = useToast();

  const original = product.variants.find((v) => v.id === variantId);
  const refreshedQty = original ? liveQuantities[original.id] ?? original.availableToSell : "0";
  const variant = original ? { ...original, availableToSell: refreshedQty, isAvailable: cmpQty(refreshedQty, "0") > 0 } : undefined;
  const isAvailable = !!variant?.isAvailable;
  const inCart = useCart((state) => state.lines.find((item) => item.variantId === variant?.id)?.quantity ?? "0");
  const remaining = variant ? subQty(variant.availableToSell, inCart) : "0";
  const minimum = variant && ["kg", "litre"].includes(variant.unit) ? "0.001" : "1";
  const selectedQuantity = cmpQty(quantity, remaining) > 0 ? remaining : quantity;
  const canAdd = isAvailable && cmpQty(remaining, minimum) >= 0 &&
    cmpQty(selectedQuantity, minimum) >= 0 && cmpQty(selectedQuantity, remaining) <= 0;

  const addToCart = async () => {
    if (!variant || !canAdd || adding) return;
    setAdding(true);
    try {
      const products = await apiOps.byVariants([variant.id]);
      const fresh = products.flatMap((item) => item.variants).find((item) => item.id === variant.id);
      const latestQty = fresh?.isAvailable ? fresh.availableToSell : "0";
      setLiveQuantities((current) => ({ ...current, [variant.id]: latestQty }));
      const alreadyInCart = useCart.getState().lines.find((line) => line.variantId === variant.id)?.quantity ?? "0";
      const latestRemaining = subQty(latestQty, alreadyInCart);
      if (cmpQty(selectedQuantity, minimum) < 0 || cmpQty(selectedQuantity, latestRemaining) > 0) {
        toast({ title: "Quantity exceeds available stock", description: `Only ${latestQty} available; ${alreadyInCart} already in your cart.`, variant: "destructive" });
        return;
      }
      const accepted = add({
        variantId: variant.id,
        productId: product.id,
        quantity: selectedQuantity,
        name: `${product.name} — ${variant.name}`,
        image: product.image,
        priceMinor: fresh?.priceMinor ?? variant.priceMinor,
      }, latestQty);
      toast(accepted
        ? { title: "Added to cart", description: `${formatQty(selectedQuantity)} × ${product.name} — ${variant.name}` }
        : { title: "Stock limit reached", description: `Only ${latestQty} available.`, variant: "destructive" });
    } catch {
      toast({ title: "Could not verify stock", description: "Please try again before adding this item.", variant: "destructive" });
    } finally { setAdding(false); }
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Choose an option</legend>
        <RadioGroup
          value={variantId}
          onValueChange={(id) => { setVariantId(id); setQuantity("1"); }}
          className="grid gap-2"
          aria-label={`${product.name} variants`}
        >
          {product.variants.map((originalVariant: CatalogVariant) => {
            const latest = liveQuantities[originalVariant.id] ?? originalVariant.availableToSell;
            const v = { ...originalVariant, availableToSell: latest, isAvailable: cmpQty(latest, "0") > 0 };
            return <Label
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
                    {v.isAvailable ? (cmpQty(v.availableToSell, "3") <= 0 ? `Only ${v.availableToSell} left` : `${v.availableToSell} in stock`) : "Out of stock"}
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
            </Label>;
          })}
        </RadioGroup>
      </fieldset>

      {isAvailable && variant ? (
        <div className="space-y-3">
          <p className="text-sm font-medium" aria-live="polite">
            {cmpQty(remaining, "0") <= 0 ? `All ${variant.availableToSell} available units are already in your cart.`
              : `${variant.availableToSell} available · ${remaining} more can be added to your cart.`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <QuantityInput
              value={selectedQuantity}
              onChange={setQuantity}
              min={minimum}
              max={remaining}
              unit={variant.unit}
              ariaLabel={`Quantity of ${product.name} ${variant.name}`}
            />
            <Button size="lg" className="h-12 flex-1 min-w-40" disabled={!canAdd || adding} onClick={addToCart}>
              <ShoppingCart className="size-5" aria-hidden /> {adding ? "Checking stock…" : "Add to cart"}
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
