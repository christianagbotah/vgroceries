import {
  cashierTillListSchema,
  posTillReconciliationViewSchema,
  type CashierTillSessionView,
  type PosTillReconciliationView,
} from "@/services/contracts";
import { ApiError } from "@/services/adapters/types";
import { isDemoStaffSessionActive } from "./staff-demo-session";
import {
  assertVerifiedPosCashHistoryUat,
  verifiedPosCashHistoryUatEnabled,
} from "./verified-pos-cash-history-client";

function assertAvailable() {
  assertVerifiedPosCashHistoryUat({
    enabled: verifiedPosCashHistoryUatEnabled,
    demo: isDemoStaffSessionActive(),
    apiBase: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
}

export function parseVerifiedTillChoices(input: unknown): CashierTillSessionView[] {
  const parsed = cashierTillListSchema.safeParse(input);
  if (!parsed.success || !parsed.data.enabled || parsed.data.sessions.length > 100)
    throw new ApiError("BAD_RESPONSE", "Till list could not be verified.");
  const unique = new Set(parsed.data.sessions.map(s => s.id));
  if (unique.size !== parsed.data.sessions.length || parsed.data.sessions.some(till =>
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(till.id)))
    throw new ApiError("BAD_RESPONSE", "Till list has invalid or duplicate identities.");
  return parsed.data.sessions;
}

export function parseVerifiedTillReconciliation(
  input: unknown, selectedTillId: string,
): PosTillReconciliationView {
  const result = posTillReconciliationViewSchema.safeParse(input);
  if (!result.success)
    throw new ApiError("BAD_RESPONSE", "The cash reconciliation report was invalid.");
  const row = result.data;
  if (row.tillSessionId !== selectedTillId)
    throw new ApiError("BAD_RESPONSE", "The server returned a report for a different till.");
  const expected = row.openingFloatMinor + row.manualCashInMinor -
    row.manualCashOutMinor - row.manualCashDropsMinor + row.cashSalesMinor;
  if (!Number.isSafeInteger(expected) || expected < 0 ||
    expected !== row.expectedDrawerCashMinor)
    throw new ApiError("BAD_RESPONSE", "Expected drawer cash does not reconcile with recorded movements.");
  if (row.recentCashSales.length !== Math.min(row.cashSalesCount, 20) ||
    row.recentCashSalesTruncated !== (row.cashSalesCount > 20) ||
    new Set(row.recentCashSales.map(s => s.id)).size !== row.recentCashSales.length)
    throw new ApiError("BAD_RESPONSE", "The recent cash-sales breakdown is inconsistent.");
  if (row.status === "open") {
    if (row.closedAt !== null || row.actualCountedCashMinor !== null ||
        row.closingExpectedCashMinor !== null || row.closingDifferenceMinor !== null ||
        row.recomputedDifferenceMinor !== null || row.closingMatchesLedger !== null)
      throw new ApiError("BAD_RESPONSE", "An open till cannot include completed closing figures.");
  } else {
    const difference = row.actualCountedCashMinor === null
      ? null : row.actualCountedCashMinor - expected;
    if (!row.closedAt || row.actualCountedCashMinor === null ||
        row.closingExpectedCashMinor === null || row.closingDifferenceMinor === null ||
        row.recomputedDifferenceMinor !== difference ||
        row.closingMatchesLedger !==
          (row.closingExpectedCashMinor === expected &&
           row.closingDifferenceMinor === difference))
      throw new ApiError("BAD_RESPONSE", "The closed till does not reconcile with its cash count.");
  }
  return row;
}

export function verifiedTillCashCsvUrl(tillId: string, apiBase: string): string {
  assertVerifiedPosCashHistoryUat({ enabled: true, demo: false, apiBase });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tillId))
    throw new ApiError("VALIDATION_FAILED", "A valid till identifier is required.");
  return apiBase.replace(/\/+$/, "") +
    "/admin/pos/tills/" + encodeURIComponent(tillId) + "/reconciliation.csv";
}

export async function loadVerifiedTillChoices(): Promise<CashierTillSessionView[]> {
  assertAvailable();
  const { api } = await import("@/services/client");
  return parseVerifiedTillChoices(await api<unknown>("pos.verified.tills"));
}

export async function loadVerifiedTillReconciliation(
  tillId: string,
): Promise<PosTillReconciliationView> {
  assertAvailable();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tillId))
    throw new ApiError("VALIDATION_FAILED", "A valid till identifier is required.");
  const { api } = await import("@/services/client");
  const response = await api<unknown>("pos.verified.reconciliation", { query: { sessionId: tillId } });
  return parseVerifiedTillReconciliation(response, tillId);
}
