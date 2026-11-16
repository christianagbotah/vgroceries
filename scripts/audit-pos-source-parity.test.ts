import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve(import.meta.dir, "audit-pos-source-parity.py");
const created: string[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "vg-parity-test-"));
  created.push(root);
  const canonical = join(root, "canonical");
  const pos = join(root, "pos");
  for (const base of [canonical, pos]) {
    mkdirSync(join(base, "src/app/products"), { recursive: true });
    mkdirSync(join(base, "apps/api/src/orders"), { recursive: true });
    mkdirSync(join(base, "packages/contracts/src"), { recursive: true });
    writeFileSync(join(base, "src/app/products/page.tsx"), "same page");
    writeFileSync(join(base, "apps/api/src/orders/orders.controller.ts"), "common controller");
    writeFileSync(join(base, "packages/contracts/src/cart.ts"), "type Cart = string");
  }
  return { root, canonical, pos };
}
function call(canonical: string, pos: string, ...args: string[]) {
  return spawnSync("python3", [script, "--canonical", canonical, "--pos", pos, ...args],
    { encoding: "utf8" });
}
afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe("source-only POS parity inventory", () => {
  test("reports exactly matching scoped files without reading environment or secrets", () => {
    const f = setup();
    writeFileSync(join(f.pos, ".env.production"), "SENSITIVE_SENTINEL=never_print");
    const result = call(f.canonical, f.pos, "--format", "json");
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("SENSITIVE_SENTINEL");
    expect(result.stdout).not.toContain(".env.production");
    const parsed = JSON.parse(result.stdout);
    expect(parsed.scopes.frontend_pages.identical_common_count).toBe(1);
    expect(parsed.scopes.api_controllers.identical_common_count).toBe(1);
    expect(parsed.scopes.shared_contracts.identical_common_count).toBe(1);
    expect(parsed.release_authorized).toBe(false);
  });

  test("detects POS-only and canonical-only pages, plus changed common controllers", () => {
    const f = setup();
    mkdirSync(join(f.pos, "src/app/admin/pos"), { recursive: true });
    mkdirSync(join(f.canonical, "src/app/staff/verified"), { recursive: true });
    writeFileSync(join(f.pos, "src/app/admin/pos/page.tsx"), "POS screen");
    writeFileSync(join(f.canonical, "src/app/staff/verified/page.tsx"), "canonical screen");
    writeFileSync(join(f.pos, "apps/api/src/orders/orders.controller.ts"), "POS controller changed");
    const parsed = JSON.parse(call(f.canonical, f.pos, "--format", "json").stdout);
    expect(parsed.scopes.frontend_pages.pos_only).toEqual(["src/app/admin/pos/page.tsx"]);
    expect(parsed.scopes.frontend_pages.canonical_only).toEqual(["src/app/staff/verified/page.tsx"]);
    expect(parsed.scopes.api_controllers.different_common).toEqual(["apps/api/src/orders/orders.controller.ts"]);
  });

  test("returns nonzero on missing source root and refuses identical input roots", () => {
    const f = setup();
    expect(call("/does/not/exist", f.pos).status).not.toBe(0);
    expect(call(f.pos, f.pos).status).not.toBe(0);
  });

  test("require-parity rejects mismatched source content", () => {
    const f = setup();
    writeFileSync(join(f.pos, "src/app/products/page.tsx"), "changed");
    expect(call(f.canonical, f.pos, "--require-parity").status).toBe(3);
  });

  test("require-parity rejects unknown working tree state even when files match", () => {
    const f = setup();
    expect(call(f.canonical, f.pos, "--require-parity").status).toBe(3);
  });

  test("require-parity accepts clean, independently committed identical trees", () => {
    const f = setup();
    for (const folder of [f.canonical, f.pos]) {
      for (const args of [
        ["init", "-q"],
        ["config", "user.name", "Test Reviewer"],
        ["config", "user.email", "test@example.invalid"],
        ["add", "."],
        ["commit", "-qm", "test fixture"],
      ]) {
        const p = spawnSync("git", ["-C", folder, ...args], { encoding: "utf8" });
        expect(p.status).toBe(0);
      }
    }
    const output = call(f.canonical, f.pos, "--require-parity", "--format", "json");
    expect(output.status).toBe(0);
    expect(JSON.parse(output.stdout).canonical_git.working_tree_clean).toBe(true);
    expect(JSON.parse(output.stdout).pos_git.working_tree_clean).toBe(true);
  });

  test("markdown report limits paths but preserves true count", () => {
    const f = setup();
    for (const name of ["a", "b", "c"]) {
      mkdirSync(join(f.pos, "src/app", name), { recursive: true });
      writeFileSync(join(f.pos, "src/app", name, "page.tsx"), name);
    }
    const result = call(f.canonical, f.pos, "--max-paths", "1");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Only POS (3)");
    expect(result.stdout).toContain("...and 2 more paths");
    expect(result.stdout).not.toContain("src/app/c/page.tsx");
  });

  test("writes the requested report file only, without editing either source tree", () => {
    const f = setup();
    const output = join(f.root, "report.json");
    const result = call(f.canonical, f.pos, "--format", "json", "--output", output);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(readFileSync(output, "utf8"));
    expect(parsed.scopes.frontend_pages.canonical_file_count).toBe(1);
    expect(readFileSync(join(f.canonical, "src/app/products/page.tsx"), "utf8")).toBe("same page");
  });

  test("rejects invalid max-paths settings", () => {
    const f = setup();
    expect(call(f.canonical, f.pos, "--max-paths", "-1").status).not.toBe(0);
  });
});
