import test from "node:test";
import assert from "node:assert/strict";
import {
  hasPermission,
  type PermissionName,
} from "../src/identity/permissions";

const mediaPermissions = [
  "catalog.media.read",
  "catalog.media.generate",
  "catalog.media.upload",
  "catalog.media.approve",
  "catalog.media.publish",
] as const satisfies readonly PermissionName[];

test("admin has complete product-media authority", () => {
  for (const permission of mediaPermissions)
    assert.equal(hasPermission("admin", permission), true, permission);
});

test("inventory manager may prepare media but may not approve or publish it", () => {
  for (const permission of [
    "catalog.media.read",
    "catalog.media.generate",
    "catalog.media.upload",
    "inventory.read",
    "inventory.receive",
  ] as const satisfies readonly PermissionName[])
    assert.equal(hasPermission("inventory_manager", permission), true, permission);
  for (const permission of ["catalog.media.approve", "catalog.media.publish"] as const)
    assert.equal(hasPermission("inventory_manager", permission), false, permission);
});

test("customer and rider have no catalogue media permissions", () => {
  for (const role of ["customer", "rider"] as const)
    for (const permission of mediaPermissions)
      assert.equal(hasPermission(role, permission), false, `${role}:${permission}`);
});
