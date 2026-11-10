export type PermissionName =
  | "inventory.read"
  | "inventory.receive"
  | "pos.cash-report.read"
  | "catalog.category.create"
  | "catalog.product.create"
  | "catalog.media.read"
  | "catalog.media.generate"
  | "catalog.media.upload"
  | "catalog.media.approve"
  | "catalog.media.publish";

const adminPermissions = new Set<PermissionName>([
  "pos.cash-report.read",
  "inventory.read",
  "inventory.receive",
  "catalog.category.create",
  "catalog.product.create",
  "catalog.media.read",
  "catalog.media.generate",
  "catalog.media.upload",
  "catalog.media.approve",
  "catalog.media.publish",
]);

const inventoryPermissions = new Set<PermissionName>([
  "inventory.read",
  "inventory.receive",
  "catalog.media.read",
  "catalog.media.generate",
  "catalog.media.upload",
]);

const cashierPermissions = new Set<PermissionName>(["pos.cash-report.read"]);

export function hasPermission(role: string, permission: PermissionName): boolean {
  if (role === "admin") return adminPermissions.has(permission);
  if (role === "inventory_manager") return inventoryPermissions.has(permission);
  if (role === "cashier") return cashierPermissions.has(permission);
  return false;
}
