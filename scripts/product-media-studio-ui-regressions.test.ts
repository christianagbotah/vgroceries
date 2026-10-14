import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const productDetail = readFileSync("src/app/admin/products/[id]/page.tsx", "utf8");

describe("Product Media Studio admin integration", () => {
  test("product detail mounts the dedicated media studio", () => {
    expect(productDetail).toContain('from "@/features/catalog/product-media-studio"');
    expect(productDetail).toContain("<ProductMediaStudio");
    expect(productDetail).toContain("productId={detail.id}");
    expect(productDetail).toContain("productName={detail.name}");
  });
});
