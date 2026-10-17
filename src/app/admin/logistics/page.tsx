"use client";

import { LogisticsWorkspace } from "@/features/logistics/logistics-workspace";
import { useStaff } from "@/features/staff/role-context";
import { ShieldAlert } from "lucide-react";

export default function AdminLogisticsPage() {
  const { can } = useStaff();
  if (!can("logistics.manage")) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6" role="alert">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
          <div>
            <h1 className="font-serif text-xl font-bold">Logistics &amp; Delivery</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Only the owner administrator can change logistics network and delivery-workflow configuration.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return <LogisticsWorkspace />;
}
