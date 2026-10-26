import { test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogProduct } from "@variety/contracts";
import { GhanaMealAssistantService } from "../src/ai/ghana-meal-assistant.service";
import * as catalogueMatch from "../src/ai/ghana-catalogue-match";
import { conceptsMentionedIn } from "../src/ai/ghana-food-lexicon";

function product(input: {
  id: string;
  name: string;
  tags: string[];
  priceMinor: number;
  unit?: string;
  unitSize?: string;
  availableToSell?: string;
}): CatalogProduct {
  return {
    id: input.id,
    slug: input.id,
    name: input.name,
    categoryId: "food",
    categoryName: "Food",
    tags: input.tags,
    shortDescription: "",
    description: "",
    image: "",
    gallery: [],
    minPriceMinor: input.priceMinor,
    minPriceLabel: `₵${(input.priceMinor / 100).toFixed(2)}`,
    anyAvailable: true,
    variants: [{
      id: `${input.id}-variant`,
      name: input.unitSize ?? "Standard",
      unit: input.unit ?? "piece",
      unitSize: input.unitSize ?? "1 piece",
      priceMinor: input.priceMinor,
      priceLabel: `₵${(input.priceMinor / 100).toFixed(2)}`,
      availableToSell: input.availableToSell ?? "50",
      isAvailable: true,
    }],
  } as CatalogProduct;
}

function assistant(products: CatalogProduct[]) {
  const catalog = {
    async list(input: { q: string }) {
      const q = input.q.trim().toLocaleLowerCase();
      const items = q
        ? products.filter((item) => `${item.name} ${item.tags.join(" ")} ${item.shortDescription}`.toLocaleLowerCase().includes(q))
        : products;
      return { items, page: 1, perPage: 100, total: items.length, totalPages: 1 };
    },
  };
  const model = { async interpret() { return undefined; } };
  return new GhanaMealAssistantService(catalog as never, model as never);
}

test("meal assistant keeps raw plantain and fresh tomato instead of cheaper transformed products", async () => {
  const service = assistant([
    product({ id: "plantain-chips", name: "Plantain Chips", tags: ["snack", "plantain"], priceMinor: 500 }),
    product({ id: "ripe-plantain", name: "Ripe Plantain", tags: ["fresh", "plantain"], priceMinor: 2500, unit: "bunch", unitSize: "1 bunch" }),
    product({ id: "tomato-paste", name: "Tomato Paste", tags: ["tomato", "sauce"], priceMinor: 800 }),
    product({ id: "fresh-tomatoes", name: "Fresh Tomatoes", tags: ["fresh", "vegetable"], priceMinor: 1800, unit: "kg", unitSize: "1 kg" }),
  ]);

  const plan = await service.plan({ text: "fufu with light soup for 4 people", language: "english" });
  const plantain = plan.lines.find((line) => line.conceptId === "plantain");
  const tomato = plan.lines.find((line) => line.conceptId === "tomato");

  assert.equal(plantain?.productName, "Ripe Plantain");
  assert.equal(tomato?.productName, "Fresh Tomatoes");
  assert.ok(plan.lines.every((line) => line.productName !== "Plantain Chips"));
  assert.ok(plan.lines.every((line) => line.productName !== "Tomato Paste"));
});

test("meal assistant leaves form-specific ingredients unresolved instead of using broad food substitutes", async () => {
  const service = assistant([
    product({ id: "roasted-groundnuts", name: "Roasted Groundnuts", tags: ["snack", "groundnut"], priceMinor: 1500 }),
    product({ id: "frozen-tilapia", name: "Frozen Tilapia", tags: ["fish", "frozen"], priceMinor: 1800 }),
  ]);

  const groundnutPlan = await service.plan({ text: "fufu with groundnut soup for 4 people", language: "english" });
  assert.ok(!groundnutPlan.lines.some((line) => line.conceptId === "groundnut_paste"));
  assert.ok(groundnutPlan.unresolved.some((item) => item.conceptId === "groundnut_paste" && item.reason === "not_in_catalogue"));

  const ampesiPlan = await service.plan({ text: "yam ampesi with kontomire for 4 people", language: "english" });
  assert.ok(!ampesiPlan.lines.some((line) => line.conceptId === "salted_fish"));
  assert.ok(ampesiPlan.unresolved.some((item) => item.conceptId === "salted_fish" && item.reason === "not_in_catalogue"));
});

test("meal assistant converts an explicit ingredient count inside a pack to sellable pack quantity", async () => {
  const service = assistant([
    product({ id: "farm-eggs", name: "Farm Eggs", tags: ["eggs", "protein"], priceMinor: 4200, unit: "pack", unitSize: "30 eggs" }),
  ]);

  const plan = await service.plan({ text: "yam ampesi with kontomire for 4 people", language: "english" });
  const egg = plan.lines.find((line) => line.conceptId === "egg");

  assert.equal(egg?.productName, "Farm Eggs");
  assert.equal(egg?.quantity, "1");
  assert.equal(egg?.lineTotalMinor, 4200);
});

test("meal assistant recognizes jollof, waakye and red-red from live catalogue products", async () => {
  const service = assistant([
    product({ id: "local-rice", name: "Perfumed Local Rice", tags: ["rice", "staple"], priceMinor: 12000, unit: "bag", unitSize: "5 kg" }),
    product({ id: "black-eyed-beans", name: "Black-eyed Beans", tags: ["beans", "staple"], priceMinor: 2800, unit: "kg", unitSize: "1 kg" }),
    product({ id: "fine-gari", name: "Fine Gari", tags: ["gari", "staple"], priceMinor: 1400, unit: "kg", unitSize: "1 kg" }),
    product({ id: "fresh-tomatoes-ghana", name: "Fresh Tomatoes", tags: ["fresh", "vegetable"], priceMinor: 1800, unit: "kg", unitSize: "1 kg" }),
    product({ id: "tomato-paste-ghana", name: "Tomato Paste", tags: ["tomato", "sauce"], priceMinor: 800, unit: "piece", unitSize: "400 g" }),
    product({ id: "red-onions-ghana", name: "Red Onions", tags: ["fresh", "vegetable"], priceMinor: 2200, unit: "kg", unitSize: "1 kg" }),
    product({ id: "sunflower-oil", name: "Sunflower Cooking Oil", tags: ["oil", "cooking"], priceMinor: 4200, unit: "litre", unitSize: "1 L" }),
    product({ id: "ripe-plantain-ghana", name: "Ripe Plantain", tags: ["fresh", "plantain"], priceMinor: 2500, unit: "bunch", unitSize: "1 bunch" }),
    product({ id: "red-palm-oil-ghana", name: "Red Palm Oil", tags: ["oil", "cooking"], priceMinor: 3500, unit: "litre", unitSize: "1 L" }),
  ]);

  const cases = [
    { text: "jollof rice for 4 people", dishId: "ghana_jollof", concepts: ["rice", "tomato", "tomato_paste", "onion", "vegetable_oil"] },
    { text: "waakye for 4 people", dishId: "waakye", concepts: ["rice", "beans"] },
    { text: "red-red for 4 people", dishId: "red_red", concepts: ["beans", "plantain", "palm_oil", "onion", "tomato"] },
  ];

  for (const item of cases) {
    const plan = await service.plan({ text: item.text, language: "english" });
    assert.equal(plan.dishId, item.dishId, item.text);
    for (const conceptId of item.concepts) {
      assert.ok(plan.lines.some((line) => line.conceptId === conceptId), `${item.text}: missing ${conceptId}`);
    }
    assert.ok(plan.lines.every((line) => line.availableNow), `${item.text}: all returned lines must be live-available`);
  }
});


test("Ghana meal catalogue coverage reports missing required concepts and rejects wrong culinary forms", () => {
  const gaps = (catalogueMatch as unknown as {
    ghanaMealCatalogueGaps: (products: CatalogProduct[]) => Array<{ conceptId: string; mealLabels: string[] }>;
  }).ghanaMealCatalogueGaps;
  assert.equal(typeof gaps, "function");

  const result = gaps([
    product({ id: "coverage-rice", name: "Perfumed Local Rice", tags: ["rice", "staple"], priceMinor: 12000 }),
    product({ id: "coverage-beans", name: "Black-eyed Beans", tags: ["beans", "staple"], priceMinor: 2800, unit: "kg", unitSize: "1 kg" }),
    product({ id: "coverage-chips", name: "Plantain Chips", tags: ["snack", "plantain"], priceMinor: 500 }),
  ]);
  const ids = new Set(result.map((gap) => gap.conceptId));

  assert.equal(ids.has("rice"), false);
  assert.equal(ids.has("beans"), false);
  assert.equal(ids.has("plantain"), true, "plantain chips must not satisfy raw plantain coverage");
  assert.equal(ids.has("yam"), true);
  assert.equal(ids.has("pepper"), true);
  assert.ok(result.find((gap) => gap.conceptId === "yam")?.mealLabels.some((label) => /ampesi/i.test(label)));
});


test("food concept matching uses word boundaries and prefers a specific longer phrase at the same span", () => {
  assert.deepEqual(conceptsMentionedIn("I need tomato paste").map((item) => item.concept.id), ["tomato_paste"]);
  assert.equal(conceptsMentionedIn("what is the price?").some((item) => item.concept.id === "rice"), false);
  const mixed = new Set(conceptsMentionedIn("tomato and tomato paste").map((item) => item.concept.id));
  assert.equal(mixed.has("tomato"), true);
  assert.equal(mixed.has("tomato_paste"), true);
});
