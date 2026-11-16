import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dir, "..");
const gate = join(repoRoot, "deploy/scripts/assert-canonical-portal-cutover.py");
const rollout = join(repoRoot, "deploy/scripts/rollout-portal-live-api-uat.sh");
const portalSha = "a".repeat(40);
const apiSha = "b".repeat(40);
const created: string[] = [];

function fixture(overrides: Record<string, unknown> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "vg-portal-parity-gate-"));
  created.push(directory);
  const portal = join(directory, "portal");
  const api = join(directory, "api");
  mkdirSync(portal);
  mkdirSync(api);
  writeFileSync(join(portal, "BUILD_SOURCE_GIT_SHA"), portalSha + "\n");
  writeFileSync(join(api, "BUILD_SOURCE_GIT_SHA"), apiSha + "\n");
  const approval = join(directory, "approval.json");
  writeFileSync(approval, JSON.stringify({
    schema_version: 1,
    action: "REPLACE_CANONICAL_POS_STAGING_WITH_LEGACY_3027_3037",
    approved_by: "Authorized Release Reviewer",
    approved_at_utc: new Date().toISOString(),
    portal_source_sha: portalSha,
    api_source_sha: apiSha,
    portal_port: 3037,
    api_port: 3027,
    ...overrides,
  }));
  chmodSync(approval, 0o600);
  return { approval, portal, api };
}

function check(approval: string, portal: string, api: string) {
  return spawnSync("python3", [gate, approval, portal, api], { encoding: "utf8" });
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("canonical POS staging release protection", () => {
  test("refuses missing approval before any runtime mutation", () => {
    const f = fixture();
    const result = check("", f.portal, f.api);
    expect(result.status).toBe(78);
    expect(result.stderr).toContain("one-time operator-signed approval");
  });

  test("permits only exact, fresh, source-matching release pair approval", () => {
    const f = fixture();
    const result = check(f.approval, f.portal, f.api);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Release-pair approval validated");
  });

  test("refuses mismatched portal or API commit, even with approval", () => {
    const f = fixture({ api_source_sha: "c".repeat(40) });
    expect(check(f.approval, f.portal, f.api).status).toBe(78);
    const second = fixture({ portal_source_sha: "d".repeat(40) });
    expect(check(second.approval, second.portal, second.api).status).toBe(78);
  });

  test("refuses old approvals and unexpected upstreams", () => {
    const old = fixture({ approved_at_utc: "2024-01-01T00:00:00Z" });
    expect(check(old.approval, old.portal, old.api).status).toBe(78);
    const wrongPort = fixture({ api_port: 3049 });
    expect(check(wrongPort.approval, wrongPort.portal, wrongPort.api).status).toBe(78);
  });

  test("refuses permissive approval files and unreviewed action", () => {
    const f = fixture();
    chmodSync(f.approval, 0o644);
    expect(check(f.approval, f.portal, f.api).status).toBe(78);
    const g = fixture({ action: "ENABLE_LIVE_CHECKOUT" });
    expect(check(g.approval, g.portal, g.api).status).toBe(78);
  });

  test("refuses extra fields, malformed UTC, and missing source marker", () => {
    const extra = fixture({ extra: true });
    expect(check(extra.approval, extra.portal, extra.api).status).toBe(78);
    const badTime = fixture({ approved_at_utc: "2026-11-16T01:00:00" });
    expect(check(badTime.approval, badTime.portal, badTime.api).status).toBe(78);
    const noMarker = fixture();
    rmSync(join(noMarker.portal, "BUILD_SOURCE_GIT_SHA"));
    expect(check(noMarker.approval, noMarker.portal, noMarker.api).status).toBe(78);
  });

  test("rollout calls gate before creating backup, overwriting Nginx or switching release", () => {
    const source = readFileSync(rollout, "utf8");
    const marker = source.indexOf('python3 "$SOURCE_ROOT/deploy/scripts/assert-canonical-portal-cutover.py"');
    expect(marker).toBeGreaterThan(0);
    expect(marker).toBeLessThan(source.indexOf('BACKUP_DIR="$(mktemp'));
    expect(marker).toBeLessThan(source.indexOf('install -m 0644 "$SOURCE_ROOT/deploy/nginx'));
    expect(marker).toBeLessThan(source.indexOf('mv -Tf "${PORTAL_LINK}.next" "$PORTAL_LINK"'));
  });
});
