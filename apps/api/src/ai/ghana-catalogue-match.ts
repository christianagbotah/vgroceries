import type { CatalogProduct, CatalogVariant } from "@variety/contracts";
import { foodConceptById, type GhanaFoodConcept } from "./ghana-food-lexicon";
import { GHANA_MEAL_TEMPLATES, type GhanaMealQuantityUnit } from "./ghana-meal-templates";

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
  if (!Number.isFinite(count) || count <= 0) return undefined;
  if (!concept.countUnitTerms.some((term) => label === term.toLocaleLowerCase() || label.startsWith(`${term.toLocaleLowerCase()} `))) return undefined;
  return count;
}

type MeasureFamily = "weight" | "volume";

type PackageMeasure = {
  family: MeasureFamily;
  baseAmount: number;
};

function packageMeasure(unitSize: string): PackageMeasure | undefined {
  const normalized = unitSize.trim().toLocaleLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|l|litres?|liters?|ml|millilitres?|milliliters?)\b/u);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2];
  if (/^(kg|kilograms?)$/.test(unit)) return { family: "weight", baseAmount: amount * 1000 };
  if (/^(g|grams?)$/.test(unit)) return { family: "weight", baseAmount: amount };
  if (/^(l|litres?|liters?)$/.test(unit)) return { family: "volume", baseAmount: amount * 1000 };
  if (/^(ml|millilitres?|milliliters?)$/.test(unit)) return { family: "volume", baseAmount: amount };
  return undefined;
}

function recipeMeasure(quantity: number, unit: GhanaMealQuantityUnit) {
  if (unit === "kg") return { family: "weight" as const, baseAmount: quantity * 1000 };
  if (unit === "g") return { family: "weight" as const, baseAmount: quantity };
  if (unit === "l") return { family: "volume" as const, baseAmount: quantity * 1000 };
  if (unit === "ml") return { family: "volume" as const, baseAmount: quantity };
  return undefined;
}

function directUnitScale(unit: string, family: MeasureFamily) {
  const normalized = unit.trim().toLocaleLowerCase();
  if (family === "weight") {
    if (/^(kg|kilogram|kilograms)$/.test(normalized)) return 1000;
    if (/^(g|gram|grams)$/.test(normalized)) return 1;
  } else {
    if (/^(l|litre|litres|liter|liters)$/.test(normalized)) return 1000;
    if (/^(ml|millilitre|millilitres|milliliter|milliliters)$/.test(normalized)) return 1;
  }
  return undefined;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function directMeasuredQuantity(baseAmount: number, scale: number, variantUnit: string) {
  const raw = baseAmount / scale;
  const normalized = variantUnit.trim().toLocaleLowerCase();
  if (/^(kg|kilogram|kilograms|l|litre|litres|liter|liters)$/.test(normalized)) {
    return formatQuantity(Math.max(0.25, Math.ceil(raw * 4) / 4));
  }
  return formatQuantity(Math.max(1, Math.ceil(raw)));
}

function legacySellableQuantity(raw: number, variant: CatalogVariant, concept: GhanaFoodConcept) {
  const containedCount = explicitContainedCount(variant, concept);
  if (containedCount) return String(Math.max(1, Math.ceil(raw / containedCount)));
  const fractionalUnit = /^(kg|g|gram|grams|l|litre|liter|ml)$/i.test(variant.unit.trim());
  const value = fractionalUnit ? Math.max(0.25, Math.ceil(raw * 4) / 4) : Math.max(1, Math.ceil(raw));
  return formatQuantity(value);
}

export function ingredientSellableQuantity(
  baseQuantity: number,
  servings: number,
  baseServings: number,
  variant: CatalogVariant,
  concept: GhanaFoodConcept,
  quantityUnit: GhanaMealQuantityUnit = "sellable",
) {
  const scaled = Math.max(0.001, baseQuantity * servings / baseServings);
  if (quantityUnit === "sellable") return legacySellableQuantity(scaled, variant, concept);

  if (quantityUnit === "count") {
    const containedCount = explicitContainedCount(variant, concept);
    if (containedCount) return String(Math.max(1, Math.ceil(scaled / containedCount)));
    const direct = variant.unit.trim().toLocaleLowerCase();
    if (/^(piece|pieces|each|item|items|unit|units)$/.test(direct)
      || concept.countUnitTerms?.some((term) => term.toLocaleLowerCase() === direct)) {
      return String(Math.max(1, Math.ceil(scaled)));
    }
    return undefined;
  }

  const required = recipeMeasure(scaled, quantityUnit);
  if (!required) return undefined;
  const directScale = directUnitScale(variant.unit, required.family);
  if (directScale) return directMeasuredQuantity(required.baseAmount, directScale, variant.unit);

  const packaged = packageMeasure(variant.unitSize);
  if (packaged?.family === required.family) {
    return String(Math.max(1, Math.ceil(required.baseAmount / packaged.baseAmount)));
  }
  return undefined;
}
