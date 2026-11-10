/**
 * Production-only, read-only cashier reporting transport. Deliberately does
 * not use the demo-aware browser adapter, and exposes no POS mutation methods.
 */
import { HttpServiceAdapter } from "@/services/adapters/http";
import {
  cashierTillListSchema,
  posTillReconciliationViewSchema,
  sessionLookupResponseSchema,
} from "@/services/contracts";

export function cashierApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new Error("The authenticated cashier API is not configured.");
  return base;
}

export function createCashierReportClient(base: string) {
  if (!base.trim()) throw new Error("The authenticated cashier API is not configured.");
  const api = new HttpServiceAdapter(base, { kind: "http:cashier-read", credentials: "include" });
  return {
    async session() {
      const response = await api.request<unknown>({ op: "auth.me" });
      const session = sessionLookupResponseSchema.parse(response);
      if (session.actor.role !== "cashier" && session.actor.role !== "admin") {
        throw new Error("This account does not have cashier report access.");
      }
      return session.actor;
    },
    async list() {
      return cashierTillListSchema.parse(await api.request<unknown>({ op: "pos.tills.list" }));
    },
    async reconciliation(sessionId: string) {
      return posTillReconciliationViewSchema.parse(await api.request<unknown>({
        op: "pos.tills.reconciliation", query: { sessionId },
      }));
    },
    cashCsvHref(sessionId: string) {
      // The same authenticated server endpoint authorises every CSV request.
      return `${base.replace(/\/+$/, "")}/admin/pos/tills/${encodeURIComponent(sessionId)}/reconciliation.csv`;
    },
  };
}

export type CashierReportClient = ReturnType<typeof createCashierReportClient>;
