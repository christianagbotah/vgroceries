import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const hero = readFileSync("src/features/catalog/storefront-editorial-hero.tsx", "utf8");
const homepage = readFileSync("src/app/(storefront)/page.tsx", "utf8");

describe("compact full-bleed storefront hero", () => {
  test("one photographic canvas with image over the complete banner, not a text/image grid", () => {
    expect(hero).toContain('className="absolute inset-0 z-0"');
    expect(hero).toContain('sizes="100vw"');
    expect(hero).toContain('className="object-cover object-[62%_center] md:object-center"');
    expect(hero).toContain("linear-gradient(90deg,rgba(3,37,29,.97)");
    expect(hero).toContain("rgba(3,37,29,.08) 100%");
    expect(hero).not.toContain("lg:grid-cols-");
    expect(hero).not.toContain("Featured grocery photography");
  });

  test("short banner fits into a laptop viewport and does not stack photography below the copy", () => {
    expect(hero).toContain('min-[360px]:h-[410px] sm:h-[370px] lg:h-[clamp(350px,43vh,430px)]');
    expect(hero).not.toContain("lg:min-h-[570px]");
    expect(hero).not.toContain("h-[300px]");
    expect(hero).toContain("absolute inset-x-0 bottom-0");
    expect(hero).toContain('min-h-[52px]');
  });

  test("product title and smaller From price flow inline and wrap only as screen width requires", () => {
    expect(hero).toContain('productSlide ? "text-[clamp(1.8rem,3vw,2.75rem)]"');
    expect(hero).toContain('text-[.78em] font-bold');
    expect(hero).toContain('<span>{current.headline}</span>');
    expect(hero).toContain('}>{current.emphasis}</span>');
    expect(hero).not.toContain('mt-1 block text-[#f7c76f]');
  });

  test("autoplay runs on hover and focus until explicit pause is clicked", () => {
    expect(hero).toContain("const AUTO_ADVANCE_MS = 5600");
    expect(hero).toContain("window.setInterval");
    expect(hero).toContain('document.visibilityState === "visible"');
    expect(hero).toContain("playbackStopped");
    expect(hero).toContain("useReducedMotion()");
    expect(hero).not.toContain("onMouseEnter");
    expect(hero).not.toContain("onFocusCapture");
    expect(hero).not.toContain("setPaused");
    expect(hero).toContain('aria-label={playbackStopped ? "Play featured slideshow" : "Pause featured slideshow"}');
  });

  test("mobile CTA buttons remain on a single row without overflow", () => {
    expect(hero).toContain("grid min-w-0 grid-cols-2 items-stretch gap-2 sm:flex");
    expect(hero).toContain("min-w-0 break-words");
    expect(hero).toContain("min-h-11");
    expect(hero).toContain('href={current.ctaHref}');
    expect(hero).toContain('href={current.secondaryCtaHref}');
  });

  test("preserves approved catalogue product slides and real prices rather than invented promotions", () => {
    expect(hero).toContain("product.featuredImage?.url || product.image");
    expect(hero).toContain("product.minPriceLabel");
    expect(hero).toContain("!product.anyAvailable");
    expect(homepage).toContain("featuredProducts=");
  });
});
