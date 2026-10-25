import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Ghana multilingual meal assistant", () => {
  test("shared contracts expose a structured, editable meal plan", () => {
    const ai = read("packages/contracts/src/ai.ts");
    expect(ai).toContain("ghanaMealPlanRequestSchema");
    expect(ai).toContain("GhanaMealPlanResponse");
    expect(ai).toContain("detectedLanguage");
    expect(ai).toContain("quantity");
    expect(ai).toContain("unitPriceMinor");
    expect(ai).toContain("lineTotalMinor");
    expect(ai).toContain("unresolved");
    expect(ai).toContain("subtotalMinor");
  });

  test("owner-supplied Ghana food names live in versioned lexicon data", () => {
    const path = "apps/api/src/ai/ghana-food-lexicon.ts";
    expect(existsSync(path)).toBe(true);
    const lexicon = read(path).toLowerCase();
    for (const term of ["momoni", "kobi", "nkosua", "kokloji", "sabala", "jene", "kontomire", "ebunebunu", "aponchi"]) {
      expect(lexicon).toContain(term);
    }
  });

  test("initial meal templates cover the owner's core meal examples", () => {
    const templates = read("apps/api/src/ai/ghana-meal-templates.ts");
    expect(templates).toContain("yam_ampesi_kontomire");
    expect(templates).toContain("fufu_light_soup");
    expect(templates).toContain("fufu_groundnut_soup");
  });

  test("production API exposes catalogue-grounded meal planning", () => {
    const endpoints = read("packages/contracts/src/endpoints.ts");
    const bootstrap = read("apps/api/src/bootstrap.ts");
    const service = read("apps/api/src/ai/ghana-meal-assistant.service.ts");
    expect(endpoints).toContain('"ai.meal-plan"');
    expect(endpoints).toContain('"/ai/meal-plan"');
    expect(bootstrap).toContain("GhanaMealAssistantModule");
    expect(service).toContain("CatalogService");
    expect(service).toContain("availableToSell");
    expect(service).toContain("unitPriceMinor");
    expect(service).toContain("subtotalMinor");
  });

  test("storefront supports Twi, Ga, Ewe, voice input and editable cart handoff", () => {
    const page = read("src/app/(storefront)/assistant/page.tsx");
    expect(page).toContain("Twi");
    expect(page).toContain("Ga");
    expect(page).toContain("Ewe");
    expect(page).toContain("SpeechRecognition");
    expect(page).toContain("servings");
    expect(page).toContain("setQty");
    expect(page).toContain("Add available items to cart");
  });
});
