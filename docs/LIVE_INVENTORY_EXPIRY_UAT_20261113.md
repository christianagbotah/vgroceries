# Variety Groceries — live inventory expiry and quarantine report

**Staging domain:** https://portal.varietygroceries.com/admin/inventory/expiry

## Change

The inventory expiry screen previously had only a mock operation and no real REST endpoint; requesting `GET /api/v1/inventory/expiry` returned HTTP 404. This milestone adds a real, read-only, branch-scoped endpoint using the same PostgreSQL `StockLot`, `StockPosition`, `Variant`, `Product`, and `Location` records as storefront availability and POS.

- Requires a real authenticated session with the backend `inventory.read` permission. The default location is the existing portal UAT location `loc_accra`; any optional `locationId` is validated and nonadmin users may read only locations explicitly assigned in their session.
- Reports **only positive recorded physical lot quantities**. The endpoint never fabricates expiry dates or product quantities.
- Uses the current UTC calendar date for Ghana: today and earlier are expired/unavailable for sale; the next seven days are in the expiring queue. This is deliberately identical to the PostgreSQL `variant_availability` stock view.
- Each lot belongs to one exception queue to prevent duplicate counts. Recorded damaged/spoilage goods are separately flagged; quarantined/unknown nonregular lots are not promoted as saleable stock.
- Reports product, variant, recorded lot number, quantity, recorded expiry (if present), exception status, and stock location.
- Rejects reports above 2,000 active lots instead of silently returning incomplete counts. Pagination/streaming is a future enhancement for larger facilities.
- The live UI displays the recorded exceptions. Quarantine release and disposal actions intentionally stay hidden **in REST mode**, because their backend write operations have not yet been audited and implemented; mock mode retains its existing demo actions.
- No migrations, stock mutation, promotional publication, auto-disposal, refunds or supplier ordering were introduced.

## Verification

- TypeScript backend build.
- New unit/security tests cover exact calendar thresholds, zero stock filtering, preservation of quarantine state, branch denial, and large-report refusal.
- Authenticated administrator and anonymous browser/API checks on the canonical staging portal.
- Frontend optimized build and route smoke checks.
- Existing primary staging database had **32 positive regular stock lots, none with recorded expiry dates or quarantine/damage flags** when inspected. An empty exception report is therefore truthful; do not seed false expiry records solely to make the page look busy.

## Further work

Implement the receipt-driven lot ledger review, audited quarantine release and disposal endpoints with idempotency and maker/checker approval where required, then restore the corresponding staff actions. Add a safe actual-expiry fixture in a separate temporary test database to verify staff experience without touching canonical staging inventory.
