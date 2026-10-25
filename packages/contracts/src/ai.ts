/**
 * Shared API contracts — catalogue-grounded AI assistance.
 * Language/model output may interpret intent, but commerce truth (products,
 * stock, prices and totals) must always come from authoritative services.
 */

import { z } from "zod";
import type { AISuggestion } from "./domain";

export interface AssistantSuggestion {
  productId: string;
  variantId: string;
  label: string;
  priceMinor: number;
  available: string;
}

export interface AssistantResponse {
  answer: string;
  evidence: string[];
  suggestions: AssistantSuggestion[];
}

export interface AssistantRequest {
  question: string;
}

export interface BudgetBasketResponse {
  items: AssistantSuggestion[];
  totalMinor: number;
  note: string;
}

export interface BudgetBasketRequest {
  budgetMinor: number;
}

export const ghanaAssistantLanguageSchema = z.enum([
  "auto",
  "english",
  "twi",
  "ga",
  "ewe",
]);
export type GhanaAssistantLanguage = z.infer<typeof ghanaAssistantLanguageSchema>;

export const ghanaMealPlanRequestSchema = z.strictObject({
  text: z.string().trim().min(2).max(1_000),
  language: ghanaAssistantLanguageSchema.default("auto"),
  servings: z.number().int().min(1).max(20).optional(),
});
export type GhanaMealPlanRequest = z.infer<typeof ghanaMealPlanRequestSchema>;

export interface GhanaMealPlanLine {
  conceptId: string;
  conceptLabel: string;
  matchedAlias?: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  image: string;
  unit: string;
  unitSize: string;
  /** Cart quantity in the catalogue variant's sellable unit. */
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  availableToSell: string;
  availableNow: boolean;
  note?: string;
}

export interface GhanaMealPlanUnresolved {
  conceptId?: string;
  term: string;
  reason: "not_in_catalogue" | "out_of_stock" | "not_understood";
  alternatives?: string[];
}

export interface GhanaMealPlanResponse {
  requestText: string;
  detectedLanguage: Exclude<GhanaAssistantLanguage, "auto"> | "mixed" | "unknown";
  servings: number;
  dishId?: string;
  dishLabel?: string;
  interpretation: "template" | "lexicon" | "model";
  summary: string;
  lines: GhanaMealPlanLine[];
  unresolved: GhanaMealPlanUnresolved[];
  subtotalMinor: number;
  confidence: number;
  warnings: string[];
  lexiconVersion: string;
}

/** Staff reviewable AI suggestion (pricing, replenishment, promos). */
export type SuggestionRow = AISuggestion & { createdAtLabel: string };

export interface AiGenerateResponse {
  generated: number;
}

export interface AiReviewRequest {
  suggestionId: string;
  decision: "reviewed" | "dismissed";
}

export interface AiReviewResponse {
  status: string;
}

export interface BusinessQuestionResponse {
  answer: string;
  evidence: string[];
}

export interface BusinessQuestionRequest {
  question: string;
}
