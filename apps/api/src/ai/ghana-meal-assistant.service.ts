import { Injectable } from "@nestjs/common";
import type {
  CatalogProduct,
  CatalogVariant,
  GhanaAssistantLanguage,
  GhanaMealPlanRequest,
  GhanaMealPlanResponse,
} from "@variety/contracts";
import { CatalogService } from "../catalog/catalog.service";
import {
  conceptsMentionedIn,
  foodConceptById,
  GHANA_FOOD_LEXICON_VERSION,
  type GhanaFoodConcept,
} from "./ghana-food-lexicon";
import { matchMealTemplate, mealTemplateById, type GhanaMealIngredientTemplate } from "./ghana-meal-templates";
import { ingredientSellableQuantity, productMatchesFoodConceptForm } from "./ghana-catalogue-match";
import { GhanaModelInterpreter } from "./ghana-model-interpreter";

const numberWords: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  baako: 1, mmienu: 2, mienu: 2, "mmiɛnsa": 3, mmiensa: 3, anan: 4, anum: 5,
  "ɖeka": 1, deka: 1, eve: 2, "etɔ̃": 3, eto: 3, ene: 4, "atɔ̃": 5, ato: 5,
};

function textServings(text: string) {
  const normalized = text.toLocaleLowerCase();
  const digit = normalized.match(/(?:family\s+of|we\s+are|for|serving|serves)\s+(\d{1,2})\b/);
  if (digit) {
    const count = Number(digit[1]);
    if (count >= 1 && count <= 20) return count;
  }
  for (const [word, count] of Object.entries(numberWords)) {
    if (new RegExp(`(?:family\\s+of|we\\s+are|for|serving|serves)\\s+${word}(?:\\b|$)`, "iu").test(normalized)) return count;
  }
  if (/\b(just me|only me|myself|i am the only one)\b/i.test(normalized)) return 1;
  return undefined;
}


function textBudgetMinor(text: string) {
  const normalized = text.toLocaleLowerCase().replace(/,/g, "");
  const currency = normalized.match(/(?:₵|ghs\s*)?(\d+(?:\.\d{1,2})?)\s*(?:cedis?|ghs)\b/i);
  const budget = normalized.match(/\b(?:budget(?:\s+of)?|i\s+have|with)\s*(?:₵|ghs\s*)?(\d+(?:\.\d{1,2})?)\b/i);
  const raw = currency?.[1] ?? budget?.[1];
  if (!raw) return undefined;
  const major = Number(raw);
  if (!Number.isFinite(major) || major < 1 || major > 100_000) return undefined;
  return Math.round(major * 100);
}

function money(minor: number) {
  return `₵${(minor / 100).toFixed(2)}`;
}

function detectedLanguage(text: string, requested: GhanaAssistantLanguage): GhanaMealPlanResponse["detectedLanguage"] {
  if (requested !== "auto") return requested;
  const matched = conceptsMentionedIn(text);
  const languages = new Set(
    matched.flatMap(({ concept, matchedAlias }) => concept.aliases
      .filter((alias) => alias.term.toLocaleLowerCase() === matchedAlias.toLocaleLowerCase())
      .map((alias) => alias.language)
      .filter((language) => language !== "ghana" && language !== "english")),
  );
  if (languages.size > 1) return "mixed";
  if (languages.size === 1) return [...languages][0] as "twi" | "ga" | "ewe";
  return /[a-z]/i.test(text) ? "english" : "unknown";
}

function catalogueScore(product: CatalogProduct, term: string) {
  const needle = term.toLocaleLowerCase();
  const name = product.name.toLocaleLowerCase();
  if (name === needle) return 100;
  if (name.includes(needle)) return 90;
  if (product.tags.some((tag) => tag.toLocaleLowerCase() === needle)) return 80;
  if (product.tags.some((tag) => tag.toLocaleLowerCase().includes(needle))) return 70;
  if (product.shortDescription.toLocaleLowerCase().includes(needle)) return 60;
  return 10;
}

@Injectable()
export class GhanaMealAssistantService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly modelInterpreter: GhanaModelInterpreter,
  ) {}

  private async catalogueCandidates(concept: GhanaFoodConcept) {
    const byId = new Map<string, { product: CatalogProduct; score: number; matchedAlias: string }>();
    for (const term of concept.searchTerms) {
      const result = await this.catalog.list({ q: term, page: 1, perPage: 12, sort: "name" });
      for (const product of result.items) {
        if (!productMatchesFoodConceptForm(product, concept)) continue;
        const score = catalogueScore(product, term);
        const previous = byId.get(product.id);
        if (!previous || score > previous.score) byId.set(product.id, { product, score, matchedAlias: term });
      }
      if ([...byId.values()].some((candidate) => candidate.score >= 90)) break;
    }
    return [...byId.values()].sort((a, b) => b.score - a.score || a.product.minPriceMinor - b.product.minPriceMinor);
  }

  private async resolveIngredient(ingredient: GhanaMealIngredientTemplate, servings: number, baseServings: number, matchedAlias?: string) {
    const concept = foodConceptById(ingredient.conceptId);
    if (!concept) return { unresolved: { conceptId: ingredient.conceptId, term: ingredient.conceptId, reason: "not_understood" as const } };
    const candidates = await this.catalogueCandidates(concept);
    if (!candidates.length) return { unresolved: { conceptId: concept.id, term: concept.label, reason: "not_in_catalogue" as const, alternatives: concept.searchTerms.slice(0, 3) } };

    let best: { product: CatalogProduct; variant: CatalogVariant; quantity: string; enough: boolean } | undefined;
    for (const candidate of candidates) {
      for (const variant of candidate.product.variants.filter((item) => item.isAvailable)) {
        const quantity = ingredientSellableQuantity(ingredient.baseQuantity, servings, baseServings, variant, concept, ingredient.quantityUnit);
        if (!quantity) continue;
        const enough = Number(variant.availableToSell) >= Number(quantity);
        const proposal = { product: candidate.product, variant, quantity, enough };
        if (!best || (proposal.enough && !best.enough) || (proposal.enough === best.enough && proposal.variant.priceMinor < best.variant.priceMinor)) best = proposal;
      }
      if (best?.enough) break;
    }
    if (!best) return { unresolved: { conceptId: concept.id, term: concept.label, reason: "out_of_stock" as const, alternatives: candidates.slice(0, 3).map((item) => item.product.name) } };

    const lineTotalMinor = Math.round(best.variant.priceMinor * Number(best.quantity));
    return {
      line: {
        conceptId: concept.id,
        conceptLabel: concept.label,
        ...(matchedAlias ? { matchedAlias } : {}),
        productId: best.product.id,
        productName: best.product.name,
        variantId: best.variant.id,
        variantName: best.variant.name,
        image: best.product.image,
        unit: best.variant.unit,
        unitSize: best.variant.unitSize,
        quantity: best.quantity,
        unitPriceMinor: best.variant.priceMinor,
        lineTotalMinor,
        availableToSell: best.variant.availableToSell,
        availableNow: best.enough,
        ...(!best.enough ? { note: `Only ${best.variant.availableToSell} ${best.variant.unit} currently available.` } : {}),
      },
    };
  }

  private async budgetPlan(
    input: GhanaMealPlanRequest,
    requestText: string,
    budgetMinor: number,
    servings: number,
    language: GhanaMealPlanResponse["detectedLanguage"],
  ): Promise<GhanaMealPlanResponse> {
    const result = await this.catalog.list({ q: "", page: 1, perPage: 100, sort: "price-asc" });
    const stapleTerms = ["rice", "gari", "beans", "yam", "plantain", "tomato", "onion", "egg", "oil", "fish", "meat", "flour", "milk"];
    const candidates = result.items
      .flatMap((product) => {
        const variants = product.variants.filter((variant) => variant.isAvailable && Number(variant.availableToSell) >= 1);
        if (!variants.length) return [];
        const variant = [...variants].sort((a, b) => a.priceMinor - b.priceMinor)[0];
        const haystack = `${product.name} ${product.tags.join(" ")}`.toLocaleLowerCase();
        const rank = stapleTerms.findIndex((term) => haystack.includes(term));
        return [{ product, variant, rank: rank < 0 ? 999 : rank }];
      })
      .sort((a, b) => a.rank - b.rank || a.variant.priceMinor - b.variant.priceMinor || a.product.name.localeCompare(b.product.name));

    const lines: GhanaMealPlanResponse["lines"] = [];
    let subtotalMinor = 0;
    const usedCategories = new Set<string>();
    for (const candidate of candidates) {
      const next = subtotalMinor + candidate.variant.priceMinor;
      if (next > budgetMinor) continue;
      // Prefer breadth across grocery categories before adding several items from one category.
      if (usedCategories.has(candidate.product.categoryId) && candidates.some((item) => !usedCategories.has(item.product.categoryId) && subtotalMinor + item.variant.priceMinor <= budgetMinor)) continue;
      lines.push({
        conceptId: `budget_${candidate.product.slug}`,
        conceptLabel: candidate.product.name,
        productId: candidate.product.id,
        productName: candidate.product.name,
        variantId: candidate.variant.id,
        variantName: candidate.variant.name,
        image: candidate.product.image,
        unit: candidate.variant.unit,
        unitSize: candidate.variant.unitSize,
        quantity: "1",
        unitPriceMinor: candidate.variant.priceMinor,
        lineTotalMinor: candidate.variant.priceMinor,
        availableToSell: candidate.variant.availableToSell,
        availableNow: true,
        note: "Budget basket suggestion — edit quantities before adding to cart.",
      });
      subtotalMinor = next;
      usedCategories.add(candidate.product.categoryId);
      if (lines.length >= 8) break;
    }

    return {
      requestText,
      detectedLanguage: language,
      servings,
      interpretation: "lexicon",
      summary: lines.length
        ? `With a ${money(budgetMinor)} budget, I found ${lines.length} available catalogue items totalling ${money(subtotalMinor)} for you to review for ${servings} ${servings === 1 ? "person" : "people"}.`
        : `I could not build a safe basket within your ${money(budgetMinor)} budget from currently available catalogue items.`,
      lines,
      unresolved: lines.length ? [] : [{ term: requestText, reason: "not_understood" }],
      subtotalMinor,
      confidence: lines.length ? 0.9 : 0.05,
      warnings: [
        `Budget ceiling detected: ${money(budgetMinor)}. The suggested subtotal will not exceed it.`,
        "This is a grocery basket suggestion, not a guarantee that it forms a complete recipe; you can ask for a specific Ghanaian dish for a recipe-style market list.",
        "Prices and availability come from the live Variety Groceries catalogue and are rechecked at checkout.",
      ],
      lexiconVersion: GHANA_FOOD_LEXICON_VERSION,
    };
  }

  async plan(input: GhanaMealPlanRequest): Promise<GhanaMealPlanResponse> {
    const requestText = input.text.trim();
    const modelIntent = await this.modelInterpreter.interpret(input);
    const servings = textServings(requestText) ?? modelIntent?.servings ?? input.servings ?? 1;
    const language = modelIntent?.detectedLanguage && modelIntent.detectedLanguage !== "unknown"
      ? modelIntent.detectedLanguage
      : detectedLanguage(requestText, input.language);
    const template = (modelIntent?.dishId ? mealTemplateById(modelIntent.dishId) : undefined) ?? matchMealTemplate(requestText);
    const mentions = conceptsMentionedIn(requestText);
    const budgetMinor = textBudgetMinor(requestText);
    if (budgetMinor && !template && mentions.length === 0 && !(modelIntent?.conceptIds.length)) {
      return this.budgetPlan(input, requestText, budgetMinor, servings, language);
    }
    const mentionedById = new Map<string, string | undefined>(mentions.map((item) => [item.concept.id, item.matchedAlias]));
    const mentionedConcepts = new Map(mentions.map((item) => [item.concept.id, item.concept]));
    for (const conceptId of modelIntent?.conceptIds ?? []) {
      const concept = foodConceptById(conceptId);
      if (concept) {
        mentionedConcepts.set(concept.id, concept);
        if (!mentionedById.has(concept.id)) mentionedById.set(concept.id, undefined);
      }
    }

    let ingredients: GhanaMealIngredientTemplate[];
    if (template) {
      ingredients = template.ingredients.map((item) => ({ ...item }));
      const wantsBeef = mentionedById.has("beef");
      if (wantsBeef && ingredients.some((item) => item.conceptId === "goat_meat")) {
        ingredients = ingredients.map((item) => item.conceptId === "goat_meat" ? { ...item, conceptId: "beef" } : item);
      }
      for (const concept of mentionedConcepts.values()) {
        if (!ingredients.some((item) => item.conceptId === concept.id)) ingredients.push({ conceptId: concept.id, baseQuantity: 1, optional: true });
      }
    } else {
      ingredients = [...mentionedConcepts.values()].map((concept) => ({ conceptId: concept.id, baseQuantity: 1 }));
    }

    const lines: GhanaMealPlanResponse["lines"] = [];
    const unresolved: GhanaMealPlanResponse["unresolved"] = [];
    for (const ingredient of ingredients) {
      const result = await this.resolveIngredient(ingredient, servings, template?.baseServings ?? Math.max(servings, 1), mentionedById.get(ingredient.conceptId));
      if (result.line) lines.push(result.line);
      if (result.unresolved && !ingredient.optional) unresolved.push(result.unresolved);
      else if (result.unresolved && ingredient.optional) unresolved.push({ ...result.unresolved, alternatives: result.unresolved.alternatives });
    }

    if (!ingredients.length) unresolved.push({ term: requestText, reason: "not_understood" });
    const subtotalMinor = lines.filter((line) => line.availableNow).reduce((sum, line) => sum + line.lineTotalMinor, 0);
    const expected = Math.max(ingredients.length, 1);
    const resolvedCount = lines.filter((line) => line.availableNow).length;
    const confidence = Number(Math.max(0.05, Math.min(1, resolvedCount / expected)).toFixed(2));
    const dishLabel = template?.label;
    const summary = dishLabel
      ? `For ${servings} ${servings === 1 ? "person" : "people"}, I found ${resolvedCount} of ${ingredients.length} catalogue items for ${dishLabel}.`
      : lines.length
        ? `I matched ${resolvedCount} available catalogue ${resolvedCount === 1 ? "item" : "items"} from your request for ${servings} ${servings === 1 ? "person" : "people"}.`
        : "I could not safely match this request to available catalogue items yet.";

    return {
      requestText,
      detectedLanguage: language,
      servings,
      ...(template ? { dishId: template.id, dishLabel: template.label } : {}),
      interpretation: modelIntent ? "model" : template ? "template" : "lexicon",
      summary,
      lines,
      unresolved,
      subtotalMinor,
      confidence,
      warnings: [
        "Quantities are cooking estimates and can be edited before adding items to cart.",
        "Prices and availability come from the live Variety Groceries catalogue and are rechecked at checkout.",
      ],
      lexiconVersion: GHANA_FOOD_LEXICON_VERSION,
    };
  }
}
