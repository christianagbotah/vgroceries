#!/usr/bin/env node
/**
 * Dispatch + Rider readiness responsive QA sweep (2026-10-13).
 * 360/390/768/1024/1440 on the wave's routes. For each viewport × route:
 * loads the page (with rider/staff demo session pre-seeded), checks
 * documentElement horizontal overflow, and saves screenshots for key views.
 * Uses the agent-browser CLI against the PRODUCTION build on :3000.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "docs/qa/evidence/zai-dispatch-rider-readiness-20261013";
const ROUTES = [
  { path: "/admin", name: "admin-dashboard", staff: "owner", shot: ["mobile", "desktop"] },
  { path: "/admin/fulfilment", name: "admin-fulfilment-handover", staff: "operations_manager", shot: ["desktop"] },
  { path: "/admin/dispatch", name: "admin-dispatch", staff: "dispatcher", shot: ["mobile", "tablet", "desktop"] },
  { path: "/admin/riders", name: "admin-riders", staff: "dispatcher", shot: ["mobile", "desktop"] },
  { path: "/rider/login", name: "rider-login", shot: ["mobile"] },
  { path: "/rider", name: "rider-dashboard", rider: "rdr_yaw", shot: ["mobile", "desktop"] },
  { path: "/rider/jobs/job_5001", name: "rider-job-out-for-delivery", rider: "rdr_yaw", shot: ["mobile", "desktop"] },
  { path: "/rider/history", name: "rider-history", rider: "rdr_yaw", shot: ["mobile"] },
];
const VIEWPORTS = [
  { w: 360, h: 780, dir: "w360" },
  { w: 390, h: 844, dir: "mobile" },
  { w: 768, h: 1024, dir: "tablet" },
  { w: 1024, h: 768, dir: "laptop" },
  { w: 1440, h: 900, dir: "desktop" },
];

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", timeout: 90_000, stdio: ["ignore", "pipe", "ignore"] });
for (const dir of new Set([...VIEWPORTS.map((v) => v.dir), "extra"])) {
  mkdirSync(`${OUT}/${dir}`, { recursive: true });
}

// storage needs an open page for origin context
sh("agent-browser", ["open", BASE]);
execFileSync("sleep", ["1"], { stdio: "ignore" });

const failures = [];
let checked = 0;

for (const vp of VIEWPORTS) {
  sh("agent-browser", ["set", "viewport", String(vp.w), String(vp.h)]);
  for (const route of ROUTES) {
    try {
      // seed demo sessions for the surface under test
      if (route.staff) sh("agent-browser", ["storage", "local", "set", "vg-staff-role-v1", route.staff]);
      if (route.rider) sh("agent-browser", ["storage", "local", "set", "vg-rider-id-v1", route.rider]);
      sh("agent-browser", ["open", `${BASE}${route.path}`]);
      // fixed settle delay: rider pages auto-poll (network-idle never fires)
      execFileSync("sleep", ["1.5"], { stdio: "ignore" });
      // horizontal overflow check on <html>
      const overflow = sh("agent-browser", [
        "eval",
        "Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) - document.documentElement.clientWidth",
      ]).trim();
      checked++;
      const overflowPx = Number(overflow);
      if (Number.isFinite(overflowPx) && overflowPx > 1) {
        failures.push(`${vp.dir} ${route.path}: horizontal overflow ${overflowPx}px`);
      }
      if (route.shot.includes(vp.dir)) {
        sh("agent-browser", ["screenshot", `${OUT}/${vp.dir}/${route.name}-${vp.w}px.png`]);
      }
    } catch (e) {
      failures.push(`${vp.dir} ${route.path}: ${String(e).slice(0, 120)}`);
    }
  }
}

console.log(`Checked ${checked} route × viewport combinations.`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  " + f);
  process.exit(1);
} else {
  console.log("No horizontal overflow detected at any viewport.");
}
