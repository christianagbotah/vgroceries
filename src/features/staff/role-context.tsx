"use client";

/**
 * Demo staff identity. The selector is active only for an explicit UAT demo
 * session; real staff sessions never inherit a persisted demo role.
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { StaffRole, StaffUser } from "@/types/domain";
import { roleCan, type Permission } from "@/lib/perms";
import { ADMIN_DEMO_ROLE_OPTIONS, DEMO_STAFF_USERS, STAFF_ROLE_STORAGE_KEY } from "./demo-staff";
import { isDemoStaffSessionActive } from "./staff-demo-session";

interface RoleCtx {
  user: StaffUser;
  role: StaffRole;
  setRole: (r: StaffRole) => void;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function StaffRoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<StaffRole>("owner_admin");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!isDemoStaffSessionActive()) return;
      const saved = localStorage.getItem(STAFF_ROLE_STORAGE_KEY) as StaffRole | null;
      if (saved && DEMO_STAFF_USERS[saved] && saved !== "rider") setRoleState(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setRole = (next: StaffRole) => {
    setRoleState(next);
    if (isDemoStaffSessionActive()) localStorage.setItem(STAFF_ROLE_STORAGE_KEY, next);
  };

  const user = DEMO_STAFF_USERS[role];
  return (
    <Ctx.Provider value={{ user, role, setRole, can: (permission) => roleCan(role, permission) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStaff(): RoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStaff must be used inside StaffRoleProvider");
  return ctx;
}

export const DEMO_ROLE_OPTIONS = ADMIN_DEMO_ROLE_OPTIONS;
