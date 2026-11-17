import { describe, expect, test, afterAll, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { HttpServiceAdapter } from "../src/services/adapters/http";
import { MockServiceAdapter } from "../src/services/adapters/mock";
import { resetStore } from "../src/services/mock/store";
import { buildStorefrontHeroSlides } from "../src/features/catalog/storefront-editorial-hero";
import type { CmsHomepageView, CatalogProduct } from "../src/services/contracts";

const calls: { key: string | null; body: Record<string, unknown> }[] = [];
const api = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
  calls.push({ key: req.headers.get("Idempotency-Key"), body: await req.json() });
  return Response.json({ ok: true, data: { id: "synthetic-job", status: "queued" } });
}});
beforeEach(() => { calls.length = 0; resetStore(); });
afterAll(() => api.stop(true));

const mediaRequest = {
  mode: "unbranded_generation",
  stylePreset: "fresh_market",
  backgroundIntent: "auto",
  candidateCount: 1,
};

describe("image generation contract fix", () => {
  test("sends idempotency only in header while preserving strict generation body", async () => {
    const adapter = new HttpServiceAdapter(`http://127.0.0.1:${api.port}/api/v1`);
    await adapter.request({
      op: "admin.product-media.generate",
      query: { productId: "product-test" },
      body: mediaRequest,
      idempotencyKey: "media-generate-001",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe("media-generate-001");
    expect(calls[0].body).toEqual(mediaRequest);
    expect(calls[0].body).not.toHaveProperty("idempotencyKey");
  });

  test("mock generation keeps replay semantics while strict request validation succeeds", async () => {
    const mock = new MockServiceAdapter();
    const draft = await mock.request<{ productId: string }>({
      op: "admin.product.create",
      body: { name: "Studio Test Produce", slug: "studio-test-produce", categoryId: "cat_fresh" },
      skipValidation: true,
    });
    const options = {
      op: "admin.product-media.generate" as const,
      query: { productId: draft.productId }, body: mediaRequest,
      idempotencyKey: "generate-replay-001",
    };
    const first = await mock.request<{ id: string }>(options);
    const replay = await mock.request<{ id: string }>(options);
    expect(replay.id).toBe(first.id);
  });

  test("checkout replay body convention remains unchanged", async () => {
    const adapter = new HttpServiceAdapter(`http://127.0.0.1:${api.port}/api/v1`);
    await adapter.request({
      op: "admin.logistics.node.create",
      body: { publicName: "Accra Test" },
      idempotencyKey: "separate-key-001",
      skipValidation: true,
    });
    expect(calls[0].body.idempotencyKey).toBe("separate-key-001");
  });
});

describe("carousel and responsive navigation", () => {
  const cms: CmsHomepageView = {
    badge: "Fresh today",
    headline: "Welcome", emphasis: "to the market", body: "Everyday essentials",
    primaryCtaHref: "/shop", primaryCtaLabel: "Shop now",
    secondaryCtaHref: "/assistant", secondaryCtaLabel: "Ask",
  };
  test("carousel includes curated promos and currently saleable product images", () => {
    const product = {
      id: "p-feature", slug: "market-pepper", name: "Fresh Market Pepper",
      categoryName: "Produce", shortDescription: "Spicy cooking pepper",
      image: "https://images.unsplash.com/example.jpg", featuredImage: {
        url: "/api/media/featured-pepper", altText: "Approved pepper product packshot",
      }, minPriceLabel: "₵18.00", anyAvailable: true,
    } as CatalogProduct;
    const slides = buildStorefrontHeroSlides(cms, [product, { ...product, id: "hidden", anyAvailable: false }]);
    expect(slides.map(x => x.id)).toEqual(["welcome", "fresh", "pantry", "product-p-feature"]);
    expect(slides[0].headline).toBe("Welcome");
    expect(slides[3].image).toBe("/api/media/featured-pepper");
    expect(slides[3].ctaHref).toBe("/products/market-pepper");
    expect(slides[3].emphasis).toContain("₵18.00");
  });

  test("slideshow rotates with manual controls and respects reduced motion", () => {
    const hero = readFileSync("src/features/catalog/storefront-editorial-hero.tsx", "utf8");
    expect(hero).toContain("window.setInterval");
    expect(hero).toContain('document.visibilityState === "visible"');
    expect(hero).toContain("useReducedMotion()");
    expect(hero).toContain('aria-label="Next featured slide"');
    expect(hero).toContain('aria-label="Previous featured slide"');
    expect(hero).toContain("Pause featured slideshow");
    expect(hero).toContain('aria-roledescription="carousel"');
    expect(hero).toContain("featuredImage?.url || product.image");
  });

  test("mobile storefront menu has category icons, bounded width and independent scroll", () => {
    const shell = readFileSync("src/components/layout/storefront-shell.tsx", "utf8");
    expect(shell).toContain("w-[min(78vw,286px)]");
    expect(shell).toContain("overflow-y-auto overflow-x-hidden");
    expect(shell).toContain("CATEGORY_ICON");
    expect(shell).toContain("aria-label=\"Mobile navigation\"");
    expect(shell).toContain("min-w-0 truncate");
  });

  test("long select values and dispatch dialogs cannot stretch the viewport", () => {
    const select = readFileSync("src/components/ui/select.tsx", "utf8");
    const dialog = readFileSync("src/components/ui/dialog.tsx", "utf8");
    const dispatch = readFileSync("src/app/admin/dispatch/page.tsx", "utf8");
    expect(select).toContain("*:data-[slot=select-value]:truncate");
    expect(select).toContain("max-w-[calc(100vw-2rem)]");
    expect(select).toContain("overflow-hidden");
    expect(dialog).toContain("overflow-x-hidden");
    expect(dialog).toContain("grid-cols-[minmax(0,1fr)]");
    expect(dispatch).toContain("min-w-0 break-words");
    expect(dispatch).toContain('width: "min(calc(100vw - 2rem), 28rem)"');
    expect(dispatch).toContain('id="assign-provider" className="h-11 min-w-0 w-full max-w-full"');
  });
});
