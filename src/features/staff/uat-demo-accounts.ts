import { ROLE_LABELS, type StaffRole } from "@/types/domain";
import { ADMIN_DEMO_ROLE_OPTIONS } from "./demo-staff";

export interface UatDemoAccount {
  id: string;
  label: string;
  name: string;
  role: StaffRole;
}

export const UAT_DEMO_ACCOUNTS: UatDemoAccount[] = ADMIN_DEMO_ROLE_OPTIONS.map(({ value, user }) => ({
  id: value,
  label: `${user.name} — ${ROLE_LABELS[value]}`,
  name: user.name,
  role: value,
}));
