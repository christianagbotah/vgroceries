import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const rollout = () => readFileSync(join(root, "deploy/scripts/rollout-portal-live-api-uat.sh"), "utf8");
const nginx = () => readFileSync(join(root, "deploy/nginx/varietygroceries-api-proxy.conf"), "utf8");
const unit = () => readFileSync(join(root, "deploy/systemd/varietygroceries-portal.service"), "utf8");

describe("portal live API UAT rollout", () => {
  test("proxies only the portal API namespace to the local NestJS listener", () => {
    const source = nginx();
    expect(source).toContain("location ^~ /api/v1/");
    expect(source).toContain("proxy_pass http://127.0.0.1:3027/api/v1/");
    expect(source).toContain("proxy_set_header X-Forwarded-Proto $scheme");
  });

  test("runs the standalone portal with Node 24 and protected runtime env", () => {
    const source = unit();
    expect(source).toContain("EnvironmentFile=/home/lightworld/config/varietygroceries/portal.env");
    expect(source).toContain("ExecStart=/home/lightworld/runtime/node24/bin/node server.js");
    expect(source).toContain("WorkingDirectory=/home/lightworld/webapps/varietygroceries-portal-current");
    expect(source).toContain("ReadWritePaths=/home/lightworld/webapps/varietygroceries-portal-current/.next/cache");
  });

  test("rollout writes the live-backend env, preserves Coming Soon, and has rollback", () => {
    const source = rollout();
    expect(source).toContain("API_BASE_URL=http://127.0.0.1:3027/api/v1");
    expect(source).toContain("NEXT_PUBLIC_API_BASE_URL=https://portal.varietygroceries.com/api/v1");
    expect(source).toContain("https://portal.varietygroceries.com/api/v1/health/live");
    expect(source).toContain("https://varietygroceries.com/");
    expect(source).toContain("rollback()");
    expect(source).toContain("nginx -t");
    expect(source).toContain('install -d -o lightworld -g lightworld -m 0755 "$PORTAL_RELEASE_DIR/.next/cache"');
  });
});
