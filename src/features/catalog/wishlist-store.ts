export interface WishItem {
  variantId: string;
  productId: string;
  name: string;
  image: string;
  priceMinor: number;
  slug: string;
}

export const WISH_KEY = "vg-wishlist-v1";
export const WISHLIST_CHANGED_EVENT = "vg:wishlist-changed";

export function readWishlist(): WishItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WISH_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is WishItem => Boolean(item && typeof item.variantId === "string")) : [];
  } catch {
    return [];
  }
}

export function writeWishlist(items: WishItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WISH_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(WISHLIST_CHANGED_EVENT));
}
