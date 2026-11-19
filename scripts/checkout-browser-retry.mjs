/**
 * Isolated browser acceptance for checkout replay behaviour.
 *
 * Runs against the CI-built demo storefront. POST checkout/complete is
 * intercepted: no order, payment, stock movement or external request occurs.
 * The test must never point at a live production API.
 *
 * Setup: npm install --prefix /tmp/vg-pw --no-save playwright-core@1.56.1
 *        npx --yes playwright@1.56.1 install chromium
 * Run:   PLAYWRIGHT_CORE_PATH=/tmp/vg-pw/node_modules/playwright-core \
 *        node scripts/checkout-browser-retry.mjs http://127.0.0.1:3000
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");
const root = new URL(process.argv[2] || "http://127.0.0.1:3000");
if (!["127.0.0.1", "localhost"].includes(root.hostname)) {
  throw new Error("Browser checkout test refuses non-local destinations.");
}
const attemptStorageKey = "vg_checkout_attempt_v1";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(20_000);
  const shopUrl = new URL("/shop", root).href;
  const checkoutUrl = new URL("/checkout", root).href;
  let unauthorizedExternalCalls = [];
  page.on("request", req => {
    // Loaded product imagery and fonts may use external hosts; never permit
    // checkout completion to escape our isolated local HTTP service.
    if (req.isNavigationRequest() && !req.url().startsWith(root.origin)) {
      unauthorizedExternalCalls.push(req.url());
    }
  });

  const shop = await page.goto(shopUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  assert.equal(shop?.status(), 200, "Shop must return HTTP 200");
  // Wait for the client component to hydrate before pressing Quick Add.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.getByRole("button", { name: /^Add .+ to cart$/ }).first().click();
  await page.waitForFunction(() => {
    try {
      const persisted = JSON.parse(localStorage.getItem("vg-cart-v1") || "null");
      return Array.isArray(persisted?.state?.lines) && persisted.state.lines.length > 0;
    } catch { return false; }
  }, undefined, { timeout: 12_000 }).catch(() => { throw new Error("Quick Add did not persist a cart item; refusing an empty-cart checkout test."); });
  const checkout = await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  assert.equal(checkout?.status(), 200, "Checkout must return HTTP 200");
  const guest = page.getByRole("button", { name: "Continue as guest" });
  const collectionRadio = page.locator("#ful-collection");
  // Checkout initially renders a loading state while loading zones/account.
  try {
    await guest.or(collectionRadio).first().waitFor({ state: "visible", timeout: 45_000 });
  } catch (error) {
    const headings = await page.locator("h1,h2").allTextContents();
    const persistedLineCount = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem("vg-cart-v1") || "null")?.state?.lines?.length ?? 0; }
      catch { return -1; }
    });
    console.error("CHECKOUT_UI_DIAGNOSTIC", { pageUrl: page.url(), headings, persistedLineCount });
    throw error;
  }
  if (await guest.isVisible()) await guest.click();
  await collectionRadio.click({ force: true });
  await page.locator("#co-name").fill("Browser QA Customer");
  await page.locator("#co-phone").fill("+233241111111");
  await page.locator("#pay-cash_counter").click({ force: true });

  const seen = [];
  page.on("pageerror", error => console.error("CHECKOUT_BROWSER_JS_ERROR", error.message.slice(0, 350)));
  page.on("response", response => {
    if (response.url().includes("/checkout/complete"))
      console.log("CHECKOUT_INTERCEPTED_RESPONSE_STATUS", response.status());
  });
  const replies = ["NETWORK", "NETWORK", "OUT_OF_STOCK", "OUT_OF_STOCK"];
  await page.route("**/api/mock/v1/checkout/complete", async route => {
    const request = route.request();
    const body = request.postDataJSON();
    seen.push({ key: request.headers()["idempotency-key"], body });
    const code = replies[Math.min(seen.length - 1, replies.length - 1)];
    await route.fulfill({
      status: code === "NETWORK" ? 503 : 409,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { code, message: code === "NETWORK" ? "Checkout outcome could not be confirmed." : "Product is no longer available." },
      }),
    });
  });
  const place = page.getByRole("button", { name: /^Place order/ });
  async function submitAndWaitForRequest(count) {
    await place.click();
    for (let i = 0; i < 100 && seen.length < count; i++) await page.waitForTimeout(100);
    assert.equal(seen.length, count, `Expected ${count} isolated checkout POSTs`);
  }
  async function expectVisibleError(message) {
    try {
      await page.getByRole("alert").filter({ hasText: message }).waitFor({ timeout: 12_000 });
    } catch (error) {
      const actualAlerts = await page.locator('[role="alert"]').allTextContents();
      const pageTail = (await page.locator("main").innerText().catch(() => "(no main element)" )).slice(-1100);
      console.error("CHECKOUT_ERROR_FEEDBACK_DIAGNOSTIC", JSON.stringify({
        currentUrl: page.url(), interceptedPosts: seen.length, actualAlerts, pageTail,
      }));
      throw error;
    }
  }
  await submitAndWaitForRequest(1);
  await expectVisibleError("Checkout outcome could not be confirmed.");
  assert.equal(seen.length, 1, "First submit must make one POST");
  const key1 = seen[0].key;
  assert.match(key1, /^co_[0-9a-f]{32}$/);
  assert.equal(seen[0].body.idempotencyKey, key1, "Body and HTTP replay key must match");
  assert.equal(await page.evaluate(k => sessionStorage.getItem(k), attemptStorageKey), key1, "Network failure retains key");

  // Retrying with unchanged details cannot mint a different order identity.
  await submitAndWaitForRequest(2);
  await expectVisibleError("Checkout outcome could not be confirmed.");
  assert.equal(seen.length, 2, "Second click makes one additional POST");
  assert.equal(seen[1].key, key1, "Ambiguous HTTP outcome must keep same key");
  assert.deepEqual(seen[1].body, seen[0].body, "Body is identical on ambiguous retry");

  // Server-confirmed pre-commit shortage must permit a corrected new attempt.
  await submitAndWaitForRequest(3);
  await expectVisibleError("Product is no longer available.");
  assert.equal(seen.length, 3);
  assert.equal(seen[2].key, key1);
  assert.equal(await page.evaluate(k => sessionStorage.getItem(k), attemptStorageKey), null, "Definite rejection releases key");
  await submitAndWaitForRequest(4);
  await expectVisibleError("Product is no longer available.");
  assert.equal(seen.length, 4);
  assert.match(seen[3].key, /^co_[0-9a-f]{32}$/);
  assert.notEqual(seen[3].key, key1, "Corrected attempt must have a new replay identity");
  assert.equal(seen[3].body.idempotencyKey, seen[3].key);
  assert.deepEqual(unauthorizedExternalCalls, [], "No external page navigation");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true, "No viewport-wide horizontal overflow at mobile width");
  console.log("CHECKOUT_BROWSER_RETRY_PASS: 4 isolated POSTs, stable ambiguous replay key, fresh key after definite rejection, no mobile overflow");
} finally {
  await browser.close();
}
