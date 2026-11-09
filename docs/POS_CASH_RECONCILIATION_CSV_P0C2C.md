# P0c2c — read-only CSV export for cash drawer shift reports

**Status: code review; live POS OFF.** This extends the read-only
PostgreSQL shift reconciliation preview from PR #81. It is an export only;
it cannot post a sale, alter drawer movements, authorize a payment, create
an accounting entry or adjust inventory.

## Endpoint

`GET /api/v1/admin/pos/tills/{sessionId}/reconciliation.csv`

The endpoint is authenticated and strictly administrator-only. It calls
the exact same `PosTillReconciliationService.preview` as the JSON report,
which uses a repeatable-read database snapshot, then serializes that one
validated result to a UTF-8 CSV file. Headers disable caching and request
a local CSV download.

The CSV contains one `metric,value` row per datum and shows opening
float, manual cash in/out/drop, completed **cash-only** POS sales, expected
drawer cash, original and independently recalculated closing difference,
status and active cart-hold count. The latest 20 cash-sale references are
included for context. The aggregate totals include **all** cash sales,
not only those 20; truncation is explicitly stated.

Financial values are exported as **integer pesewas** to avoid currency
rounding or presentation mistakes. Any consumer rendering in Ghana cedis
must divide by 100 and display the required ₵ currency symbol.

## Spreadsheet security

- Text fields are normalized to one line; CR, LF, tabs and control
  characters are replaced with safe spaces.
- CSV fields are quoted; literal double quotes are doubled.
- Any text starting (after spaces) with a formula marker
  `=`, `+`, `-` or `@` is prefixed with an apostrophe so Excel-like
  programs do not execute untrusted catalogue/till reference text.
- Actual server-owned integers are written as numbers, including a
  negative closing variance.
- No customer phone, payment credential or personally identifying
  customer data is exported.

The CSV explicitly flags `electronic_payments_reconciled=false`,
`refunds_reconciled=false` and
`tax_or_general_ledger_reconciled=false`. It must not be confused with
statutory tax records, a verified bank settlement or general ledger.

## Acceptance

Both GitHub CI workflows must pass, including route/OpenAPI contract and
isolated PostgreSQL tests for administrator access, correct shift values,
read-only behavior, formula injection and unchanged stock and payment
records. Production till/hold/cash-sale feature flags remain OFF.
