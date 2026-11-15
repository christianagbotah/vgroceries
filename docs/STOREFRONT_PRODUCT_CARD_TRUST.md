# Storefront product-card trust and availability

This is a storefront-only launch-readiness change. It does not modify
inventory, payment, orders, search filtering, or the backend.

## Fixes
- Remove the synthetic five-star **demo** rating from every product card.
  A shopper must not see an invented review score or endorsement.
- Raise the variant selector and primary cart control to at least 44px
  (`h-11`) for mobile touch comfort; improve title legibility.
- Preserve the shopper's **exact selected SKU**. If that size becomes
  unavailable or disappears from a refreshed product snapshot, disable
  purchase and ask for an explicit new selection. The UI must never
  quietly add an alternate size/price to the cart.
- Only show quick-add and wishlist actions for the currently selected
  *available* variant. Existing server-side checkout inventory validation
  remains the final authority.

## Verification
`bun test scripts/storefront-product-card-trust-regressions.test.ts`
checks stale choices, sold-out stock, retained server price and UI trust/accessibility.

These checks do **not** establish that the entire catalogue has source-
verified product photographs or that the site is ready for public launch.
The Coming Soon boundary stays in place until owner acceptance.
