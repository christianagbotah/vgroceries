/**
 * Shared API contracts — AI assistance (deterministic demo today).
 * Provider adapters, grounding, permissions and cost tracking are specified
 * in docs/AI_ARCHITECTURE.md. Every AI response MUST carry evidence that
 * traces back to verified catalogue/stock/pricing/operational records;
 * insufficient data is reported explicitly, never papered over.
 * Proposed REST rendering: /api/v1/ai/* (see docs/openapi.yaml).
 */

import type { AISuggestion } from "./domain";

export interface AssistantSuggestion {
  productId: string;
  variantId: string;
  label: string;
  priceMinor: number;
  available: string;
}

/** Catalogue-grounded shopping assistance. */
export interface AssistantResponse {
  answer: string;
  /** Verified facts the answer was derived from (product names, prices, stock). */
  evidence: string[];
  suggestions: AssistantSuggestion[];
}

export interface AssistantRequest {
  question: string;
}

/** Budget basket: best achievable basket within a pesewa budget. */
export interface BudgetBasketResponse {
  items: AssistantSuggestion[];
  totalMinor: number;
  note: string;
}

export interface BudgetBasketRequest {
  /** Budget in GHS minor units (pesewas). */
  budgetMinor: number;
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

/** Business question answered strictly from actual records. */
export interface BusinessQuestionResponse {
  answer: string;
  evidence: string[];
}

export interface BusinessQuestionRequest {
  question: string;
}
