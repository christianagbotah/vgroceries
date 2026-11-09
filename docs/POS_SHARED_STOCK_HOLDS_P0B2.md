# P0b2 — temporary shared POS stock holds

This is a **default-OFF** backend capability, not a completed POS sale.
`POS_STOCK_HOLDS_ENABLED=true` requires both `POS_QUOTE_ENABLED=true` and
`POS_TILL_FOUNDATION_ENABLED=true`. Default hold life is **300 seconds**;
`POS_STOCK_HOLD_TTL_SECONDS` is strictly limited to 1–300.

## Operation and guarantees

An authenticated administrator can create one active counter cart per open
till at the configured commerce inventory location. Each line is revalidated
against the stored active/published catalog price, unit and stock position.
An atomic transaction creates `PosStockHold` and immutable priced lines,
then invokes the existing `AllocationService.create` with
`claimType=pos_draft`, so identical `Reservation` rows and lot/position
locks govern both counter holds and online checkout. A last-unit race cannot
succeed twice. No client prices or asserted payments are accepted.

Endpoints (administrator only):
- `GET /api/v1/admin/pos/holds` — bounded recent holds and effective status.
- `GET /api/v1/admin/pos/holds/{holdId}` — source and expiry.
- `POST /api/v1/admin/pos/holds` — idempotent, temporary stock reservation.
- `POST /api/v1/admin/pos/holds/{holdId}/release` — idempotent release with reason.

At most one `held` row per till, enforced in PostgreSQL. An expired cart
can be marked `expired` and its reservations retired during the next
create. Even before cleanup, expired reservations do **not** reduce
`variant_availability` (only `state='active'` with `expiresAt > now()`
are counted). A replay returns current effective status, never stale
`stockReserved:true`. Till closing is blocked while an unexpired
reservation is still held.

The database independently validates till/branch/admin identity, original
server price and units, immutable hold state, maximum 5-minute expiry,
and exact hold line/reservation aggregate. Orphan or fabricated POS
reservations are rejected. Audited events provide provenance.

## Non-authorities and next gate

A hold creates **no Order, PaymentAttempt, Refund, StockDepletion,
StockMovement, CashierTillMovement, journal, receipt, handover or discount**.
There is no cashier delegation, external tender verification, offline
confirmed sale or refund. This feature must not be presented as live POS.

PostgreSQL regression tests cover shared availability, online/POS last
item race, two-till contention, expiry/replay, release, till close blocking,
role restrictions, tampering and SQL-level forgery. Both GitHub workflows
must pass before merge. The live flags remain OFF pending POS P0c.

P0c must revalidate the hold at commit, consume its existing pos_draft
reservation with the shared depletion engine, prove payment or cash evidence,
generate printed receipts, handle refunds and reconcile till sale totals.
P0b2 alone does not authorize any such operation.
