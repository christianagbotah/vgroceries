"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { readWishlist, WISHLIST_CHANGED_EVENT, writeWishlist, type WishItem } from "./wishlist-store";

export function WishlistButton({
  item,
  compact = false,
  className,
  disabled = false,
}: {
  item: WishItem;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const refresh = () => setSaved(readWishlist().some((entry) => entry.variantId === item.variantId));
    refresh();
    window.addEventListener(WISHLIST_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(WISHLIST_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [item.variantId]);

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    const current = readWishlist();
    const exists = current.some((entry) => entry.variantId === item.variantId);
    const next = exists ? current.filter((entry) => entry.variantId !== item.variantId) : [...current, item];
    writeWishlist(next);
    setSaved(!exists);
    toast({
      title: exists ? "Removed from wishlist" : "Saved to wishlist",
      description: item.name,
    });
  };

  return (
    <Button
      type="button"
      variant={compact ? "secondary" : "outline"}
      size={compact ? "icon" : "sm"}
      className={cn(compact ? "size-8 rounded-full bg-white/90 shadow-sm backdrop-blur hover:bg-white" : "h-9 rounded-full bg-white px-3 text-xs font-bold text-primary shadow-sm", className)}
      aria-label={saved ? `Remove ${item.name} from wishlist` : `Add ${item.name} to wishlist`}
      aria-pressed={saved}
      onClick={toggle}
      disabled={disabled}
    >
      <Heart className={cn("size-4", saved && "fill-current")} aria-hidden />
      {compact ? null : <span>{saved ? "Saved" : "Wishlist"}</span>}
    </Button>
  );
}
