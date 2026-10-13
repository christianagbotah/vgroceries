#!/usr/bin/env node
/**
 * Responsive QA sweep — 360/390/768/1024/1440 on the brief's important routes.
 * Uses agent-browser CLI: for each viewport × route, loads the page, checks
 * documentElement horizontal overflow, and saves a screenshot for key routes.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "docs/qa/evidence/zai-frontend-continuation-20261012";
const ROUTES = [
  { path: "/", name: "home", shot: ["mobile", "tablet", "desktop"] },
  { path: "/shop", name: "shop", shot: ["mobile", "desktop"] },
  { path: "/products/farm-eggs", name: "product", shot: ["mobile", "desktop"] },
  { path: "/cart", name: "cart", shot: ["mobile"] },
  { path: "/checkout", name: "checkout", shot: ["mobile"] },
  { path: "/track", name: "track", shot: ["mobile"] },
  { path: "/assistant", name: "assistant", shot: ["mobile", "desktop"] },
  { path: "/categories", name: "categories-index", shot: ["desktop"] },
  { path: "/admin", name: "admin-dashboard", shot: ["mobile", "desktop"] },
  { path: "/admin/orders", name: "admin-orders", shot: ["mobile", "desktop"] },
  { path: "/admin/fulfilment", name: "fulfilment", shot: ["mobile", "tablet", "desktop"] },
  { path: "/admin/pos", name: "pos", shot: ["mobile", "tablet", "desktop"] },
  { path: "/admin/inventory", name: "inventory", shot: ["mobile", "desktop"] },
  { path: "/admin/dispatch", name: "dispatch", shot: ["tablet", "desktop"] },
  { path: "/admin/returns", name: "returns", shot: ["mobile"] },
  { path: "/admin/refunds", name: "refunds", shot: ["mobile"] },
  { path: "/admin/ai", name: "ai", shot: ["desktop"] },
  { path: "/rider", name: "rider-dashboard", shot: ["mobile"] },
  { path: "/rider/jobs/job_5001", name: "rider-job", shot: ["mobile", "desktop"] },
];
const VIEWPORTS = [
  { w: 360, h: 780, dir: "w360" },
  { w: 390, h: 844, dir: "mobile" },
  { w: 768, h: 1024, dir: "tablet" },
  { w: 1024, h: 768, dir: "laptop" },
  { w: 1440, h: 900, dir: "desktop" },
];

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "ignore"] });
mkdirSync(`${OUT}/w360`, { recursive: true });
mkdirSync(`${OUT}/laptop`, { recursive: true });

const failures = [];
for (const vp of VIEWPORTS) {
  sh("agent-browser", ["set", "viewport", String(vp.w), String(vp.h)]);
  for (const route of ROUTES) {
    try {
      sh("agent-browser", ["open", `${BASE}${route.path}`]);
      sh("agent-browser", ["wait", "3000"]);
      const overflow = sh("agent-browser", ["eval", "document.documentElement.scrollWidth > document.documentElement.clientWidth"]).trim();
      const status = JSON.parse(overflow);
      if (status) failures.push(`${vp.dir} ${route.path} — horizontal overflow`);
      if (route.shot.includes(vp.dir) && (vp.dir !== "laptop")) {
        sh("agent-browser", ["screenshot", `${OUT}/${vp.dir}/${route.name}.png`]);
      }
    } catch (e) {
      failures.push(`${vp.dir} ${route.path} — load error: ${String(e).slice(0, 80)}`);
    }
  }
  console.log(`viewport ${vp.w}x${vp.h} done`);
}
console.log(failures.length ? `FAILURES:\n${failures.join("\n")}` : "All routes clean at all five viewports — no horizontal overflow.");
