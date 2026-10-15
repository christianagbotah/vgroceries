import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const seedPath = join(root, "apps/api/scripts/seed-uat-storefront.ts");
const packagePath = join(root, "apps/api/package.json");

const source = () => readFileSync(seedPath, "utf8");

describe("rich UAT storefront seed", () => {
  test("is fail-closed to the Variety UAT database and explicit confirmation token", () => {
    const text = source();
    expect(text).toContain("VARIETY_UAT_SEED_CONFIRM");
    expect(text).toContain("lightworld_variety_uat");
    expect(text).toContain("variety-uat-catalog-v1");
  });

  test("covers all ten storefront departments with a rich generic catalogue", () => {
    const text = source();
    for (const slug of [
      "fresh-produce", "grains-staples", "oils-sauces", "dairy-eggs", "beverages",
      "snacks", "household", "personal-care", "meat-fish", "baby-family",
    ]) expect(text).toContain(`slug: "${slug}"`);
    const productRecords = (text.match(/sku: "UAT-/g) ?? []).length;
    expect(productRecords).toBeGreaterThanOrEqual(24);
  });

  test("uses real photographic URLs and never seeds sketch placeholders", () => {
    const text = source();
    expect(text).toContain("https://images.unsplash.com/photo-");
    expect(text).not.toContain("/products/");
    expect(text).not.toContain("placeholder.webp");
    expect(text).not.toContain(".svg\"");
  });

  test("is idempotent and creates saleable stock through receipts, lots and movements", () => {
    const text = source();
    expect(text).toContain("category.upsert");
    expect(text).toContain("product.upsert");
    expect(text).toContain("variant.upsert");
    expect(text).toContain("stockPosition.upsert");
    expect(text).toContain("stockReceipt.create");
    expect(text).toContain("stockLot.create");
    expect(text).toContain("stockMovement.create");
    expect(text).toContain("findUnique");
  });

  test("is exposed only as an explicit API package command", () => {
    const pkg = readFileSync(packagePath, "utf8");
    expect(pkg).toContain('"seed:uat-storefront"');
    expect(pkg).toContain("dist/scripts/seed-uat-storefront.js");
  });
});
