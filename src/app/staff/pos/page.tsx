import type { Metadata } from "next";
import { VerifiedPosUat } from "@/features/staff/verified-pos-uat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Staff cash checkout | Variety Groceries",
  description: "Authenticated cashier counter checkout for an authorised stock location.",
  robots: { index: false, follow: false },
};

export default function StaffPosPage() {
  return <VerifiedPosUat />;
}
