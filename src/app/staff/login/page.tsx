import type { Metadata } from "next";
import { StaffLoginForm } from "@/features/staff/staff-login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff sign in",
  description: "Secure sign in to the Variety Groceries back office.",
};

export default function StaffLoginPage() {
  let accounts: { id: string; label: string; email: string }[] = [];
  if (process.env.UAT_PORTAL_LOGIN_REQUIRED === "1") {
    try {
      const configured: unknown = JSON.parse(process.env.UAT_ACCOUNT_CHOOSER_JSON ?? "[]");
      if (Array.isArray(configured)) {
        accounts = configured.filter((entry): entry is { id: string; label: string; email: string } =>
          typeof entry === "object" && entry !== null &&
          typeof entry.id === "string" && /^[a-z0-9_-]{1,48}$/.test(entry.id) &&
          typeof entry.label === "string" && entry.label.length <= 64 &&
          typeof entry.email === "string" &&
          // Only synthetic UAT identities may be listed before authentication.
          /@example\.(?:invalid|test)$/.test(entry.email),
        ).slice(0, 8);
      }
    } catch {
      // Invalid chooser configuration never breaks staff password login.
    }
  }
  return <StaffLoginForm
    demoEnabled={process.env.UAT_DEMO_LOGIN === "1"}
    uatAccounts={accounts}
  />;
}
