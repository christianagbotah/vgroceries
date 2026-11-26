"use client";

import { VerifiedPosCashHistoryUat } from "@/features/staff/verified-pos-cash-history-uat";

/** AdminAuthGate plus API role checks both authorize read-only cash records. */
export default function VerifiedPosCashHistoryPage() {
  return <VerifiedPosCashHistoryUat />;
}
