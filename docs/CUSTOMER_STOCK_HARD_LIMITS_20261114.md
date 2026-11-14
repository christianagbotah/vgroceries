# Variety Groceries — strict customer stock ceilings (14 November 2026)

## Non-negotiable retail rule

Customers can never order more than physically **available to sell**, and no sold-out item can be purchased. If a variant has one unit available, show **Only 1 left** and reject a second; if two, permit at most two cumulative units across the customer's cart; if zero, do not permit any ordering. Stock may change while someone shops; checkout is never allowed to create an oversell or backorder.

**Canonical staging** https://portal.varietygroceries.com; **production** https://varietygroceries.com remains Coming Soon.

## Authority and availability

- Existing API `variant_availability` computes stock **per variant per serving stock location**, deducting active/unexpired reservations and configured safety stock, excluding expired, quarantined and damaged inventory. Only published, active, available variants appear in public purchasable listing. Direct sold-out product URLs show disabled purchase.
- The original NestJS allocation service executes a transaction that locks stock-position rows in deterministic order, totals current sellable lots, rejects any request above available stock (`409 OUT_OF_STOCK` with requested/available conflicts), and atomically rolls back the attempted order. Simultaneous purchasers therefore cannot both claim the final unit. This backend remains the true authoritative check.
- Adding to a local cart does **not** reserve stock; another genuine customer may reserve it first. The website must recheck and explain that change rather than commit a shortage.

## Customer-facing changes

- `src/features/checkout/cart-store.ts`: every cart add and quantity update now takes an explicit current `availableToSell` cap, rejects exceeding the cumulative cart quantity and rejects invalid/nonpositive/unknown amounts. Missing cap fails closed, with a boolean accepted/rejected response.
- `src/features/catalog/product-tile.tsx`: renders `Only 1 left`/`Only 2 left` at low stock, displays quantity already in cart, disables exhausted quick-add and performs a fresh variant availability lookup on each add action. If stock drops meanwhile, displays the new limit and blocks the addition.
- `src/features/catalog/product-purchase-panel.tsx`: product option shows current ATS and remaining quantity after existing cart lines, clamps the quantity input and re-fetches ATS before applying a new add. Sold-out variants stay unavailable.
- `src/components/shared/quantity-input.tsx`: quantity stepper never permits greater than known ATS. Whole-unit items accept only whole units; kg and litre variants accept fractional amounts up to three decimal places with appropriate increments.
- `src/app/(storefront)/cart/page.tsx`: shows real stock and per-line oversold warnings; offers one-click reduction to available quantity. Blocks checkout for any missing, sold-out, excessive or unverified cart item. A corrected cart re-enables checkout.
- `src/app/(storefront)/checkout/page.tsx`: fetches live ATS on entry and again before submitting an order. Prevents submission when quantities are stale or unavailable and displays per-item requested/available counts plus link to adjust cart. If another shopper wins a race between preflight and order allocation, the authoritative server returns `OUT_OF_STOCK` and no order is committed.
- `src/app/(storefront)/assistant/page.tsx` and `src/app/(storefront)/account/lists/page.tsx`: AI suggestions, budget baskets, repeat-order and wishlist adds obey ATS too. The wishlist queries current availability rather than trusting a saved snapshot.

## Acceptance tests

- Permanent `test/customer-cart-stock-limit.spec.cjs` tests the actual Zustand cart code in memory: **7/7 passed**, covering 1 available, 2 available, 0 available, stale cart3 after ATS falls to1, depletion to0, fractional decimal totals, and invalid/negative/unbounded inputs.
- Real canonical staging HTTPS **375px Chromium** test with browser-only simulated ATS against a genuine catalogue SKU (Antiseptic Soap; original ATS 52 untouched): all passed:
  1. ATS1: `Only 1 left`, first add accepted, second add disabled
  2. ATS2: two cumulative adds accepted, third blocked
  3. Old cart quantity3 / new ATS1: checkout blocked, one-click correction to1 re-enables checkout
  4. ATS0: cart shows unavailable and checkout remains blocked until removal
- The browser test intercepted only the client's catalogue lookup response; **no original PostgreSQL stock, lots, orders or payments were changed**. Final frontend optimized Next.js/TypeScript build and targeted ESLint passed; the staging web was restarted. Staging API readiness 200, storefront/cart/checkout 200, anonymous protected inventory API 401; production remains Coming Soon.

## Operational caveat

UI quantities represent a snapshot of remaining *sellable* inventory and are refreshed on the next add and checkout action. They are not a reservation or guarantee that future stock cannot change. The database transaction decides the final allowable quantity; if it becomes unavailable, the attempted order fails and the shopper adjusts the cart. This is intentional, not a shortage accepted by the order system.
