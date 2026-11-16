import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const source = (file: string) => readFileSync(resolve(root, file), "utf8");
const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");

const officialMark = "745d4b4bacb8707c144555e11c122d3bac5fad8684562ab78f1c4930d892d92e";
const officialLockup = "eb6f044400af86f14ae8425ebc130e7ca6261c3450169da098949fc6b9140a0c";

describe("single official gold VG identity across Coming Soon and POS-integrated portal", () => {
  test("the two portal marks exactly match the approved official gold SVG, not the former green V", () => {
    for (const file of [
      "public/logo.svg",
      "public/brand/variety-mark.svg",
      "deploy/coming-soon/logo.svg",
    ]) {
      const artwork = source(file);
      expect(sha256(artwork)).toBe(officialMark);
      expect(artwork).toContain("Variety Groceries official gold VG monogram");
      expect(artwork).not.toContain("Variety Groceries V mark");
      expect(artwork).not.toContain("<script");
      expect(artwork).not.toContain("<foreignObject");
    }
  });

  test("portal and public Coming Soon use identical official gold-and-black full lockups", () => {
    for (const file of [
      "public/brand/variety-lockup.svg",
      "deploy/coming-soon/variety-lockup.svg",
    ]) {
      const artwork = source(file);
      expect(sha256(artwork)).toBe(officialLockup);
      expect(artwork).toContain("Variety Groceries official gold VG logo");
      expect(artwork).not.toContain("<script");
      expect(artwork).not.toContain("<foreignObject");
    }
  });

  test("storefront header/footer use the actual full lockup, not green V plus improvised text", () => {
    const shell = source("src/components/layout/storefront-shell.tsx");
    expect(shell).toContain('src="/brand/variety-lockup.svg"');
    expect(shell).toContain('alt="Variety Groceries"');
    expect(shell).toContain("inverse && \"bg-white");
    expect(shell).toContain("<Brand compact inverse />");
    expect(shell).toContain("<Brand />");
    expect(shell).not.toContain('src="/brand/variety-mark.svg"');
    expect(shell).not.toContain("Variety<span");
  });

  test("favicons retain the official VG mark on the portal and Coming Soon", () => {
    const layout = source("src/app/layout.tsx");
    expect(layout).toContain('icon: "/brand/variety-mark.svg"');
    expect(layout).toContain('shortcut: "/brand/variety-mark.svg"');
    expect(layout).toContain('apple: "/brand/variety-mark.svg"');
    const landing = source("deploy/coming-soon/index.html");
    expect(landing).toContain('<link rel="icon" type="image/svg+xml" href="/logo.svg" />');
    expect(landing).toContain('src="/variety-lockup.svg"');
    expect(landing).toContain("Coming Soon");
  });

  test("checkout paths remain untouched by this branding-only update", () => {
    const client = source("src/services/client.ts");
    expect(client).toContain("withFreshGuestCheckoutRetry");
    expect(source("src/services/adapters/browser.ts")).toContain("readGuestCheckoutCsrfToken");
  });

  test("staff login, admin sidebar, cashier and rider screens use the actual approved mark", () => {
    const admin = source("src/components/layout/admin-shell.tsx");
    const login = source("src/features/staff/staff-login-form.tsx");
    const cashier = source("src/features/staff/cashier-workspace.tsx");
    const rider = source("src/components/layout/rider-shell.tsx");
    expect(admin).toContain('src="/brand/variety-lockup.svg"');
    expect(login).toContain('src="/brand/variety-lockup.svg"');
    expect(cashier).toContain('src="/brand/variety-mark.svg"');
    expect(rider).toContain('src="/brand/variety-mark.svg"');
    for (const screen of [admin, login, cashier, rider]) {
      expect(screen).toContain('import Image from "next/image"');
      expect(screen).not.toContain('aria-hidden>V</span>');
      expect(screen).not.toMatch(/>\s*V\s*<\/span>/);
    }
  });
});
