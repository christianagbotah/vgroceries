/** Isolated cart geometry and local removal acceptance; never submits an order. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");
const root = new URL(process.argv[2] || "http://127.0.0.1:3000");
assert.ok(["127.0.0.1", "localhost"].includes(root.hostname), "Local QA only");
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await page.route("**/*", route => {
    const request = route.request();
    return new URL(request.url()).origin === root.origin && ["GET","HEAD"].includes(request.method())
      ? route.continue() : route.abort();
  });
  // The demo catalogue lookup may use a POST read operation; allow only that
  // exact local lookup if required by the existing registry.
  await page.route("**/api/mock/v1/**", route => {
    const req = route.request();
    const url = new URL(req.url());
    const safe = url.origin === root.origin && (["GET","HEAD"].includes(req.method()) ||
      (req.method() === "POST" && /\/by-variants$/.test(url.pathname)));
    return safe ? route.continue() : route.abort();
  });
  await page.goto(new URL("/shop",root).href);
  await page.waitForLoadState("networkidle",{timeout:15000}).catch(()=>{});
  await page.getByRole("button",{name:/^Add .+ to cart$/}).first().click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("vg-cart-v1")||"null")?.state?.lines?.length>0);
  await page.goto(new URL("/cart",root).href);
  const row=page.locator("[data-cart-line-actions]").first();
  await row.waitFor();
  const remove=row.getByRole("button",{name:/^Remove .+ from cart$/});
  const quantity=row.getByRole("group",{name:/Quantity of /});
  await quantity.waitFor();
  for (const width of [320,360,390,430,768,1280]) {
    await page.setViewportSize({width,height:844});
    const g=await row.evaluate(el=>{
      const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right};};
      const group=el.querySelector('[role="group"]'), del=el.querySelector('button[aria-label^="Remove "]');
      const controls=Array.from(group.querySelectorAll("button,input"));
      const probe=document.createElement("span");probe.className="text-destructive";el.append(probe);
      const danger=getComputedStyle(probe).color;probe.remove();
      return {row:rect(el),group:rect(group),del:rect(del),controls:controls.map(rect),
        label:getComputedStyle(del.querySelector("span")).display,
        color:getComputedStyle(del).color,danger,overflow:el.scrollWidth>el.clientWidth+1};
    });
    assert.equal(g.controls.length,3);
    assert.ok(g.controls.every(c=>Math.abs(c.y-g.del.y)<=1),"Quantity and removal must share a row");
    assert.ok(g.controls.every(c=>c.h>=44)&&g.del.h>=44&&g.del.w>=44,"Touch targets");
    assert.ok(g.group.right<=g.del.x&&g.del.right<=g.row.right+1&&g.row.right<=width+1&&!g.overflow,"No overlap or overflow");
    assert.equal(g.label==="none",width<640);
    assert.equal(g.color,g.danger,"Removal must use danger foreground");
    console.log("CART_ROW_PASS",width);
  }
  await remove.click();
  await page.getByText("Your cart is empty",{exact:true}).waitFor();
  console.log("CART_REMOVE_PASS");
} finally { await browser.close(); }
