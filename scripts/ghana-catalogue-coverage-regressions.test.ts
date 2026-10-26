import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Ghana catalogue coverage admin workflow", () => {
  test("typed client and cache registry expose the guarded coverage operation", () => {
    const client = read("src/services/client.ts");
    const registry = read("src/services/operation-registry.ts");
    const mock = read("src/services/mock/router.ts");

    expect(client).toContain("GhanaCatalogueCoverageResponse");
    expect(client).toContain('aiGhanaCatalogueCoverage: () => api<GhanaCatalogueCoverageResponse>("admin.ai.ghana-catalogue-coverage")');
    expect(registry).toContain('"admin.ai.ghana-catalogue-coverage": { tags: [...CAT, ...AI] }');
    expect(mock).toContain('case "admin.ai.ghana-catalogue-coverage"');
  });

  test("Admin AI renders four truthful coverage states and a sourcing action", () => {
    const page = read("src/app/admin/ai/page.tsx");
    expect(page).toContain('value="coverage"');
    expect(page).toContain("Catalogue coverage");
    expect(page).toContain("Wrong form only");
    expect(page).toContain("Out of stock");
    expect(page).toContain("Missing");
    expect(page).toContain("Available");
    expect(page).toContain("mealCount");
    expect(page).toContain("wrongFormProducts");
    expect(page).toContain("matchingProducts");
    expect(page).toContain("source=ghana-ai");
    expect(page).toContain("encodeURIComponent(row.suggestedProductName)");
  });

  test("AI sourcing deep-link opens an unpublished draft form with only name and slug prefilled", () => {
    const products = read("src/app/admin/products/page.tsx");
    expect(products).toContain("new URLSearchParams(window.location.search)");
    expect(products).toContain('params.get("newProduct") === "1"');
    expect(products).toContain('params.get("source") === "ghana-ai"');
    expect(products).toContain('const prefillName = params.get("name")?.trim()');
    expect(products).toContain("setName(prefillName)");
    expect(products).toContain("setSlug(slugify(prefillName))");
    expect(products).toContain("setAddOpen(true)");
    expect(products).toContain("AI coverage prefill");
    expect(products).not.toContain('params.get("category")');
    expect(products).not.toContain('params.get("price")');
    expect(products).not.toContain('params.get("unit")');
    expect(products).not.toContain('params.get("stock")');
  });
});
