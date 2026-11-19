import { describe, expect, test } from "bun:test";
import { filterAdminNav } from "../src/components/layout/admin-nav-filter";

type Permission = "orders.view" | "pos.use" | "inventory.view" | "settings.manage";
interface Item { label: string; href: string; permission: Permission }
const groups: { title: string; items: Item[] }[] = [
  {
    title: "Selling",
    items: [
      { label: "Orders", href: "/admin/orders", permission: "orders.view" },
      { label: "Counter sales (POS)", href: "/admin/pos", permission: "pos.use" },
    ],
  },
  {
    title: "Catalogue & stock",
    items: [
      { label: "Expiry & quarantine", href: "/admin/inventory/expiry", permission: "inventory.view" },
    ],
  },
  {
    title: "Administration",
    items: [{ label: "Settings", href: "/admin/settings", permission: "settings.manage" }],
  },
];

const allow = (...permissions: Permission[]) => (p: Permission) => permissions.includes(p);

describe("admin sidebar role-aware search", () => {
  test("empty search includes only authorized items in original group order", () => {
    expect(filterAdminNav(groups, allow("orders.view", "inventory.view"), "")).toEqual([
      { title: "Selling", items: [groups[0].items[0]] },
      { title: "Catalogue & stock", items: [groups[1].items[0]] },
    ]);
  });

  test("does not leak unauthorized items from a matching group title", () => {
    const result = filterAdminNav(groups, allow("orders.view"), "selling");
    expect(result).toEqual([{ title: "Selling", items: [groups[0].items[0]] }]);
    expect(filterAdminNav(groups, allow("orders.view"), "pos")).toEqual([]);
  });

  test("searches labels, routes and group names case-insensitively", () => {
    expect(filterAdminNav(groups, allow("orders.view", "pos.use"), " POS ").map((g) => g.items[0].label))
      .toEqual(["Counter sales (POS)"]);
    expect(filterAdminNav(groups, allow("inventory.view"), "catalogue").length).toBe(1);
    expect(filterAdminNav(groups, allow("inventory.view"), "inventory/expiry").length).toBe(1);
  });

  test("matches multiple terms regardless of spacing", () => {
    const result = filterAdminNav(groups, allow("inventory.view"), "  stock   expiry  ");
    expect(result.map((g) => g.items[0].label)).toEqual(["Expiry & quarantine"]);
  });

  test("an all-whitespace query behaves as unfiltered and does not mutate source arrays", () => {
    const snapshot = JSON.stringify(groups);
    expect(filterAdminNav(groups, allow("settings.manage"), "  \t  ")).toEqual([
      { title: "Administration", items: [groups[2].items[0]] },
    ]);
    expect(JSON.stringify(groups)).toBe(snapshot);
  });
});
