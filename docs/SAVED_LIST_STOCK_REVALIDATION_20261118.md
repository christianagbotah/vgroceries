# Saved shopping lists: current catalogue verification (18 November 2026)

Status: **source-only, not deployed**. This frontend improvement is independent of Hubtel, cashier settlement, delivery activation and production-stock authority.

## Customer behaviour

- A saved wishlist SKU is a snapshot, not a promise of stock or price. Clicking Add calls the existing `catalog.by-variants` service and adds **only the exact selected SKU** when it is still eligible. Missing, invalid or unverifiable stock fails closed. The displayed saved price is explicitly labelled historical.
- Repeat shopping re-resolves the original order's variant IDs and requested quantities. A sold-out pack, unverified stock, insufficient quantity or invalid price is skipped and reported. No silent replacement with another size is permitted.
- Budget-basket suggestions remain non-authoritative recommendations. Clicking Add resolves current catalogue price and availability, uses the **budget captured when the suggestion was generated**, skips missing/duplicate/over-budget lines, and reports what was added or omitted. The budget cap covers proposed item subtotal, **not** delivery charges or eventual tax.
- Slow wishlist searches cannot overwrite newer results after input changes or unmounting. Empty products with no variants do not crash result rendering.

## Trust boundary

`src/features/catalog/saved-list-purchase.ts` is a pure frontend validation helper. Cart additions still **do not reserve or deplete stock**. The order/POS backend must revalidate prices, quantities, reservations and payment before committing a sale. No new external integrations or public endpoints are introduced.

## Verification

Run `bun test scripts/saved-list-live-stock-regressions.test.ts scripts/account-wishlist-regressions.test.ts`, `bunx tsc --noEmit --incremental false` and targeted `bunx eslint` for the changed files. Tests include sold-out/zero/invalid stock, exact SKU, quantity sufficiency, price drift, cap enforcement, duplicates, invalid budgets and UI wiring.

This change does not authorize storefront cutover, payment activation or edits to the public Coming Soon page. Browser E2E and staging acceptance are outstanding.

## CI browser-cache import-order hardening (18 November)

PR CI's Bun 1.4.4 `bun test` run failed two catalogue-cache tests although the same
source passed all 329 tests on the earlier VPS Bun 1.3.14. A browser adapter
imported before the test assigns `NEXT_PUBLIC_CACHE_TTL_MS` can permanently
capture the default `0` TTL at module evaluation, bypassing expected caching.

The adapter now reads the configured TTL at request time. The default remains
**zero** (no cached reads for live-stock customers) and production's public
Next.js env value remains fixed in the compiled bundle; no stock authority,
order or checkout payment semantics change. A test exercises the same
pre-imported adapter with caching disabled and enabled. The change also leaves
mutation-driven cache invalidation intact. Re-run the complete CI suite with
Bun 1.4.4; do not claim the failure solved until GitHub CI confirms it.
