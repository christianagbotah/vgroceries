# Customer Return Claims R3a — verified request and staff review

**Default state:** `CUSTOMER_RETURN_CLAIMS_ENABLED=false`. This is a
customer authorization and evidence workflow only. A customer's submitted
request is **not** proof of a physical return, an accepted product disposition,
a refund obligation or captured payment.

## Customer workflow

1. The signed-in customer opens their own account's Returns page.
2. The API independently verifies the original completed order
   (`delivered` or `collected`) and its actual stock-depletion record.
   Unauthorized or guest orders cannot be requested or read as another user.
3. The UI loads server-computed remaining quantities per order line. Any
   physical receipt already recorded, plus every pending/accepted customer
   claim, is deducted from the original depleted quantity.
4. Customers may request specific whole piece counts, or at most three
   decimal places for actual weight/volume units, with a reason for each
   line and an overall 10–600 character reason. Extra text evidence is
   optional. Neither the customer nor browser supplies a refund amount.
5. The request gets a durable reference beginning `VGRQ-` and status
   `requested`. Until staff decides, the owner may cancel the request,
   releasing those units to the remaining-request balance.
6. An authenticated administrator may make exactly one final
   `accept` or `reject` decision with a customer-safe explanation.
   Accepted means **staff handling and inspection**; it does not record
   physically received goods. A rejected request releases its request balance.

## Safety invariants

- **Customer ownership:** all customer reads/mutations require a verified
  customer identity and matching `Order.customerUserId`. Other customers
  receive a non-disclosing 404; admin staff use separate staff endpoints.
  The guest-return process is **not** implemented as a fallback.
- **Physical source:** a completed order and non-null original handover
  `stockConsumedAt`, with original StockDepletion and matching order lines.
  A fake or merely marked-as-paid order cannot bypass these conditions.
- **Quantity:** order row locked before creating claims; PostgreSQL guards
  include a deferred quantity cap across all active claim lines plus actual
  `PhysicalReturnItem` records, using the original depleted quantity.
  Claims without lines or from the wrong order are rejected.
- **Evidence:** claim and lines are immutable after submission except one
  terminal state change. Staff reviews and customer cancellations are terminal.
  Direct SQL cannot edit line quantities, delete claims, introduce lines
  later or forge an empty claim.
- **Replay:** customer submission and cancellation and staff decision use
  durable, actor-scoped idempotency keys. Concurrent competing requests
  serialize on the original order.
- **No monetary or physical effects:** the claim service has no calls to
  `StockLot`, `StockReceipt`, `Refund`, `PaymentAttempt`, COD ledgers,
  settlement or cash collection. Accepted claims are requests, *not*
  approved refunds. No provider-refund claim exists.
- **Flags:** this milestone has a separate OFF-by-default switch. R1/R2a/R2b
  flags, remote-pickup and external provider execution remain unchanged.

## New API and interface

- GET/POST `/api/v1/account/return-claims`
- GET `/api/v1/account/return-claims/orders/{orderId}/eligibility`
- GET `/api/v1/account/return-claims/{claimId}`
- POST `/api/v1/account/return-claims/{claimId}/cancel`
- GET `/api/v1/admin/return-claims`
- POST `/api/v1/admin/return-claims/{claimId}/decision`
- Customer UI: `/account/returns`, replacing the former prototype
  refund-amount preview and mock return submission.
- Staff UI: `/admin/return-claims`, with a link to separate
  `/admin/physical-returns` for real custody and inspection.

## Release and open work

Rehearse migration `202611090032_customer_return_claims` on a protected
restored-UAT database copy. Run direct SQL forged quantity, concurrent claims,
cross-account reads, cancellation finality, default-off, identity, financial
non-mutation and all existing commerce/returns suites. Both GitHub workflows
must pass. Deploy with the flag **OFF** and verify frontend/API route and
authorization smoke checks. Do not interpret a deployed page as an
operational acceptance policy.

**In-app inbox follow-up:** The R3a outbox now projects owner-scoped,
deduplicated requested/accepted/rejected/cancelled updates into the existing
account inbox. Recipients are resolved from the stored claim and order, never
the event payload. This is in-app only; SMS, email, physical receipt and
financial settlement are not implied.

**Next (R3b/R3c):** Link accepted claims to actual staff-verified physical
receipts and reconcile accepted quantity against that receipt; add approved
private evidence storage; then implement
verified-capture and per-line financial amount calculation with refunds
generated exclusively through the Refund Authority. Preserve the
payment/stock/customer ownership separation throughout. Policy on
time windows, opened food returns, discretionary refunds and replacement
shipping awaits actual business approval.
