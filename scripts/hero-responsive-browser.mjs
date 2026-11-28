/** Browser geometry acceptance against the local CI-built storefront only. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");
const root = new URL(process.argv[2] || "http://127.0.0.1:3000");
assert.ok(["127.0.0.1", "localhost"].includes(root.hostname), "Local QA only");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    try {
      await page.route("**/*", route => {
        const request = route.request();
        const url = new URL(request.url());
        return url.origin === root.origin && ["GET", "HEAD"].includes(request.method())
          ? route.continue() : route.abort();
      });
      const response = await page.goto(root.href, { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 200);
      const hero = page.locator('[data-storefront-template="freshmarket-001"]');
      const row = hero.locator("[data-hero-actions]");
      const controls = hero.getByRole("button", { name: /^Show featured slide / });
      await row.waitFor();
      const count = await controls.count();
      assert.ok(count >= 3, "At least three editorial slides must exist");
      for (let i = 0; i < count; i++) {
        const button = controls.nth(i);
        const label = await button.getAttribute("aria-label");
        const headline = label.replace(/^Show featured slide \d+: /, "");
        await button.click();
        await page.waitForFunction(({ headline, index }) => {
          const hero = document.querySelector('[data-storefront-template="freshmarket-001"]');
          return hero?.querySelectorAll('button[aria-label^="Show featured slide "]')[index]?.getAttribute("aria-current") === "true"
            && hero.querySelector("#home-hero-title")?.textContent?.startsWith(headline);
        }, { headline, index: i });
        const geometry = await row.evaluate(el => {
          const [a,b] = Array.from(el.querySelectorAll("a"));
          const rect = element => {
            const { x,y,width,height,right,bottom } = element.getBoundingClientRect();
            return { x,y,width,height,right,bottom };
          };
          return { row:rect(el), a:rect(a), b:rect(b), count:el.querySelectorAll("a").length,
            display:getComputedStyle(el).display, overflow:[a,b].some(x=>x.scrollWidth>x.clientWidth+1),
            labels:[a.textContent.trim(),b.textContent.trim()] };
        });
        assert.equal(geometry.count, 2);
        assert.equal(geometry.display, "grid");
        assert.ok(Math.abs(geometry.a.y-geometry.b.y)<=1, "Same row");
        assert.ok(Math.abs(geometry.a.width-geometry.b.width)<=1, "Equal widths");
        assert.ok(Math.abs(geometry.a.height-geometry.b.height)<=1, "Equal heights");
        assert.ok(geometry.a.height>=48 && geometry.b.height>=48, "Touch targets");
        assert.ok(geometry.a.right<=geometry.b.x && geometry.a.x>=geometry.row.x-1 && geometry.b.right<=geometry.row.right+1, "No overlap or row overflow");
        assert.ok(geometry.row.x>=0 && geometry.row.right<=width+1, "Within viewport");
        assert.ok(!geometry.overflow && geometry.labels.every(Boolean), "Readable labels without horizontal clipping");
        console.log("HERO_ROW_PASS", width, i+1, JSON.stringify(geometry.labels));
      }
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
