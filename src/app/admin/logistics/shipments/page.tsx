"use client";

import { useEffect, useState } from "react";
import { apiOps } from "@/services/client";
import { LoadingState } from "@/components/shared/states";
import { useStaff } from "@/features/staff/role-context";
import { isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";
import { ShipmentsPanel } from "@/features/logistics/shipments-panel";
import { ShieldAlert } from "lucide-react";

export default function ShipmentOperationsPage() {
  const { role } = useStaff();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (isDemoStaffSessionActive()) {
      // Demo role selector is only a UI preview; demo shipment custody is still disabled.
      setAuthorized(role === "owner_admin");
    } else {
      // Real role MUST come from the current authenticated server session.
      // StaffRoleProvider is a demo presentation context and is not a security authority.
      apiOps.staffSession().then(session => {
        if (active) setAuthorized(session.actor.role === "admin");
      }).catch(() => {
        if (active) setAuthorized(false);
      });
    }
    return () => { active = false; };
  }, [role]);

  if (authorized === null) return <LoadingState rows={3} label="Verifying shipment operations permission" />;
  if (!authorized) return (
    <div className="mx-auto max-w-xl rounded-xl border bg-card p-6" role="alert">
      <div className="flex gap-3">
        <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold">Shipment operations restricted</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verified pickup collection is restricted to authenticated owner administrators.
          </p>
        </div>
      </div>
    </div>
  );
  return <ShipmentsPanel />;
}
