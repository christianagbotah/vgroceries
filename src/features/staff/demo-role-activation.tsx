"use client";

import { useEffect } from "react";
import Link from "next/link";
import { FlaskConical, LoaderCircle } from "lucide-react";
import type { StaffRole } from "@/types/domain";
import { startDemoStaffSession, startDemoCustomerSession } from "./staff-demo-session";
import { DEMO_ROLE_DESTINATIONS, type PreviewRole } from "./demo-role-catalog";

export function DemoRoleActivation({ role }: { role: PreviewRole }) {
  useEffect(() => {
    if (role === "customer") startDemoCustomerSession();
    else startDemoStaffSession(role as StaffRole);

    // Full same-origin navigation ensures the isolated demo flag exists before
    // the role-aware layout and mock transport are mounted. No session token
    // is issued, and the real API cannot be reached through the mock adapter.
    window.location.replace(DEMO_ROLE_DESTINATIONS[role]);
  }, [role]);

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-lg flex-col items-center justify-center gap-4 px-5 text-center">
      <FlaskConical className="size-9 text-primary" aria-hidden />
      <h1 className="font-serif text-2xl font-bold">Opening role preview</h1>
      <p className="text-sm text-muted-foreground">
        Sample data only; no password or real account is used. Your demo actions
        will not change live stock, customer orders, payments or staff access.
      </p>
      <LoaderCircle className="size-6 animate-spin text-primary" aria-label="Loading demo" />
      <Link className="text-sm font-semibold text-primary underline" href="/staff/login">
        Back to role selection
      </Link>
    </main>
  );
}
