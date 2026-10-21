import type { CatalogProduct } from "@/services/client";

export const WISH_KEY = "vg-wishlist-v1";

export interface WishItem {
  variantId: string;
  productId: string;
  name: string;
  image: string;
  priceMinor: number;
  slug: string;
}

function readWishlist(): WishItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WISH_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addProductToWishlist(product: CatalogProduct, preferredVariantId?: string): { added: boolean; item?: WishItem } {
  if (typeof window === "undefined") return { added: false };
  const preferred = product.variants.find((variant) => variant.id === preferredVariantId);
  const variant = (preferred?.isAvailable ? preferred : undefined) ?? product.variants.find((entry) => entry.isAvailable) ?? product.variants[0];
  if (!variant) return { added: false };
  const current = readWishlist();
  const existing = current.find((item) => item.variantId === variant.id);
  if (existing) return { added: false, item: existing };
  const item: WishItem = {
    variantId: variant.id,
    productId: product.id,
    name: `${product.name} — ${variant.name}`,
    image: product.featuredImage?.url ?? product.image,
    priceMinor: variant.priceMinor,
    slug: product.slug,
  };
  window.localStorage.setItem(WISH_KEY, JSON.stringify([...current, item]));
  window.dispatchEvent(new CustomEvent("vg:wishlist-changed", { detail: { variantId: variant.id } }));
  return { added: true, item };
}
