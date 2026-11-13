import type { Metadata } from "next";
import { VerifiedTillOperations } from "@/features/staff/verified-till-operations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Test till operations | Variety Groceries",
  description: "Private administrator-only cash drawer UAT using an isolated database.",
  robots: { index: false, follow: false },
};

export default function VerifiedTillOperationsPage() {
  return <VerifiedTillOperations />;
}
