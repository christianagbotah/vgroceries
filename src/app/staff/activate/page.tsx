import type { Metadata } from "next";
import { CashierActivation } from "@/features/staff/cashier-activation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Activate cashier account | Variety Groceries",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function StaffActivationPage() {
  return <CashierActivation />;
}
