export type PermissionName =
  | "inventory.read"
  | "inventory.receive"
  | "catalog.product.create"
  | "catalog.media.read"
  | "catalog.media.generate"
  | "catalog.media.upload"
  | "catalog.media.approve"
  | "catalog.media.publish";

const adminPermissions = new Set<PermissionName>([
  "inventory.read",
  "inventory.receive",
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

export function hasPermission(role: string, permission: PermissionName): boolean {
  if (role === "admin") return adminPermissions.has(permission);
  if (role === "inventory_manager") return inventoryPermissions.has(permission);
  return false;
}
