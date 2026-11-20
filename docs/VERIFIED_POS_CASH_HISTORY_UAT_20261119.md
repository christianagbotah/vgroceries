# Verified POS cash-sale history — administrator read-only UAT (19 Nov 2026)

## Scope

This adds a separate, source-only backend-authoritative **read-only** sales review
at `/admin/pos/verified-uat/history`, reachable from the existing verified POS
quote screen only when `NEXT_PUBLIC_VERIFIED_POS_CASH_HISTORY_UAT=1`.

This build flag defaults OFF. A real, active administrator session and a trusted
`NEXT_PUBLIC_API_BASE_URL` HTTPS `/api/v1` endpoint are required. Localhost
HTTP is allowed for isolated development. Demo staff sessions, disabled flags,
incomplete or untrusted URLs and non-admin roles fail closed.

The API must independently enable `POS_CASH_SALES_ENABLED=true`; it remains
**false by default**, including in production. This frontend work does not
turn it on. The `AdminAuthGate` is UX-level protection; the NestJS
`PosCashSalesController` enforces the administrator role on every request.

## Data and available UI

- `GET /api/v1/admin/pos/cash-sales` is the **only** service operation.
  It reports at most the most recent 50 entries, not a complete financial ledger.
- The shared, strict `posCashSaleListSchema` validates all rows. The client
  additionally rejects duplicate identities, inconsistent line/cash totals,
  paid/electronic and tax-invoice assertions and overlong listings.
- The UI supports searching only the already returned list by reference,
  customer name or till ID; an empty result does not assert that a till is
  balanced or that the full business history is empty.
- Each record includes server-created sale reference, timestamp in Ghana time,
  original cashier-till identifier, item quantities, cash counted, change
  handed to the customer, and total in **₵**. SKU IDs appear in the item
  list; immutable product names appear only in the server receipt HTML rather
  than being falsely reconstructed from today's catalogue.
- "Open original cash receipt" links to
  `GET /api/v1/admin/pos/cash-sales/{saleId}/print` using a validated UUID
  and configured trusted API origin. The backend authenticates that request,
  serves immutable receipt labels, and applies no-store/CSP/no-script headers.
  Browser third-party cookie restrictions may affect cross-origin print
  workflows: use a verified same-origin reverse proxy in staging UAT.
- No name, receipt, provider secret or customer data is persisted in browser
  storage. Transport requests use real staff credentials, `no-store` and
  no operation-registry memoization.
- The same default-OFF build gate also protects a **separate read-only**
  `/admin/pos/verified-uat/reconciliation` screen. It lists currently known
  tills, requests only the selected till’s backend `GET` cash ledger, checks
  strict arithmetic and status consistency, distinguishes physical drawer
  variance from record-integrity conflicts, and links to the backend’s
  authenticated CSV export. It never records cash or closes a till.
  See `docs/VERIFIED_POS_TILL_RECONCILIATION_UAT_20261119.md`.

## Deliberate limits and prerequisites

This is **not** a POS sale entry screen and does not add hold, stock transfer,
cash tender, settlement, discount, opening/closing float, tax invoice, cash refund,
financial exports, electronic payment, or return recording buttons. It adds no
new database migration, server mutation or merchant API call.

The canonical source and current POS-integrated staging service still require
release-pair parity review under `docs/CANONICAL_POS_PORTAL_RELEASE_PARITY_GATE_20261116.md`.
Before enabling the read-only flag on any deployment, prove against isolated
restored UAT that administrator-only access, correct till membership, receipt
reprints, sale amount and cash-change totals are correct. Also test session
expiry, authorization denial, mobile layouts and concurrent cash sale creation.
The existing backend cash sale feature itself remains separately gated pending
cash handling, tax, returns/refunds and complete cashier UAT.

## Verification

```bash
bun test scripts/verified-pos-cash-history-frontend.test.ts \
  scripts/verified-pos-quote-frontend.test.ts \
  scripts/verified-pos-customer-picker.test.ts
./node_modules/.bin/eslint src/features/staff/verified-pos-cash-history-*.ts* \
  src/app/admin/pos/verified-uat/history/page.tsx \
  scripts/verified-pos-cash-history-frontend.test.ts
./node_modules/.bin/tsc --noEmit --incremental false
```

GitHub CI and API foundation results must be checked on the exact PR commit
before any merge or staging review. A source-level green test is not a live
cashier, fiscal invoice, provider receipt, return, stock or refund acceptance.
