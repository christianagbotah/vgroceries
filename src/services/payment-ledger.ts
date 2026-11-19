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

export interface PaymentLedgerFilters {
  page?: number;
  perPage?: number;
  status?: string;
  settlementState?: string;
  orderReference?: string;
}

export interface PaymentLedgerPage {
  items: PaymentRow[];
  page: number;
  perPage: number;
  total: number;
  /** Demo uses a local fixture array; production numbers are server-reported. */
  isDemo: boolean;
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

/** Existing array contract retained for other screens and older demos. */
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

/**
 * Preserve real server pagination. Never label the first 25 attempts as the
 * complete ledger. Demo fixtures remain searchable/paginatable in memory.
 */
export function normalizePaymentLedgerPage(value: unknown, filters: PaymentLedgerFilters = {}): PaymentLedgerPage {
  const page = filters.page ?? 1;
  const perPage = filters.perPage ?? 25;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100)
    throw new Error("Invalid payment ledger page request.");
  if (Array.isArray(value)) {
    const all = (value as PaymentRow[]).filter((row) =>
      (!filters.status || row.status === filters.status) &&
      (!filters.settlementState || row.settlementState === filters.settlementState) &&
      (!filters.orderReference ||
        row.orderReference?.toLowerCase() === filters.orderReference.toLowerCase()),
    );
    return {items: all.slice((page - 1) * perPage, page * perPage), page, perPage, total: all.length, isDemo: true};
  }
  if (!productionLedger(value) ||
      !Number.isSafeInteger(value.page) || value.page < 1 ||
      !Number.isSafeInteger(value.perPage) || value.perPage < 1 || value.perPage > 100 ||
      !Number.isSafeInteger(value.total) || value.total < 0 ||
      value.page !== page || value.perPage !== perPage || value.items.length > perPage) {
    throw new Error("Payments service returned invalid pagination metadata.");
  }
  return {items: normalizePaymentLedgerResponse(value), page: value.page,
    perPage: value.perPage, total: value.total, isDemo: false};
}
