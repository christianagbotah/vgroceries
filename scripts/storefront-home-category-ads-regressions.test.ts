import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("storefront category filtering", () => {
  test("navigation and shop controls use stable category slugs", () => {
    const shell = read("src/components/layout/storefront-shell.tsx");
    const filters = read("src/features/catalog/shop-filters.tsx");
    expect(shell).toContain('/shop?category=fresh-produce');
    expect(shell).toContain('/shop?category=dairy-eggs');
    expect(shell).not.toMatch(/category=cat_[a-z]/);
    expect(filters).toContain("value={c.slug}");
    expect(filters).toContain("category-filter-chips");
    expect(filters).toContain("aria-current={active ? \"page\" : undefined}");
  });

  test("catalog backend accepts a stable category slug as well as an internal id", () => {
    const catalog = read("apps/api/src/catalog/catalog.service.ts");
    expect(catalog).toContain("c.id=${query.category}");
    expect(catalog).toContain("c.slug=${query.category}");
  });

  test("header category picker is a dropdown and tabs highlight only the selected category", () => {
    const shell = read("src/components/layout/storefront-shell.tsx");
    expect(shell).toContain("DropdownMenuTrigger");
    expect(shell).toContain("DropdownMenuContent");
    expect(shell).toContain("Browse all categories");
    expect(shell).toContain("useSearchParams");
    expect(shell).toContain('searchParams.get("category")');
    expect(shell).toContain("selectedCategory === item.category");
    expect(shell).toContain("bg-[color:var(--brand-green-deep)] text-white");
    expect(shell).toContain('aria-current={isActive(item) ? "page" : undefined}');
  });
});

describe("richer storefront homepage", () => {
  test("home keeps substantial discovery and service sections around live product rails", () => {
    const home = read("src/app/(storefront)/page.tsx");
    for (const marker of [
      'id="home-offers"',
      'id="home-fresh"',
      'id="home-essentials"',
      'id="home-arrivals"',
      'id="home-shop-by-need"',
      'id="home-how-it-works"',
      'id="home-customer-tools"',
    ]) expect(home).toContain(marker);
    for (const copy of [
      "Offers worth adding",
      "Fresh from the market",
      "Everyday essentials",
      "Fresh arrivals",
      "Shop by lifestyle and need",
      "How Variety works",
      "Plan, track and repeat your shop",
    ]) expect(home).toContain(copy);
  });
});

describe("Google AdSense readiness", () => {
  test("AdSense code is site-wide, slots are opt-in, and ads.txt is root-served", () => {
    expect(existsSync("src/components/ads/adsense-slot.tsx")).toBe(true);
    expect(existsSync("src/app/ads.txt/route.ts")).toBe(true);
    const layout = read("src/app/layout.tsx");
    const slot = read("src/components/ads/adsense-slot.tsx");
    const home = read("src/app/(storefront)/page.tsx");
    const adsTxt = read("src/app/ads.txt/route.ts");
    expect(layout).toContain("NEXT_PUBLIC_ADSENSE_CLIENT");
    expect(layout).toContain("pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=");
    expect(slot).toContain('data-ad-format="auto"');
    expect(slot).toContain('data-full-width-responsive="true"');
    expect(home).toContain("NEXT_PUBLIC_ADSENSE_HOME_TOP_SLOT");
    expect(home).toContain("NEXT_PUBLIC_ADSENSE_HOME_MID_SLOT");
    expect(home).toContain("NEXT_PUBLIC_ADSENSE_HOME_BOTTOM_SLOT");
    expect(adsTxt).toContain("f08c47fec0942fa0");
    expect(adsTxt).toContain("NEXT_PUBLIC_ADSENSE_CLIENT");
    expect(layout + slot + adsTxt).not.toMatch(/ca-pub-0{8,}|pub-0{8,}/);
  });
});
