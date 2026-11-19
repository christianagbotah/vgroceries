import type { PaymentLedgerFilters, PaymentLedgerPage } from "@/services/payment-ledger";

/**
 * Human-facing, read-only reconciliation evidence. Exactly the already
 * displayed page, NOT an entire ledger, bank settlement statement or receipt.
 * Neutralize spreadsheet formula injection in all server-sourced text cells.
 */
function cell(value: unknown): string {
  const raw = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ");
  const safe = /^\s*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}
const line = (values: readonly unknown[]) => values.map(cell).join(",");

export function paymentLedgerPageCsv(
  ledger: PaymentLedgerPage,
  filters: PaymentLedgerFilters = {},
): string {
  if (!Number.isSafeInteger(ledger.page) || ledger.page < 1 ||
      !Number.isSafeInteger(ledger.perPage) || ledger.perPage < 1 ||
      ledger.perPage > 100 || !Number.isSafeInteger(ledger.total) ||
      ledger.total < 0 || ledger.items.length > ledger.perPage)
    throw new Error("Invalid payment ledger snapshot; the export was cancelled.");

  const rows: unknown[][] = [
    ["Report", "Variety Groceries payment attempts — visible page only"],
    ["Scope", ledger.isDemo ? "Demo fixture, not financial evidence" : "Server-reported staff ledger"],
    ["Page", ledger.page],
    ["Matching attempts across all pages", ledger.total],
    ["Attempts exported from this page", ledger.items.length],
    ["Attempt status filter", filters.status ?? "Any"],
    ["Settlement filter", filters.settlementState ?? "Any"],
    ["Exact order reference filter", filters.orderReference ?? "Any"],
    [],
    ["Order reference", "Payment provider", "Method", "Amount (₵)", "Attempt status",
      "Initiation", "Reconciliation", "Provider transaction reference",
      "Callbacks", "Recorded UTC", "Failure reason"],
  ];
  for (const attempt of ledger.items) {
    rows.push([
      attempt.orderReference ?? "", attempt.provider ?? "", attempt.method,
      attempt.amountLabel, attempt.status, attempt.initiationState ?? "",
      attempt.settlementState, attempt.providerRef ?? "", attempt.callbackCount,
      attempt.createdAtLabel, attempt.failureReason ?? "",
    ]);
  }
  return "\ufeff" + rows.map(line).join("\r\n") + "\r\n";
}
