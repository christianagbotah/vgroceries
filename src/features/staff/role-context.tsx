"use client";

/**
 * Demo staff identity. A demo-account role selector is enabled ONLY in
 * demo mode and persisted client-side; production disables it and the
 * backend enforces every protected operation (docs/PERMISSIONS.md).
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { StaffRole, StaffUser } from "@/types/domain";
import { roleCan, type Permission } from "@/lib/perms";

const ROLE_KEY = "vg-staff-role-v1";

const DEMO_USERS: Record<StaffRole, StaffUser> = {
  owner_admin: { id: "stf_ama", name: "Ama Boateng", role: "owner_admin", phone: "+233510000001", isDemo: true },
  operations_manager: { id: "stf_kojo", name: "Kojo Asante", role: "operations_manager", phone: "+233510000002", isDemo: true },
  inventory_officer: { id: "stf_nana", name: "Nana Yaa Osei", role: "inventory_officer", phone: "+233510000003", isDemo: true },
  cashier: { id: "stf_adjoa", name: "Adjoa Yeboah", role: "cashier", phone: "+233510000004", isDemo: true },
  picker_packer: { id: "stf_kweku", name: "Kweku Fosu", role: "picker_packer", phone: "+233510000005", isDemo: true },
  dispatcher: { id: "stf_dela", name: "Dela Agbeko", role: "dispatcher", phone: "+233510000006", isDemo: true },
  finance_reviewer: { id: "stf_serwaa", name: "Serwaa Owusu", role: "finance_reviewer", phone: "+233510000007", isDemo: true },
  rider: { id: "rdr_kwabena", name: "Kwabena Mensah", role: "rider", phone: "+233201000101", isDemo: true },
};

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
    // hydrate from browser storage after mount (setState in a callback, not synchronously)
    const t = window.setTimeout(() => {
      const saved = localStorage.getItem(ROLE_KEY) as StaffRole | null;
      if (saved && DEMO_USERS[saved]) setRoleState(saved);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const setRole = (r: StaffRole) => {
    setRoleState(r);
    localStorage.setItem(ROLE_KEY, r);
  };

  const user = DEMO_USERS[role];
  return (
    <Ctx.Provider
      value={{
        user,
        role,
        setRole,
        can: (p) => roleCan(role, p),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStaff(): RoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStaff must be used inside StaffRoleProvider");
  return ctx;
}

export const DEMO_ROLE_OPTIONS = (Object.keys(DEMO_USERS) as StaffRole[])
  .filter((r) => r !== "rider")
  .map((r) => ({ value: r, user: DEMO_USERS[r] }));
