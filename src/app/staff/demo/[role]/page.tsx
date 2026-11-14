import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DemoRoleActivation } from "@/features/staff/demo-role-activation";
import { DEMO_ROLE_IDS, type PreviewRole } from "@/features/staff/demo-role-catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Demo role preview — Variety Groceries",
  robots: { index: false, follow: false },
};

export default async function DemoRolePage({ params }: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (process.env.UAT_DEMO_LOGIN !== "1" || !DEMO_ROLE_IDS.includes(role as PreviewRole)) {
    notFound();
  }
  return <DemoRoleActivation role={role as PreviewRole} />;
}
