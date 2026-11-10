import type { Metadata } from "next";
import { VerifiedPosUat } from "@/features/staff/verified-pos-uat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verified sample cash checkout | Variety Groceries",
  description: "Private, authenticated test cash checkout using a separate UAT database.",
  robots: { index: false, follow: false },
};

export default function VerifiedPosUatPage() {
  return <VerifiedPosUat />;
}
