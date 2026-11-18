import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const screen = readFileSync("src/app/admin/dispatch/cod-exceptions/page.tsx", "utf8");
const shell = readFileSync("src/components/layout/admin-shell.tsx", "utf8");

describe("COD exception review is real-authority, privacy-safe and read-only", () => {
  test("only real administrators can reach the report, never a mock identity", () => {
    expect(screen).toContain("isDemoStaffSessionActive()");
    expect(screen).toContain('session.actor.role !== "admin"');
    expect(screen).toContain("/api/v1/admin/dispatch/cod-exceptions?");
    expect(screen).toContain('credentials: "include"');
    expect(screen).toContain('cache: "no-store"');
    expect(screen).not.toMatch(/fetch\(\s*[`'"]\/api\/mock\/v1/);
    expect(shell).toContain('href: "/admin/dispatch/cod-exceptions"');
  });
  test("does not fabricate figures on error or claim delivery is a cash settlement", () => {
    expect(screen).toContain("codExceptionInboxSchema.safeParse(json.data)");
    expect(screen).toContain("Cash is not verified by delivery");
    expect(screen).toContain("Gross order face value · not confirmed collected");
    expect(screen).toContain("Collection not recorded");
    expect(screen).toContain("Remittance not recorded");
    expect(screen).not.toContain("Mark paid");
    expect(screen).not.toContain("Mark remitted");
  });
  test("pagination, cancellation, loading and failed authorization are explicit", () => {
    expect(screen).toContain("controller.abort()");
    expect(screen).toContain("aria-pressed={phase === option.key}");
    expect(screen).toContain("setPage(n => Math.max(1, n - 1))");
    expect(screen).toContain("stageMessage(response.status)");
    expect(screen).toContain("Retry verification");
  });
});
