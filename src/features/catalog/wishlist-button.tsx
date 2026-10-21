"use client";

import { Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CatalogProduct } from "@/services/client";
import { addProductToWishlist } from "./wishlist";

export function WishlistButton({ product }: { product: CatalogProduct }) {
  const { toast } = useToast();
  const save = () => {
    const result = addProductToWishlist(product);
    if (!result.item) {
      toast({ title: "Could not save item", description: "This product has no selectable option yet.", variant: "destructive" });
      return;
    }
    toast({
      title: result.added ? "Saved to wishlist" : "Already in wishlist",
      description: result.item.name,
    });
  };
  return (
    <button type="button" onClick={save} className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-white px-3 text-xs font-bold text-primary shadow-sm hover:bg-muted/40" aria-label={`Add ${product.name} to wishlist`}>
      <Heart className="size-4" aria-hidden /> Wishlist
    </button>
  );
}
