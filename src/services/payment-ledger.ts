import type { PaymentRow } from "./contracts";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

interface ProductionPaymentLedgerRow {
  attemptId: string;
  orderId: string;
  orderReference: string;
  provider: string;
  method: string;
  settledChannel?: string;
  amountMinor: number;
  status: string;
  settlementState: string;
  callbackCount: number;
  providerReference?: string;
  failureReason?: string;
  createdAt: string;
}

interface ProductionPaymentLedgerResponse {
  page: number;
  perPage: number;
  total: number;
  items: ProductionPaymentLedgerRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function productionLedger(value: unknown): value is ProductionPaymentLedgerResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) return false;
  return value.items.every((item) =>
    isRecord(item) &&
    typeof item.attemptId === "string" &&
    typeof item.orderId === "string" &&
    typeof item.orderReference === "string" &&
    typeof item.provider === "string" &&
    typeof item.method === "string" &&
    typeof item.amountMinor === "number" &&
    typeof item.status === "string" &&
    typeof item.settlementState === "string" &&
    typeof item.callbackCount === "number" &&
    typeof item.createdAt === "string",
  );
}

export function normalizePaymentLedgerResponse(value: unknown): PaymentRow[] {
  if (Array.isArray(value)) return value as PaymentRow[];
  if (!productionLedger(value)) throw new Error("Payments service returned an invalid ledger response.");
  return value.items.map((row) => ({
    id: row.attemptId,
    orderId: row.orderId,
    orderReference: row.orderReference,
    provider: row.provider,
    method: row.method,
    ...(row.settledChannel ? { settledChannel: row.settledChannel } : {}),
    amountLabel: formatMoney(row.amountMinor),
    status: row.status,
    settlementState: row.settlementState,
    callbackCount: row.callbackCount,
    ...(row.providerReference ? { providerRef: row.providerReference } : {}),
    ...(row.failureReason ? { failureReason: row.failureReason } : {}),
    createdAtLabel: formatDateTime(row.createdAt),
  }));
}
