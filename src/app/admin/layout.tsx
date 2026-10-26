"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { StaffRoleProvider } from "@/features/staff/role-context";
import { AdminAuthGate } from "@/features/staff/admin-auth-gate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthGate>
      <StaffRoleProvider>
        <AdminShell>{children}</AdminShell>
      </StaffRoleProvider>
    </AdminAuthGate>
  );
}
