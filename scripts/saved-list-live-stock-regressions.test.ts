/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { CatalogProduct } from "../src/services/contracts";
import { planBudgetAdditions, resolveSavedVariant, savedCartAddition } from "../src/features/catalog/saved-list-purchase";

const product = (id: string, options: { available?: boolean; stock?: string; priceMinor?: number } = {}): CatalogProduct => ({
  id: `product-${id}`, slug: `slug-${id}`, name: `Grocery ${id}`, categoryId: "cat", shortDescription: "", description: "",
  tags: [], image: `/grocery-${id}.jpg`, gallery: [], anyAvailable: options.available ?? true,
  minPriceMinor: options.priceMinor ?? 300, minPriceLabel: "₵3.00",
  variants: [{
    id, name: "1 pack", unit: "pack", unitSize: "1", priceMinor: options.priceMinor ?? 300,
    priceLabel: "₵3.00", availableToSell: options.stock ?? "2", isAvailable: options.available ?? true,
  }],
});

describe("saved shopping list safely revalidates stock, exact variant and price", () => {
  test("exact available SKU retains current identity, photo and price", () => {
    expect(savedCartAddition([product("rice", { priceMinor: 425 })], "rice")).toEqual({
      variantId: "rice", productId: "product-rice", quantity: "1", name: "Grocery rice — 1 pack",
      image: "/grocery-rice.jpg", priceMinor: 425,
    });
    expect(resolveSavedVariant([product("rice")], "other-pack")).toBeNull();
  });

  test("never buys a saved sold-out variant or an unverifiable stock quantity", () => {
    expect(savedCartAddition([product("rice", { available: false })], "rice")).toBeNull();
    expect(savedCartAddition([product("rice", { stock: "0" })], "rice")).toBeNull();
    expect(savedCartAddition([product("rice", { stock: "not-known" })], "rice")).toBeNull();
    expect(savedCartAddition([], "rice")).toBeNull();
  });

  test("repeat basket does not silently oversell the requested quantity", () => {
    expect(savedCartAddition([product("rice", { stock: "1.5" })], "rice", "2")).toBeNull();
    expect(savedCartAddition([product("rice", { stock: "2" })], "rice", "-1")).toBeNull();
    expect(savedCartAddition([product("rice", { stock: "2" })], "rice", "2")?.quantity).toBe("2");
  });

  test("budget suggestions use current prices, not stale suggested figures", () => {
    const result = planBudgetAdditions(
      [{ variantId: "rice", label: "Rice" }, { variantId: "milk", label: "Milk" }],
      [product("rice", { priceMinor: 400 }), product("milk", { priceMinor: 700 })], 1000,
    );
    expect(result.lines.map((l) => l.variantId)).toEqual(["rice"]);
    expect(result.totalMinor).toBe(400);
    expect(result.skipped).toEqual(["Milk: current price exceeds remaining budget"]);
  });

  test("partial proposals identify both sold-out and duplicate variants", () => {
    const result = planBudgetAdditions(
      [{ variantId: "gone", label: "Sold out" }, { variantId: "rice", label: "Rice" }, { variantId: "rice", label: "Rice again" }],
      [product("gone", { available: false }), product("rice")], 1000,
    );
    expect(result.lines).toHaveLength(1);
    expect(result.skipped).toEqual([
      "Sold out: unavailable or stock could not be verified", "Rice again: duplicate variant",
    ]);
  });

  test("invalid amount and malformed prices fail closed", () => {
    const invalid = product("rice", { priceMinor: Number.NaN });
    expect(savedCartAddition([invalid], "rice")).toBeNull();
    expect(planBudgetAdditions([{ variantId: "rice", label: "Rice" }], [product("rice")], -1).lines).toEqual([]);
  });

  test("account UI checks saved items before additions and communicates skip reasons", () => {
    const page = readFileSync("src/app/(storefront)/account/lists/page.tsx", "utf8");
    expect(page).toContain("const products = await apiOps.byVariants([wish.variantId])");
    expect(page).toContain("const line = savedCartAddition(products, wish.variantId)");
    expect(page).toContain("planBudgetAdditions(basket.items, products, basketBudgetMinor)");
    expect(page).toContain("Some items were skipped:");
    expect(page).toContain("budget covers item subtotal, not delivery");
  });
});
