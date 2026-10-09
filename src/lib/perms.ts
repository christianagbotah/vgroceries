/**
 * Permission matrix — role-aware menus and action gating are UX only.
 * The production backend must enforce access on every protected
 * operation and resource (see docs/PERMISSIONS.md).
 */

import type { StaffRole } from "@/types/domain";

export type Permission =
  | "orders.view"
  | "orders.confirm"
  | "orders.fulfil" // picking / packing
  | "orders.cancel"
  | "orders.substitute"
  | "pos.use"
  | "pos.discount"
  | "cash.session.manage"
  | "cash.reconcile"
  | "catalog.view"
  | "catalog.edit" // price changes, publication
  | "inventory.view"
  | "inventory.adjust"
  | "inventory.receive"
  | "inventory.stocktake"
  | "purchasing.manage"
  | "dispatch.view"
  | "dispatch.assign"
  | "riders.manage"
  | "returns.view"
  | "returns.decide"
  | "refunds.view"
  | "refunds.approve"
  | "customers.view"
  | "customers.contact"
  | "payments.view"
  | "payments.reconcile"
  | "reports.view"
  | "ai.view"
  | "team.manage"
  | "audit.view"
  | "settings.manage"
  | "demo.controls";

export const PERMISSIONS: Record<Permission, StaffRole[]> = {
  "orders.view": ["owner_admin", "operations_manager", "cashier", "picker_packer", "dispatcher"],
  "orders.confirm": ["owner_admin", "operations_manager"],
  "orders.fulfil": ["owner_admin", "operations_manager", "picker_packer"],
  "orders.cancel": ["owner_admin", "operations_manager"],
  "orders.substitute": ["owner_admin", "operations_manager", "picker_packer"],
  "pos.use": ["owner_admin", "operations_manager", "cashier"],
  "pos.discount": ["owner_admin", "operations_manager"],
  "cash.session.manage": ["owner_admin", "operations_manager", "cashier"],
  "cash.reconcile": ["owner_admin", "operations_manager", "finance_reviewer"],
  "catalog.view": ["owner_admin", "operations_manager", "inventory_officer"],
  "catalog.edit": ["owner_admin", "operations_manager"],
  "inventory.view": ["owner_admin", "operations_manager", "inventory_officer", "picker_packer"],
  "inventory.adjust": ["owner_admin", "inventory_officer"],
  "inventory.receive": ["owner_admin", "inventory_officer", "operations_manager"],
  "inventory.stocktake": ["owner_admin", "inventory_officer"],
  "purchasing.manage": ["owner_admin", "inventory_officer", "operations_manager"],
  "dispatch.view": ["owner_admin", "operations_manager", "dispatcher"],
  "dispatch.assign": ["owner_admin", "operations_manager", "dispatcher"],
  "riders.manage": ["owner_admin", "operations_manager", "dispatcher"],
  "returns.view": ["owner_admin", "operations_manager", "cashier", "inventory_officer", "finance_reviewer"],
  "returns.decide": ["owner_admin", "operations_manager", "inventory_officer"],
  "refunds.view": ["owner_admin", "operations_manager", "finance_reviewer"],
  "refunds.approve": ["owner_admin", "finance_reviewer"],
  "customers.view": ["owner_admin", "operations_manager", "cashier", "dispatcher"],
  "customers.contact": ["owner_admin", "operations_manager"],
  "payments.view": ["owner_admin", "operations_manager", "finance_reviewer"],
  "payments.reconcile": ["owner_admin", "finance_reviewer"],
  "reports.view": ["owner_admin", "operations_manager", "finance_reviewer", "inventory_officer"],
  "ai.view": [
    "owner_admin",
    "operations_manager",
    "inventory_officer",
    "dispatcher",
    "finance_reviewer",
    "cashier",
    "picker_packer",
  ],
  "team.manage": ["owner_admin"],
  "audit.view": ["owner_admin", "finance_reviewer"],
  "settings.manage": ["owner_admin"],
  "demo.controls": ["owner_admin", "operations_manager", "inventory_officer", "cashier"],
};

export function roleCan(role: StaffRole, permission: Permission): boolean {
  return PERMISSIONS[permission]?.includes(role) ?? false;
}

export function anyCan(permission: Permission): boolean {
  return PERMISSIONS[permission].length > 0;
}
