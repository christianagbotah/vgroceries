import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const rolloutPath = join(repoRoot, "deploy/scripts/rollout-product-media-uat.sh");
const nginxPath = join(repoRoot, "deploy/nginx/varietygroceries-product-media.conf");

function rolloutSource() {
  expect(existsSync(rolloutPath)).toBe(true);
  return readFileSync(rolloutPath, "utf8");
}

describe("Product Media UAT rollout contract", () => {
  test("is fail-fast, configurable, and never deploys the public Coming Soon root", () => {
    const source = rolloutSource();

    expect(source).toContain("set -euo pipefail");
    expect(source).toContain("APP_ROOT=");
    expect(source).toContain("SHARED_ROOT=");
    expect(source).toContain("PORTAL_BASE_URL=");
    expect(source).toContain("NGINX_SNIPPET_TARGET=");
    expect(source).not.toContain("/home/lightworld/webapps/varietygroceries/index.html");
    expect(source).not.toMatch(/rm\s+-rf\s+\/home\/lightworld\/webapps\/varietygroceries(?:\s|\/)/);
  });

  test("prepares isolated public/private media roots and runs database migration before dry-run and import", () => {
    const source = rolloutSource();

    expect(source).toContain('"$SHARED_ROOT/product-media/public"');
    expect(source).toContain('"$SHARED_ROOT/product-media/private"');
    expect(source).toContain("migrate:deploy");
    expect(source).toContain("media:import-legacy -- --dry-run");
    expect(source).toContain("media:import-legacy");

    const migrationIndex = source.indexOf("migrate:deploy");
    const dryRunIndex = source.indexOf("media:import-legacy -- --dry-run");
    const importIndex = source.lastIndexOf("media:import-legacy");
    expect(migrationIndex).toBeGreaterThan(-1);
    expect(dryRunIndex).toBeGreaterThan(migrationIndex);
    expect(importIndex).toBeGreaterThan(dryRunIndex);
  });

  test("validates nginx before reload, serves a public probe, and proves private media is denied", () => {
    const source = rolloutSource();
    const nginx = readFileSync(nginxPath, "utf8");

    const nginxTestIndex = source.indexOf("nginx -t");
    const nginxReloadIndex = source.indexOf("reload nginx");
    expect(nginxTestIndex).toBeGreaterThan(-1);
    expect(nginxReloadIndex).toBeGreaterThan(nginxTestIndex);
    expect(source).toContain("/media/private/");
    expect(source).toContain("/media/products/");
    expect(source).toMatch(/404/);
    expect(source).toMatch(/200/);

    expect(nginx).toContain("location ^~ /media/products/");
    expect(nginx).toContain("product-media/public/");
    expect(nginx).toContain("location ~ ^/media/(?:private|draft|review)/");
    expect(nginx).toContain("return 404;");
  });

  test("installs and verifies the worker and validates the configured AI provider without printing secrets", () => {
    const source = rolloutSource();

    expect(source).toContain("varietygroceries-media-worker.service");
    expect(source).toContain("daemon-reload");
    expect(source).toContain("enable --now");
    expect(source).toContain("is-active --quiet");
    expect(source).toContain("AI_IMAGE_PROVIDER");
    expect(source).toContain("OPENAI_API_KEY");
    expect(source).not.toMatch(/echo\s+.*OPENAI_API_KEY/);
  });
});
