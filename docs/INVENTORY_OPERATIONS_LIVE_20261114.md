# Variety Groceries — real inventory operations milestone

**Canonical staging:** https://portal.varietygroceries.com
**Production:** https://varietygroceries.com — retains the Coming Soon page until launch readiness.

## Delivery in this milestone

1. **Live stock overview** at `/admin/inventory`: PostgreSQL-backed `GET /api/v1/inventory/overview` with keyword search, server-side `all` / `low` / `zero` / `reserved` filters, 48-item UI pages, current physical stock, reservations, safety floors, availability, recorded lot count, nearest eligible expiry, latest lot movement and whole-branch summary quantities. Filtering and summaries are calculated at the backend; the summary is intentionally independent of the selected search/filter. A repeatable-read transaction makes the per-request rows, count and summary coherent.
2. **Real stock lot ledger** at `/admin/inventory/lots`: authenticated `GET /api/v1/inventory/lots`, positive-balance lots, actual product, variant, lot number, recorded expiry, status, location, human-readable mobile cards and desktop table. Search and status filters within the returned branch dataset are read-only. The maximum full report is 1,000 lots; the backend explicitly refuses a truncated result and supports server filtering by `variantId`.
3. **Goods receipt history** at `/admin/inventory/receiving`: authenticated `GET /api/v1/inventory/receipts`. A receipt includes only lots at the requested/authorized branch. Its **original received quantity** is sourced from the immutable `StockMovement` with reason `receive`, *not* current remaining lot quantity. This prevents historical receipts from shrinking after later sales. Staff identity is resolved from the database, or shown as an unlinked historical actor. A 500-receipt report limit fails explicitly rather than silently hiding records.
4. **Direct goods receipt entry** through the existing protected `POST /api/v1/inventory/receive`: the React receiving form now uses a real administrator catalogue product/variant search and sends the server-authoritative shape, with an optional delivery reference and a retry-stable idempotency key. The server already atomically creates stock lots, initial movements, audit/outbox records and idempotency receipts. Browser-provided actor IDs are excluded in REST mode.
5. **Expiry & quarantine** is unchanged as an authenticated, read-only exception report. Expiry today is not sellable, precisely matching the SQL `variant_availability` view. Pending audited adjustment, quarantine-release and disposal workflows are not falsely enabled.

## Security and accounting invariants

- The same `StockPosition` / `StockLot` / `Reservation` data is used for storefront, checkout, POS and inventory. The report does not mutate stock.
- All three new read endpoints require a real session and `inventory.read`. Branch access is checked server-side. Staff members cannot request another branch by changing the URL.
- Receipt entry requires `inventory.receive`, a CSRF-protected session, validated decimal quantities, a bounded input and an idempotency key. Backend transactions hold row locks for concurrent receipts.
- The original staging branch `loc_accra` and database `lightworld_variety_uat` remain authoritative. No demo/fixture stock is migrated from the old standalone POS-UAT database.
- Approval of goods receiving does not imply that an outside supplier, purchase-order account, invoice or payment integration is functioning. Those provider-backed workflows remain gated.
- No receipts were artificially posted in the original staging database to make these screens appear populated.

## Evidence and acceptance

- API TypeScript build and focused automated tests must pass.
- Optimized Next.js build, frontend lint, route smoke and real authenticated staff browser checks must pass.
- Verify complete record counts and anonymous 401s on original staging API.
- Production remains the Coming Soon landing page.

## Remaining before full commercial readiness

- Supplier and purchase order lifecycle, including receipts matching approved quantities and price variances.
- Audited stock adjustment and stocktake approval, quarantine release, disposal/write-off controls and maker/checker authorization.
- Real operational roles (finance reviewer, picker/packer, dispatcher, operations manager) with end-to-end backend RBAC, invitation and revocation.
- Provider-verified Hubtel payments and refund settlement, full order orchestration, rider proof-of-delivery, configurable Ghana delivery zones, order-to-cash reconciliation, exports and recovery/UAT.
- Messaging, account/legal policy settings and production launch gates.

## Verified results (14 November 2026)

- **11/11 targeted inventory API automated tests passed** (expiry, overview, receipts, branch denial, large-report refusal).
- All modified frontend screens passed targeted ESLint; optimized Next.js build passed TypeScript and produced 61 routes.
- Staging API live/ready returned HTTP 200; anonymous inventory endpoints returned HTTP 401.
- Real authenticated HTTPS Chrome UAT at 375px on `portal.varietygroceries.com` passed the administrator role, the 32 original stock variants and summaries, 32 physical lots and receipt history, and live goods-receiving form.
- A **disposable clone** of the original staging PostgreSQL database was used for transaction-level testing. It proved exactly-once receipt creation and +2 sellable units on initial receipt, idempotent replay, 409 on same-key/different-body conflict, automatic quarantine of yesterday-expired goods without increasing sellable stock, and original immutable receipt quantity.
- The disposable PostgreSQL clone was stopped and removed afterward. A private original UAT snapshot remains at `/home/lightworld/backups/varietygroceries-stage-consolidation/original-staging-before-receive-qa-20261114.dump` with mode 600.
- Actual original staging inventory was **not** seeded or modified by the clone QA, and the production Coming Soon domain was confirmed unchanged.
