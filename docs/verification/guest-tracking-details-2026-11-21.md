# Guest order details verification — 2026-11-21

## Scope
The public tracking card remains privacy-limited. A guest with the private verification code can now invoke the existing `orders.track` endpoint and view the existing itemised order projection (product, variant, quantity, line total and order total). Account holders retain the authenticated order-history link. No new endpoint, credential, payment flow, database migration or feature flag was added.

## Security invariants
- An order number alone reveals only the existing public statuses; it does not grant access to itemised order data.
- The private code is submitted only to the existing verified tracking endpoint. The backend already tests indistinguishable 403 responses for invalid order/code combinations (`apps/api/test/order-reads.spec.ts`).
- The guest detail request uses the existing tracking request coordinator to avoid stale responses overriding newer results.
- The verification code is not placed in the generated account-history link.

## Verification
- `git diff --check` — passed.
- `eslint src/app/(storefront)/track/page.tsx` — passed (no output).
- TypeScript and PR CI should be checked at the final commit SHA before merge.

## Release restrictions
PR only. Do not deploy to production or shared UAT, activate payments/COD, issue refunds, alter credentials or migrate shared data without explicit owner authorization and security/finance acceptance. Hubtel reconciliation HTTP 403 remains an external authorization blocker.
