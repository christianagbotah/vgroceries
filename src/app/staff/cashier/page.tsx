import type { Metadata } from "next";
import { CashierWorkspace } from "@/features/staff/cashier-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cashier workspace | Variety Groceries",
  description: "Secure read-only cashier reports for authorised Variety Groceries stock locations.",
};

export default function CashierPage() {
  return <CashierWorkspace />;
}
