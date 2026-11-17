import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { filterAdminNav } from "../src/components/layout/admin-nav-filter";

const shell = readFileSync(resolve(import.meta.dir, "../src/components/layout/admin-shell.tsx"), "utf8");

describe("POS-integrated sidebar parity and access", () => {
  test("preserves the POS support inbox and its existing staff permission", () => {
    expect(shell).toContain('{ href: "/admin/support", label: "Support inbox", permission: "team.manage", icon: Headphones }');
    const groups = [
      { title: "Service", items: [
        { label: "Support inbox", href: "/admin/support", permission: "team.manage" },
        { label: "Payments", href: "/admin/payments", permission: "payments.view" },
      ] },
    ];
    expect(filterAdminNav(groups, p => p === "payments.view", "support")).toEqual([]);
    expect(filterAdminNav(groups, p => p === "team.manage", "support")[0].items[0].href).toBe("/admin/support");
  });

  test("keeps the official VG branding in both sidebar modes", () => {
    expect(shell).toContain('src="/brand/variety-lockup.svg"');
    expect(shell).toContain('src="/brand/variety-mark.svg"');
    expect(shell).toContain("bg-white p-1.5");
    expect(shell).toContain('varietygroceries.com operations');
  });

  test("reduces navigation width but keeps independent scrolling", () => {
    expect(shell).toContain('sidebarCollapsed ? "w-16" : "w-56"');
    expect(shell).toContain('sticky top-0 hidden h-screen');
    expect(shell).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(shell).toContain('aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}');
  });

  test("searches only authorized pages in expanded desktop and mobile drawers", () => {
    expect(shell).toContain('filterAdminNav(GROUPS, can, menuQuery)');
    expect(shell).toContain('compact ? authorizedGroups : visibleGroups');
    expect(shell).toContain('sidebar(sidebarCollapsed, "desktop")');
    expect(shell).toContain('sidebar(false, "mobile")');
    expect(shell).toContain('Search accessible admin pages');
    expect(shell).toContain('aria-label="Clear menu search"');
  });

  test("does not alter POS, API, checkout, or stock authority", () => {
    expect(shell).not.toContain("posComplete(");
    expect(shell).not.toContain("paymentInitiate(");
    expect(shell).not.toContain("stockConsume(");
    expect(shell).not.toContain("setRole('owner')");
  });
});
