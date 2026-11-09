# Physical Return Claim Link R3b — accepted request to actual goods

**Feature gate:** `PHYSICAL_RETURN_CLAIM_LINK_ENABLED=false` by default. Turning it on
requires `CUSTOMER_RETURN_CLAIMS_ENABLED=true` and
`PHYSICAL_RETURNS_INTAKE_ENABLED=true`. These are staff verification authorities,
not live merchant refund approvals.

## Staff workflow

1. Customer submits a return claim on a previously completed, stock-depleted order.
2. Staff accepts the specific claim for investigation, with reason; accepting neither
   records goods nor authorises a refund.
3. Staff navigates from the accepted claim to the physical returns screen.
4. **Only after seeing and counting real goods**, staff enters their condition and
   exact quantities against the original order and optional accepted claim ID.
5. API and PostgreSQL require the claim to be accepted, linked to the *same*
   completed order and to include the returned item lines. Multiple witnessed
   receipts may fulfil one accepted claim, without exceeding its approved quantity.
6. Staff inspects goods through the separate R1 physical-receipt authority. This
   stage never marks a customer as refunded or restores saleable stock.

## Invariants

- Original sale and physical stock depletion remain immutable.
- Customer claim reservations count **once**: linked staff receipts are not
  subtracted again from remaining claim availability.
- Unlinked physical receipts still consume independent return capacity.
- Postgres enforces claim/order identity, source lines, cumulative requested
  quantities, physical returned quantities, and immutable receipt claim provenance
  even when a caller bypasses API validation.
- Original physical receipt idempotency, inspector, quarantine and separate
  independent non-food resale restrictions are unchanged.
- A missing or pending/rejected/cancelled claim cannot be associated with actual
  receipts. A claim link is optional for separately authorised, unclaimed intake.
- No cash, refund, payment, courier, out-of-stock or saleable lot is mutated by
  the claim association. Accepted claim is not evidence of custody.

## Schema and API

Migration: `202611090034_link_claim_to_physical_receipt`.

- Adds nullable, irreversible `PhysicalReturnReceipt.customerClaimId` FK with index.
- Extends `POST /api/v1/admin/physical-returns` with optional `customerClaimId`.
- Returns `customerClaimId` in the staff receipt view and
  `claimLinkEnabled` in the list authority response.
- Admin accepted-claim rows link to physical intake with order and request IDs,
  but staff must physically confirm and enter evidence before receiving.

## Verification and launch blockers

- Apply the new migration on an isolated PostgreSQL test database; run the full
  `verify-api`, `verify`, and shared-contract workflows with all test fixtures.
- Rehearse migration and historical nullable receipts against a protected
  restored-UAT database. Check multiple partial receipts, oversubscription, direct
  SQL forgery, cross-order claims, duplicate requests, and default-off behaviour.
- Before production enablement, approve the operational policy for return windows,
  product-category restrictions, food safety, receipt evidence, independent
  review, customer communication, and financial refund policy.
- Only deploy after the gates and UAT; do not auto-enable flags. R3c remains
  separate: evidence storage, verified captured-payment refund calculation,
  monetary approval/settlement and reconciliation via Refund Authority.
