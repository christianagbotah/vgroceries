import type { CatalogProduct, CatalogVariant } from "@variety/contracts";
import type { GhanaFoodConcept } from "./ghana-food-lexicon";

function normalizedProductFormText(product: CatalogProduct) {
  return `${product.name} ${product.tags.join(" ")}`.trim().toLocaleLowerCase();
}

export function productMatchesFoodConceptForm(product: CatalogProduct, concept: GhanaFoodConcept) {
  const text = normalizedProductFormText(product);
  if (concept.excludedProductTerms?.some((term) => text.includes(term.toLocaleLowerCase()))) return false;
  if (concept.requiredProductTerms?.length
    && !concept.requiredProductTerms.some((term) => text.includes(term.toLocaleLowerCase()))) return false;
  return true;
}

function explicitContainedCount(variant: CatalogVariant, concept: GhanaFoodConcept) {
  if (!concept.countUnitTerms?.length) return undefined;
  const normalized = variant.unitSize.trim().toLocaleLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s+(.+)$/u);
  if (!match) return undefined;
  const count = Number(match[1]);
  const label = match[2].trim();
  if (!Number.isFinite(count) || count <= 1) return undefined;
  if (!concept.countUnitTerms.some((term) => label === term.toLocaleLowerCase() || label.startsWith(`${term.toLocaleLowerCase()} `))) return undefined;
  return count;
}

export function ingredientSellableQuantity(
  baseQuantity: number,
  servings: number,
  baseServings: number,
  variant: CatalogVariant,
  concept: GhanaFoodConcept,
) {
  const raw = Math.max(0.001, baseQuantity * servings / baseServings);
  const containedCount = explicitContainedCount(variant, concept);
  if (containedCount) return String(Math.max(1, Math.ceil(raw / containedCount)));

  const fractionalUnit = /^(kg|g|gram|grams|l|litre|liter|ml)$/i.test(variant.unit.trim());
  const value = fractionalUnit ? Math.max(0.25, Math.ceil(raw * 4) / 4) : Math.max(1, Math.ceil(raw));
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
