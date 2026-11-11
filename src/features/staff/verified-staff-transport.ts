import { apiRequest } from "./verified-pos-uat-transport";

export type VerifiedStaffRole = "admin" | "inventory_manager" | "cashier" | "rider";
export type VerifiedStaffRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: VerifiedStaffRole;
  active: boolean;
  createdAt: string;
  locationIds: string[];
};
export type VerifiedStaffLocation = {
  id: string; name: string; active: boolean;
};
export type VerifiedStaffList = {
  staff: VerifiedStaffRow[];
  locations: VerifiedStaffLocation[];
  capped: boolean;
};
export type VerifiedCashierCreation = {
  name: string; email: string; phone: string; password: string;
  locationIds: string[];
};
export type VerifiedCashierAction =
  | { action: "set_active"; active: boolean }
  | { action: "assign_locations"; locationIds: string[] }
  | { action: "reset_password"; password: string };

export const verifiedStaff = {
  list: () => apiRequest<VerifiedStaffList>("/admin/staff"),
  createCashier: (csrf: string, data: VerifiedCashierCreation) =>
    apiRequest<VerifiedStaffRow>("/admin/staff", { method: "POST", csrf, body: data }),
  manageCashier: (csrf: string, id: string, action: VerifiedCashierAction) =>
    apiRequest<VerifiedStaffRow>(
      `/admin/staff/${encodeURIComponent(id)}/actions`,
      { method: "POST", csrf, body: action },
    ),
};
