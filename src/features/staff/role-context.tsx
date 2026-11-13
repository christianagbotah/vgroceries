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
import { apiOps } from "@/services/client";

interface RoleCtx {
  user: StaffUser;
  role: StaffRole;
  setRole: (r: StaffRole) => void;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function StaffRoleProvider({ children }: { children: React.ReactNode }) {
  // Least-privileged initial presentation until we know the actual role.
  const [role, setRoleState] = useState<StaffRole>("cashier");
  const [realStaff, setRealStaff] = useState<StaffUser | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (isDemoStaffSessionActive()) {
        setRealStaff(null);
        const saved = localStorage.getItem(STAFF_ROLE_STORAGE_KEY) as StaffRole | null;
        if (saved && DEMO_STAFF_USERS[saved] && saved !== "rider") setRoleState(saved);
        return;
      }
      // Genuine identity is from the server-owned session, never localStorage.
      void apiOps.staffSession().then(({ actor }) => {
        if (!active) return;
        const mapped: StaffRole | null = actor.role === "admin" ? "owner_admin"
          : actor.role === "inventory_manager" ? "inventory_officer"
          : actor.role === "cashier" ? "cashier" : null;
        if (!mapped) return;
        setRoleState(mapped);
        setRealStaff({ id: actor.id, name: actor.name, role: mapped, phone: "", isDemo: false });
      }).catch(() => {
        // AdminAuthGate owns failed-session redirects and errors.
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  const setRole = (next: StaffRole) => {
    // Never impersonate another role via the real back-office menu.
    if (!isDemoStaffSessionActive()) return;
    setRoleState(next);
    localStorage.setItem(STAFF_ROLE_STORAGE_KEY, next);
  };

  const user = realStaff ?? DEMO_STAFF_USERS[role];
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
