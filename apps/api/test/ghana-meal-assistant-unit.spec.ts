import { test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogProduct } from "@variety/contracts";
import { GhanaMealAssistantService } from "../src/ai/ghana-meal-assistant.service";

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
