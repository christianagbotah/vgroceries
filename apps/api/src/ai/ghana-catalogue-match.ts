import type { CatalogProduct, CatalogVariant } from "@variety/contracts";
import { foodConceptById, type GhanaFoodConcept } from "./ghana-food-lexicon";
import { GHANA_MEAL_TEMPLATES } from "./ghana-meal-templates";

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


export function productMatchesFoodConcept(product: CatalogProduct, concept: GhanaFoodConcept) {
  if (!productMatchesFoodConceptForm(product, concept)) return false;
  const text = `${product.name} ${product.tags.join(" ")} ${product.shortDescription}`.trim().toLocaleLowerCase();
  return concept.searchTerms.some((term) => text.includes(term.toLocaleLowerCase()));
}

export function ghanaMealCatalogueGaps(products: CatalogProduct[]) {
  const usage = new Map<string, Set<string>>();
  for (const template of GHANA_MEAL_TEMPLATES) {
    for (const ingredient of template.ingredients) {
      if (ingredient.optional) continue;
      const labels = usage.get(ingredient.conceptId) ?? new Set<string>();
      labels.add(template.label);
      usage.set(ingredient.conceptId, labels);
    }
  }

  return [...usage.entries()].flatMap(([conceptId, mealLabels]) => {
    const concept = foodConceptById(conceptId);
    if (!concept) return [];
    if (products.some((product) => productMatchesFoodConcept(product, concept))) return [];
    return [{ conceptId, label: concept.label, mealLabels: [...mealLabels].sort() }];
  }).sort((a, b) => a.label.localeCompare(b.label));
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
