import { ApiError } from "@/services/adapters/types";
import type {
  AdminProductRow, CashierTillSessionView, PosQuoteView,
  PosHoldView, PosCashSaleView, PosTillReconciliationView,
  SessionLookupResponse,
} from "@/services/contracts";

export type CashierTillList = { enabled: boolean; includesSales: boolean; sessions: CashierTillSessionView[] };

function serverBase(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!value) throw new ApiError("BAD_CONFIG", "The verified POS API is not configured.");
  const url = new URL(value);
  if (!/^\/api\/v1\/?$/.test(url.pathname) || url.username || url.password ||
      url.search || url.hash || !["http:", "https:"].includes(url.protocol)) {
    throw new ApiError("BAD_CONFIG", "The verified POS API address is invalid.");
  }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new ApiError("BAD_CONFIG", "Verified POS testing requires HTTPS.");
  }
  return value.replace(/\/+$/, "");
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

async function apiRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown>; csrf?: string; key?: string } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new ApiError("BAD_CONFIG", "Unexpected POS API path.");
  }
  if (method === "POST" && !options.csrf) {
    throw new ApiError("UNAUTHENTICATED", "A verified web session is required to change a POS record.");
  }
  const response = await fetch(serverBase() + path, {
    method, credentials: "include", cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(method === "POST" ? {
        "Content-Type": "application/json",
        "X-CSRF-Token": options.csrf!,
      } : {}),
      ...(options.key ? { "Idempotency-Key": options.key } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(options.body ?? {}) } : {}),
  });
  let envelope: unknown;
  try { envelope = await response.json(); }
  catch { throw new ApiError("BAD_RESPONSE", "The staging service returned an unreadable response."); }
  if (!response.ok || !isObject(envelope) || envelope.ok !== true || !("data" in envelope)) {
    const error = isObject(envelope) && isObject(envelope.error) ? envelope.error : {};
    throw new ApiError(
      typeof error.code === "string" ? error.code : `HTTP_${response.status}`,
      typeof error.message === "string" ? error.message : "The verified POS request was rejected.",
    );
  }
  return envelope.data as T;
}

export const verifiedPosUat = {
  session: () => apiRequest<SessionLookupResponse>("/auth/me"),
  tills: () => apiRequest<CashierTillList>("/admin/pos/tills"),
  products: () => apiRequest<AdminProductRow[]>("/admin/products"),
  quote: (csrf: string, sessionId: string, lines: { variantId: string; quantity: string }[]) =>
    apiRequest<PosQuoteView>("/admin/pos/quote", {
      method: "POST", csrf, body: { sessionId, lines },
    }),
  hold: (csrf: string, tillSessionId: string, lines: { variantId: string; quantity: string }[]) =>
    apiRequest<PosHoldView>("/admin/pos/holds", {
      method: "POST", csrf, key: crypto.randomUUID(), body: { tillSessionId, lines },
    }),
  sale: (csrf: string, holdId: string, cashReceivedMinor: number, handoverNote: string) =>
    apiRequest<PosCashSaleView>("/admin/pos/cash-sales", {
      method: "POST", csrf, key: crypto.randomUUID(),
      body: { holdId, cashReceivedMinor, cashCountConfirmed: true,
        goodsHandedOver: true, handoverNote },
    }),
  reconciliation: (sessionId: string) =>
    apiRequest<PosTillReconciliationView>(
      `/admin/pos/tills/${encodeURIComponent(sessionId)}/reconciliation`,
    ),
  printReceipt: (saleId: string) =>
    `${serverBase()}/admin/pos/cash-sales/${encodeURIComponent(saleId)}/print`,
};
