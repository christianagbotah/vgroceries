/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("admin authentication boundary", () => {
  test("admin layout is guarded before rendering protected back-office UI", () => {
    expect(existsSync("src/features/staff/admin-auth-gate.tsx")).toBe(true);
    const layout = read("src/app/admin/layout.tsx");
    expect(layout).toContain("AdminAuthGate");
    expect(layout).toContain("<AdminAuthGate>");

    const gate = read("src/features/staff/admin-auth-gate.tsx");
    expect(gate).toContain("apiOps.staffSession()");
    expect(gate).toContain('session.actor.role === "admin"');
    expect(gate).toContain('session.actor.role === "inventory_manager"');
    expect(gate).toContain("/staff/login?next=");
    expect(gate).toContain("Checking staff session");
  });

  test("staff login is a real credential form backed by production auth", () => {
    expect(existsSync("src/features/staff/staff-login-form.tsx")).toBe(true);
    const page = read("src/app/staff/login/page.tsx");
    const form = read("src/features/staff/staff-login-form.tsx");
    expect(page).toContain("StaffLoginForm");
    expect(form).toContain("apiOps.staffLogin(email, password)");
    expect(form).toContain('type="email"');
    expect(form).toContain('type="password"');
    expect(form).toContain('session.actor.role !== "admin"');
    expect(form).toContain('session.actor.role !== "inventory_manager"');
    expect(form).toContain("/admin");
  });

  test("staff session helpers and sign-out use the real auth session", () => {
    const client = read("src/services/client.ts");
    const shell = read("src/components/layout/admin-shell.tsx");
    expect(client).toContain("staffLogin:");
    expect(client).toContain("staffSession:");
    expect(client).toContain("staffLogout:");
    expect(shell).toContain("apiOps.staffLogout()");
    expect(shell).not.toContain('<Link href="/staff/login">');
  });

  test("UAT demo selector prefills the real administrator identity without embedding a password", () => {
    expect(existsSync("src/features/staff/uat-demo-accounts.ts")).toBe(true);
    const demoAccounts = read("src/features/staff/uat-demo-accounts.ts");
    const form = read("src/features/staff/staff-login-form.tsx");

    expect(demoAccounts).toContain("NEXT_PUBLIC_UAT_DEMO_LOGIN");
    expect(demoAccounts).toContain("NEXT_PUBLIC_UAT_DEMO_ADMIN_EMAIL");
    expect(demoAccounts).not.toContain("NEXT_PUBLIC_UAT_DEMO_ADMIN_PASSWORD");
    expect(demoAccounts).not.toContain("VarietyDemo@2026");
    expect(form).toContain("UAT_DEMO_ACCOUNTS");
    expect(form).toContain("Demo account (UAT)");
    expect(form).toContain("Choose a demo user");
    expect(form).toContain("setEmail(account.email)");
    expect(form).not.toContain("setPassword(account.password)");
    expect(form).toContain("apiOps.staffLogin(email, password)");
  });
});
