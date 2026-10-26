import type { Metadata } from "next";
import { StaffLoginForm } from "@/features/staff/staff-login-form";

export const metadata: Metadata = {
  title: "Staff sign in",
  description: "Secure sign in to the Variety Groceries back office.",
};

export default function StaffLoginPage() {
  return <StaffLoginForm />;
}
