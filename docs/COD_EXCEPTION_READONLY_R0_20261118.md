# COD exception queue R0 — administrator-only, read-only (18 November 2026)

**Source-only, not deployed.** This is the first guarded component of P0 issue #63,
not a cash collection or remittance authority. The original build brief requires
separate recording of delivery, COD cash collection and rider remittance.

## Endpoint

`GET /api/v1/admin/dispatch/cod-exceptions?page=1&perPage=25&phase=all`

- Requires a genuine authenticated **administrator**. Cashiers, riders, guests,
  unassigned staff and unauthenticated callers cannot read it.
- Filters only non-cancelled COD delivery orders with committed handover/stock
  consumption, with bounded pages (1–100) and optional `delivered`, `in_transit`
  or `all`. A repeatable-read PostgreSQL transaction produces page, count and
  gross order-face-value aggregate from one consistent snapshot.
- Includes no customer name, contact, address, proof image, private API keys,
  refund method, rider phone or access tokens.
- Distinguishes `delivery_incomplete`, `delivered_collection_unverified`, and
  `payment_state_requires_review`. A delivery proof does **not** count as cash;
  neither payment status `succeeded` nor a delivered job proves a cash collection
  event occurred.
- Every item unambiguously says `collectionEvidence=not_recorded_in_variety`
  and `remittanceEvidence=not_recorded_in_variety`, because the dedicated
  collection/remittance ledger has **not yet been built**. Values are **gross
  order face values**, never rider debt or a settled cash balance.
- No database migration, mutation, payment status change, stock or rider-job
  update, customer notification or feature flag activation.

## Still blocked before live COD

Build immutable, exact-once rider collection evidence, custody liability,
partial/short/over cash policy, sealed remittance bag/receipt, supervisor dual
control, reversals, verified cashbook/till reconciliation, appeal/dispute
policy and on-site cash counting. A payment provider callback or delivery
completion must never mark cash collected or remitted. Do not enable live COD.

## Verification

Run shared contract validation, focused COD read-only API/role tests, full API
CI, deterministic OpenAPI generation and test DB drift guard. Before any live
API deployment require a protected data backup, isolated restore, and staging
role test. This patch does not require merchant credentials or live funds.

## Administrator review page

`/admin/dispatch/cod-exceptions` provides a responsive read-only, filterable
exception list and gross face-value summary in ₵. It requires a **real**
administrator session (demo sessions and inventory-only staff are rejected),
fetches only the same-origin real `/api/v1` route, validates the response against
the strict shared Zod contract and suppresses all figures on an unavailable or
malformed response. Page navigation and error-retry do not alter any order,
inventory, remittance or payment record. The admin sidebar links to the page;
no button is provided to mark cash paid or remitted.
