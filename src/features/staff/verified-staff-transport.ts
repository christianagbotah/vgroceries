import { apiRequest, verifiedApiBase } from "./verified-pos-uat-transport";
import { ApiError } from "@/services/adapters/types";

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
  invitationStatus: "not_applicable" | "pending" | "expired" | "revoked" | "accepted";
  invitationExpiresAt: string | null;
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

export type VerifiedCashierInvitation = {
  cashier: VerifiedStaffRow;
  code: string;
  expiresAt: string;
};

export async function acceptCashierInvitation(code: string, password: string) {
  const response = await fetch(verifiedApiBase() + "/auth/staff-invitations/accept", {
    method: "POST", credentials: "include", cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ code, password }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null ||
      !("ok" in body) || body.ok !== true || !response.ok) {
    const error = body && typeof body === "object" && "error" in body
      ? body.error as {code?:string;message?:string} : {};
    throw new ApiError(error?.code ?? "BAD_RESPONSE",
      error?.message ?? "This invitation could not be accepted.");
  }
  return { activated: true };
}

export const verifiedStaff = {
  list: () => apiRequest<VerifiedStaffList>("/admin/staff"),
  inviteCashier: (csrf: string, data: {
    name: string; email: string; phone: string; locationIds: string[];
  }) => apiRequest<VerifiedCashierInvitation>("/admin/staff/invitations", {
    method: "POST", csrf, body: data,
  }),
  createCashier: (csrf: string, data: VerifiedCashierCreation) =>
    apiRequest<VerifiedStaffRow>("/admin/staff", { method: "POST", csrf, body: data }),
  manageCashier: (csrf: string, id: string, action: VerifiedCashierAction) =>
    apiRequest<VerifiedStaffRow>(
      `/admin/staff/${encodeURIComponent(id)}/actions`,
      { method: "POST", csrf, body: action },
    ),
};
