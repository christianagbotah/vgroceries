import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { productImageFor } from "../src/lib/product-image-map";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("rich storefront visual system", () => {
  test("mock catalogue uses photographic product imagery instead of sketch svg placeholders", () => {
    const tomato = productImageFor("fresh-tomatoes");
    const unknown = productImageFor("unknown-product");

    expect(tomato).toStartWith("https://images.unsplash.com/");
    expect(tomato).not.toEndWith(".svg");
    expect(unknown).toStartWith("https://images.unsplash.com/");
  });

  test("homepage contains the approved rich grocery composition", () => {
    const page = read("src/app/(storefront)/page.tsx");

    expect(page).toContain("storefront-hero");
    expect(page).toContain("Fresh Groceries");
    expect(page).toContain("category-image-grid");
    expect(page).toContain("storefront-promo-grid");
    expect(page).toContain("Featured products");
  });

  test("legacy Z logo is fully retired from public branding and metadata", () => {
    const legacyLogo = read("public/logo.svg");
    const mark = read("public/brand/variety-mark.svg");
    const layout = read("src/app/layout.tsx");

    expect(legacyLogo).not.toContain("z-breathe");
    expect(legacyLogo).toContain("Variety Groceries V mark");
    expect(legacyLogo).toBe(mark);
    expect(layout).toContain('icon: "/brand/variety-mark.svg"');
    expect(layout).toContain('apple: "/brand/variety-mark.svg"');
  });

  test("storefront shell uses V branding and commerce-style header/footer", () => {
    const shell = read("src/components/layout/storefront-shell.tsx");

    expect(shell).toContain("/brand/variety-mark.svg");
    expect(shell).toContain("All Categories");
    expect(shell).toContain("Deliver to");
    expect(shell).toContain("storefront-footer-rich");
    expect(shell).toContain("<Brand compact inverse />");
  });

  test("product tiles expose rich photo cards and clear add-to-cart action", () => {
    const tile = read("src/features/catalog/product-tile.tsx");

    expect(tile).toContain("product-card-photo");
    expect(tile).toContain("Add to cart");
    expect(tile).toContain("Wishlist");
  });

  test("product tiles prefer approved featured media for both display and cart snapshots", () => {
    const tile = read("src/features/catalog/product-tile.tsx");

    expect(tile).toContain("product.featuredImage?.url ?? product.image");
    expect(tile).toContain("const productImage");
    expect(tile).toContain("image: productImage");
  });

  test("product detail renders the approved featured image and ordered gallery thumbnails", () => {
    const product = read("src/app/(storefront)/products/[slug]/page.tsx");

    expect(product).toContain('from "@/features/catalog/product-media-gallery"');
    expect(product).toContain("<ProductMediaGallery");
    expect(product).toContain("featuredImage={entry.featuredImage}");
    expect(product).toContain("gallery={entry.gallery}");
    expect(product).toContain("fallbackImage={entry.image}");
  });

  test("shop, category and product routes carry the rich visual system beyond the homepage", () => {
    const shop = read("src/app/(storefront)/shop/page.tsx");
    const categories = read("src/app/(storefront)/categories/page.tsx");
    const category = read("src/app/(storefront)/categories/[slug]/page.tsx");
    const product = read("src/app/(storefront)/products/[slug]/page.tsx");

    expect(shop).toContain("shop-rich-header");
    expect(categories).toContain("category-photo-card");
    expect(categories).toContain("categoryImageFor");
    expect(category).toContain("category-rich-hero");
    expect(product).toContain("product-detail-photo");
    expect(product).not.toContain("Representative product art");
  });
});
