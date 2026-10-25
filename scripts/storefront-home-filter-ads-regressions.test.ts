import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("rich storefront home, stable category filters and AdSense readiness", () => {
  test("storefront navigation uses stable category slugs rather than seed-specific ids", () => {
    const shell = read("src/components/layout/storefront-shell.tsx");
    for (const legacy of ["cat_fp", "cat_gs", "cat_os", "cat_de", "cat_bv", "cat_sn", "cat_mf"]) {
      expect(shell).not.toContain(`category=${legacy}`);
    }
    for (const slug of ["fresh-produce", "grains-staples", "dairy-eggs", "beverages"]) {
      expect(shell).toContain(`slug: "${slug}"`);
    }
    expect(shell).toContain('href: `/shop?category=${category.slug}`');
  });

  test("shop category select emits stable slugs", () => {
    const filters = read("src/features/catalog/shop-filters.tsx");
    expect(filters).toContain("value={c.slug}");
    expect(filters).not.toContain("value={c.id}");
  });

  test("catalogue backend accepts either category slug or id", () => {
    const service = read("apps/api/src/catalog/catalog.service.ts");
    expect(service).toContain('c.slug=${query.category}');
    expect(service).toContain('c.id=${query.category}');
  });

  test("homepage has multiple useful shopping and service sections", () => {
    const home = read("src/app/(storefront)/page.tsx");
    for (const heading of [
      "Today’s value picks",
      "Fresh from the market",
      "Pantry & everyday staples",
      "Drinks, snacks & family favourites",
      "Home & personal care",
      "How Variety works",
      "Plan your next basket",
    ]) expect(home).toContain(heading);
    expect(home).toContain("AdSenseSlot");
    expect(home).toContain("getShopData");
  });

  test("AdSense is opt-in, responsive and supports ads.txt", () => {
    expect(existsSync("src/components/ads/adsense-slot.tsx")).toBe(true);
    expect(existsSync("src/app/ads.txt/route.ts")).toBe(true);
    const layout = read("src/app/layout.tsx");
    const slot = read("src/components/ads/adsense-slot.tsx");
    const adsTxt = read("src/app/ads.txt/route.ts");
    const rollout = read("deploy/scripts/rollout-portal-live-api-uat.sh");
    expect(layout).toContain("NEXT_PUBLIC_ADSENSE_CLIENT");
    expect(layout).toContain("pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=");
    expect(slot).toContain('data-ad-format="auto"');
    expect(slot).toContain('data-full-width-responsive="true"');
    expect(adsTxt).toContain("f08c47fec0942fa0");
    expect(adsTxt).toContain("NEXT_PUBLIC_ADSENSE_CLIENT");
    expect(rollout).toContain("NEXT_PUBLIC_ADSENSE_HOME_TOP_SLOT");
    expect(rollout).toContain("ADSENSE_ENV_LINES");
    expect(existsSync("docs/ADSENSE.md")).toBe(true);
  });
});
