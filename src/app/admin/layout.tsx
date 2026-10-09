"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { StaffRoleProvider } from "@/features/staff/role-context";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffRoleProvider>
      <AdminShell>{children}</AdminShell>
    </StaffRoleProvider>
  );
}
