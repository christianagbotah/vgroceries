#!/usr/bin/env node
/**
 * Route sweep — curls every implemented route and reports HTTP status.
 * Dynamic segments are resolved with seeded demo instances.
 * Usage: node scripts/route-sweep.mjs [baseUrl]
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const BASE = process.argv[2] || "http://localhost:3000";
const APP = join(process.cwd(), "src", "app");

// Seeded demo instances for each dynamic route.
const DYNAMIC = {
  "/categories/[slug]": "beverages",
  "/products/[slug]": "farm-eggs",
  "/checkout/status/[id]": "ord_1011",
  "/account/orders/[id]": "ord_1011",
  "/account/returns/[id]": "ret_2001",
  "/admin/orders/[id]": "ord_1011",
  "/admin/products/[id]": "prd_egg",
  "/admin/returns/[id]": "ret_2001",
  "/rider/jobs/[id]": "job_5001",
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

function toRoute(file) {
  const rel = relative(APP, file).replace(/[/\\]page\.tsx$/, "");
  // Drop route groups like (storefront)
  const segs = rel.split(/[/\\]/).filter((s) => !s.startsWith("("));
  const route = "/" + segs.join("/");
  return route === "/" ? "/" : route;
}

const files = walk(APP).sort();
const raw = files.map(toRoute);
const routes = raw.map((r) => (DYNAMIC[r] ? r.replace(/\[[^\]]+\]/, DYNAMIC[r]) : r));
const skipped = routes.filter((r) => r.includes("["));

let pass = 0;
const failures = [];
for (const route of routes) {
  const code = await fetch(BASE + route, { redirect: "follow" }).then((r) => r.status);
  if (code === 200) pass++;
  else failures.push(`${code} ${route}`);
  console.log(`${code === 200 ? "PASS" : "FAIL"} ${code} ${route}`);
}

console.log(`\nRESULT: ${pass}/${routes.length} routes HTTP 200`);
if (skipped.length) console.log(`Skipped (no seed): ${skipped.join(", ")}`);
if (failures.length) {
  console.log("Failures:\n" + failures.join("\n"));
  process.exit(1);
}
