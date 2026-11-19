import { z } from "zod";
import {
  posCashSaleListSchema,
  type PosCashSaleView,
} from "@/services/contracts";
import { ApiError } from "@/services/adapters/types";
import { isDemoStaffSessionActive } from "./staff-demo-session";
import { assertVerifiedPosQuoteUat } from "./verified-pos-quote-client";

/** Read-only screen: no POS hold, sale completion, cash, or stock mutation. */
export const verifiedPosCashHistoryUatEnabled =
  process.env.NEXT_PUBLIC_VERIFIED_POS_CASH_HISTORY_UAT === "1";

export function assertVerifiedPosCashHistoryUat(options: {
  enabled: boolean;
  demo: boolean;
  apiBase: string | undefined;
}): void {
  if (!options.enabled)
    throw new ApiError("FEATURE_DISABLED", "Verified POS cash history is disabled.");
  // Reuse the canonical strict real-API protocol, HTTPS and demo rejection
  // without requiring the separate quote-only UI build flag.
  assertVerifiedPosQuoteUat({ enabled: true, demo: options.demo, apiBase: options.apiBase });
}

/** Server fields only, no invented tax, provider settlement or refund status. */
export function parseVerifiedPosCashHistory(input: unknown): PosCashSaleView[] {
  const parsed = posCashSaleListSchema.safeParse(input);
  if (!parsed.success || !parsed.data.enabled || parsed.data.sales.length > 50)
    throw new ApiError("BAD_RESPONSE", "Cash history could not be verified. No receipt data was displayed.");
  const ids = new Set<string>();
  const references = new Set<string>();
  for (const sale of parsed.data.sales) {
    if (ids.has(sale.id) || references.has(sale.reference))
      throw new ApiError("BAD_RESPONSE", "The cash history has duplicate sale records.");
    ids.add(sale.id);
    references.add(sale.reference);
    const itemTotal = sale.lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
    if (!Number.isSafeInteger(itemTotal) || itemTotal !== sale.subtotalMinor ||
        sale.cashReceivedMinor < sale.subtotalMinor ||
        sale.cashReceivedMinor - sale.changeGivenMinor !== sale.subtotalMinor)
      throw new ApiError("BAD_RESPONSE", "Cash history totals could not be reconciled.");
  }
  return parsed.data.sales;
}

export function verifiedPosReceiptPrintUrl(saleId: string, apiBase: string): string {
  assertVerifiedPosCashHistoryUat({
    enabled: true, demo: false, apiBase,
  });
  if (!z.string().uuid().safeParse(saleId).success)
    throw new ApiError("VALIDATION_FAILED", "A valid server cash-sale ID is required.");
  return apiBase.replace(/\/+$/, "") +
    "/admin/pos/cash-sales/" + encodeURIComponent(saleId) + "/print";
}

export async function loadVerifiedPosCashHistory(): Promise<PosCashSaleView[]> {
  assertVerifiedPosCashHistoryUat({
    enabled: verifiedPosCashHistoryUatEnabled,
    demo: isDemoStaffSessionActive(),
    apiBase: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
  // No shared account cache: the backend rechecks administrator auth for
  // every request; never persist names or receipts in browser storage.
  const { api } = await import("@/services/client");
  return parseVerifiedPosCashHistory(await api<unknown>("pos.verified.cash-sales"));
}
