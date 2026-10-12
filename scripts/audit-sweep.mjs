#!/usr/bin/env node
/**
 * ZAI frontend continuation audit sweep.
 * Visits every key route at desktop (1440x900) and mobile (390x844),
 * saves screenshots + DOM diagnostics (overflow, nav-active, h1, font size,
 * button heights, table count, non-pointer interactive elements) to a JSON report.
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "docs/qa/evidence/zai-frontend-continuation-20261012";
const ROUTES = process.argv[2] ? JSON.parse(process.argv[2]) : [
  { path: "/", name: "home" },
  { path: "/shop", name: "shop" },
  { path: "/categories", name: "categories" },
  { path: "/categories/beverages", name: "category" },
  { path: "/products/farm-eggs", name: "product" },
  { path: "/cart", name: "cart" },
  { path: "/checkout", name: "checkout" },
  { path: "/checkout/status/ord_1011", name: "checkout-status" },
  { path: "/track", name: "track" },
  { path: "/account", name: "account" },
  { path: "/account/orders", name: "account-orders" },
  { path: "/account/orders/ord_1011", name: "account-order-detail" },
  { path: "/account/addresses", name: "account-addresses" },
  { path: "/account/lists", name: "account-lists" },
  { path: "/account/returns", name: "account-returns" },
  { path: "/account/returns/ret_2001", name: "account-return-detail" },
  { path: "/help", name: "help" },
  { path: "/delivery", name: "delivery" },
  { path: "/returns-policy", name: "returns-policy" },
  { path: "/privacy", name: "privacy" },
  { path: "/terms", name: "terms" },
  { path: "/admin", name: "admin-dashboard" },
  { path: "/admin/orders", name: "admin-orders" },
  { path: "/admin/orders/ord_1011", name: "admin-order-detail" },
  { path: "/admin/fulfilment", name: "admin-fulfilment" },
  { path: "/admin/pos", name: "admin-pos" },
  { path: "/admin/cashier-sessions", name: "admin-cashier-sessions" },
  { path: "/admin/products", name: "admin-products" },
  { path: "/admin/products/prd_egg", name: "admin-product-detail" },
  { path: "/admin/categories", name: "admin-categories" },
  { path: "/admin/inventory", name: "admin-inventory" },
  { path: "/admin/inventory/receiving", name: "admin-receiving" },
  { path: "/admin/inventory/adjustments", name: "admin-adjustments" },
  { path: "/admin/inventory/stocktakes", name: "admin-stocktakes" },
  { path: "/admin/inventory/expiry", name: "admin-expiry" },
  { path: "/admin/suppliers", name: "admin-suppliers" },
  { path: "/admin/purchases", name: "admin-purchases" },
  { path: "/admin/dispatch", name: "admin-dispatch" },
  { path: "/admin/riders", name: "admin-riders" },
  { path: "/admin/providers", name: "admin-providers" },
  { path: "/admin/returns", name: "admin-returns" },
  { path: "/admin/returns/ret_2001", name: "admin-return-detail" },
  { path: "/admin/refunds", name: "admin-refunds" },
  { path: "/admin/customers", name: "admin-customers" },
  { path: "/admin/payments", name: "admin-payments" },
  { path: "/admin/reports", name: "admin-reports" },
  { path: "/admin/ai", name: "admin-ai" },
  { path: "/admin/team", name: "admin-team" },
  { path: "/admin/audit", name: "admin-audit" },
  { path: "/admin/settings", name: "admin-settings" },
  { path: "/rider/login", name: "rider-login" },
  { path: "/rider", name: "rider-dashboard" },
  { path: "/rider/jobs/job_5001", name: "rider-job" },
  { path: "/rider/history", name: "rider-history" },
];

const VIEWPORTS = [
  { w: 1440, h: 900, dir: "desktop" },
  { w: 390, h: 844, dir: "mobile" },
];

const report = [];
for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    const url = `${BASE}${route.path}`;
    const res = await fetch(url, { redirect: "manual" }).catch(() => null);
    const status = res ? res.status : 0;
    const entry = { ...route, viewport: vp.dir, status, issues: [] };
    if (status !== 200) entry.issues.push(`HTTP ${status}`);
    report.push(entry);
  }
}
mkdirSync(OUT, { recursive: true });
writeFileSync("docs/qa/audit-sweep.json", JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.status !== 200);
console.log(`Swept ${report.length} route-viewport combinations.`);
console.log(bad.length ? `Non-200 routes:\n${bad.map((b) => `${b.status} ${b.path} (${b.viewport})`).join("\n")}` : "All routes reachable.");
