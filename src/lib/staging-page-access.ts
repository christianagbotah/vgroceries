/**
 * Only operational HTML routes require the extra staging gate.
 * Customer storefront and staff account activation remain page-accessible.
 */
export type StagingRouteRole = "cashier" | "admin" | "rider";

export function stagingRequiredRole(pathname: string): StagingRouteRole | null {
  if (pathname === "/staff/cashier" || pathname.startsWith("/staff/cashier/") ||
      pathname === "/staff/pos" || pathname.startsWith("/staff/pos/")) {
    return "cashier";
  }
  if (pathname === "/staff/rider/cod" || pathname.startsWith("/staff/rider/cod/")) {
    return "rider";
  }
  if (pathname === "/admin/team/verified" ||
      pathname.startsWith("/admin/team/verified/")) {
    return "admin";
  }
  return null;
}

export function stagingSessionHasRole(payload: unknown, role: StagingRouteRole): boolean {
  if (!payload || typeof payload !== "object" || !("ok" in payload) ||
      payload.ok !== true || !("data" in payload)) return false;
  const data = payload.data;
  if (!data || typeof data !== "object" || !("actor" in data)) return false;
  const actor = data.actor;
  return !!actor && typeof actor === "object" &&
    "role" in actor && actor.role === role &&
    "id" in actor && typeof actor.id === "string" && actor.id.length > 0;
}
