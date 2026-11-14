/** Pure role IDs used by server-side UAT gating and client demo routing. */
export const DEMO_ROLE_IDS = [
  "owner_admin", "cashier", "finance_reviewer", "customer",
  "operations_manager", "inventory_officer", "picker_packer", "dispatcher",
] as const;
export type PreviewRole = typeof DEMO_ROLE_IDS[number];
export const DEMO_ROLE_DESTINATIONS: Record<PreviewRole, string> = {
  owner_admin: "/admin",
  cashier: "/admin/pos",
  finance_reviewer: "/admin/payments",
  customer: "/account",
  operations_manager: "/admin/fulfilment",
  inventory_officer: "/admin/inventory",
  picker_packer: "/admin/fulfilment",
  dispatcher: "/admin/dispatch",
};
