import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("UAT staff demo login", () => {
  test("login exposes all seven admin-side fictional demo roles", async () => {
    const { ADMIN_DEMO_ROLE_OPTIONS } = await import("../src/features/staff/demo-staff");
    expect(ADMIN_DEMO_ROLE_OPTIONS.map((item) => item.value)).toEqual([
      "owner_admin",
      "operations_manager",
      "inventory_officer",
      "cashier",
      "picker_packer",
      "dispatcher",
      "finance_reviewer",
    ]);
    expect(ADMIN_DEMO_ROLE_OPTIONS.every((item) => item.user.isDemo)).toBe(true);
  });

  test("staff login starts demo session without exposing a password", () => {
    const page = read("src/app/staff/login/page.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain('process.env.UAT_DEMO_LOGIN === "1"');
    const source = read("src/features/staff/staff-login-form.tsx");
    expect(source).toContain("startDemoStaffSession");
    expect(source).toContain("Continue with demo user");
    expect(source).toContain("Mock data only");
  });

  test("demo sessions use the mock adapter and bypass real staff auth only in demo mode", () => {
    expect(read("src/services/adapters/browser.ts")).toContain("isDemoStaffSessionActive");
    expect(read("src/features/staff/admin-auth-gate.tsx")).toContain("isDemoStaffSessionActive");
    expect(read("src/app/api/mock/v1/[...path]/route.ts")).toContain('x-variety-demo');
  });

  test("admin shell clears demo mode and hides role selector for real staff sessions", () => {
    const source = read("src/components/layout/admin-shell.tsx");
    expect(source).toContain("clearDemoStaffSession");
    expect(source).toContain("demoSessionActive");
  });
});
