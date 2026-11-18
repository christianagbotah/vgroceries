/** Saved lists are convenience snapshots, never live catalogue/stock authority. */
import type { CatalogProduct, CatalogVariant } from "@/services/contracts";
import { cmpQty } from "@/lib/quantity";

export interface SavedCartAddition {
  variantId: string;
  productId: string;
  quantity: string;
  name: string;
  image: string;
  priceMinor: number;
}

export interface SuggestedItem {
  variantId: string;
  label: string;
}

/** An exact SKU must still be in sellable stock. Never silently choose another pack. */
export function resolveSavedVariant(
  products: readonly CatalogProduct[],
  variantId: string,
): { product: CatalogProduct; variant: CatalogVariant } | null {
  for (const product of products) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant || !variant.isAvailable) continue;
    if (!Number.isSafeInteger(variant.priceMinor) || variant.priceMinor < 0) return null;
    try {
      if (cmpQty(variant.availableToSell, "0") > 0) return { product, variant };
    } catch {
      return null; // Incomplete or invalid stock truth must fail closed.
    }
  }
  return null;
}

export function savedCartAddition(
  products: readonly CatalogProduct[],
  variantId: string,
  quantity = "1",
): SavedCartAddition | null {
  const matched = resolveSavedVariant(products, variantId);
  if (!matched) return null;
  try {
    if (cmpQty(quantity, "0") <= 0 || cmpQty(quantity, matched.variant.availableToSell) > 0) return null;
  } catch {
    return null;
  }
  const { product, variant } = matched;
  return {
    variantId: variant.id,
    productId: product.id,
    quantity,
    name: `${product.name} — ${variant.name}`,
    image: product.featuredImage?.url ?? product.image,
    priceMinor: variant.priceMinor,
  };
}

/** Reprice a proposed demo budget basket using fresh catalogue values. */
export function planBudgetAdditions(
  suggested: readonly SuggestedItem[],
  products: readonly CatalogProduct[],
  originalBudgetMinor: number,
): { lines: SavedCartAddition[]; skipped: string[]; totalMinor: number } {
  const lines: SavedCartAddition[] = [];
  const skipped: string[] = [];
  let totalMinor = 0;
  const seen = new Set<string>();
  if (!Number.isSafeInteger(originalBudgetMinor) || originalBudgetMinor < 0) {
    return { lines, skipped: suggested.map((s) => `${s.label}: invalid budget`), totalMinor };
  }
  for (const item of suggested) {
    if (seen.has(item.variantId)) {
      skipped.push(`${item.label}: duplicate variant`);
      continue;
    }
    seen.add(item.variantId);
    const line = savedCartAddition(products, item.variantId);
    if (!line) {
      skipped.push(`${item.label}: unavailable or stock could not be verified`);
      continue;
    }
    if (line.priceMinor > originalBudgetMinor - totalMinor) {
      skipped.push(`${item.label}: current price exceeds remaining budget`);
      continue;
    }
    totalMinor += line.priceMinor;
    lines.push(line);
  }
  return { lines, skipped, totalMinor };
}
