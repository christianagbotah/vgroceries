"use client";

import type { StaffRole } from "@/types/domain";
import { DEMO_STAFF_USERS, STAFF_ROLE_STORAGE_KEY } from "./demo-staff";

const STAFF_DEMO_SESSION_KEY = "vg-staff-demo-session-v1";

export function isDemoStaffSessionActive(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(STAFF_DEMO_SESSION_KEY) === "1";
}

export function startDemoStaffSession(role: StaffRole): void {
  if (role === "rider" || !DEMO_STAFF_USERS[role]) throw new Error("Unknown admin demo role.");
  window.sessionStorage.setItem(STAFF_DEMO_SESSION_KEY, "1");
  window.localStorage.setItem(STAFF_ROLE_STORAGE_KEY, role);
}

export function clearDemoStaffSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STAFF_DEMO_SESSION_KEY);
  window.localStorage.removeItem(STAFF_ROLE_STORAGE_KEY);
}
