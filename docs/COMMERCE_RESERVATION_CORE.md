# Commerce reservation core

Implemented 10 October 2026 as the first internal slice of Commerce Authority.
This is a backend domain capability only. It does not add a public reservation
HTTP endpoint, it does not implement orders/POS/handover, and the public Next.js
shop must remain on the existing demo transport until later commerce milestones
are complete.

## Internal domain API

`AllocationService` is owned by the inventory module and exported for later
orders and POS modules. Callers supply an existing Prisma transaction so the
claim, its order/POS state, audit row and outbox event can commit or roll back as
one unit.

- `create(tx, input)` creates lot-specific active reservations and returns the
  exact lot splits. `input` contains claim type (`order` or `pos_draft`), claim
  id, location id, expiry, actor/request provenance, and unique claim-line ids.
- `release(tx, claimType, claimId, context?)` changes only active rows for that
  claim to `released`. Retrying a completed release returns zero.
- `expire(tx, now, context?)` changes only active rows whose expiry has passed to
  `expired`. Released and consumed rows are terminal for this operation.

No controller exposes these methods directly. Future checkout/order and POS
commands must call this same service rather than writing `Reservation` rows.

## Allocation invariants

Availability remains:

`eligible physical stock - active unexpired reservations - safety stock`.

`create` validates the whole request before inserting reservations. Requested
variant/location positions are locked with PostgreSQL `FOR UPDATE` in stable
variant-id order, then availability is recalculated inside that transaction. A
short line produces `409 OUT_OF_STOCK` with requested/available conflict data;
no earlier line is left held.

Lot selection is FEFO. Eligible lots are regular, non-quarantined, positive
quantity, and either undated or expiring strictly after the current UTC date.
Expired lots, lots expiring today, damaged/other unsaleable kinds and quarantine
are excluded. Sorting is expiry ascending with undated lots last; ties use lot
creation time then lot id. Existing active/unexpired lot reservations are
subtracted before a new claim is split across lots.

Stock quantities use `Prisma.Decimal`. Inputs must be positive decimal strings
with at most three fractional digits. `kg` and `litre` can be fractional;
count-based units require whole quantities. Safety stock is never allocatable.

## Persistence and lifecycle

Migration `202610100002_commerce_reservation_core` upgrades `Reservation` from
the foundation placeholder to durable lot-linked claims with `lotId`, claim
provenance, `createdAt`, uniqueness on claim/line/lot, and lookup indexes. Its
allowed lifecycle is `active`, `released`, `consumed`, `expired`.

The foundation had no production reservation command, so pre-commerce
position-only placeholder rows could not be reconciled to a real lot or claim.
Migration 002 deliberately deletes those placeholder reservation rows before
making provenance columns mandatory rather than inventing history.

Successful allocation writes `inventory.allocated` audit and outbox records in
the same caller transaction. Context-bearing release/expiry operations similarly
write `inventory.released` / `inventory.expired`. A database failure during the
outbox insert rolls back reservations and audit together. Outbox persistence is
not a running queue publisher; worker delivery remains later work.

## Verification evidence

Measured in the isolated Variety Groceries development worktree on Node 24.19.0
with a disposable localhost PostgreSQL 18.1 server. Hosted CI remains the
PostgreSQL 17 compatibility authority.

- Foundation baseline before changes: 40/40 API tests passed.
- Lot-linked migration regression: new test failed first on missing `lotId`, then
  passed after migration; API suite reached 41/41.
- Exact allocation values: 4/4 focused tests passed; full suite 45/45.
- FEFO/rollback/safety/release/expiry: 4/4 focused tests passed; full suite 49/49.
- Final-unit race: ten rounds across two independent Nest/Prisma instances; each
  round produced exactly one winner, one `OUT_OF_STOCK` loser, one unit held and
  zero remaining available; full suite 50/50.
- Atomic events: 7/7 allocation tests passed including an injected PostgreSQL
  outbox failure proving no reservation/audit/event partial commit; full suite
  52/52.
- Migration 001 + 002 applied successfully to a purpose-created database with
  zero prior public tables; `reservation_positive`, the four-state lifecycle
  constraint, and `variant_availability` were present afterward.
- Generated foundation OpenAPI stayed at 13 implemented HTTP operations and has
  no path containing `reservation` or `allocation`.

Final repository-wide verification on the same branch also passed: root ESLint,
strict TypeScript and production Next.js build; 24/24 handoff regressions; 35/35
Bun tests; 32/32 shared-contract checks; 24/24 business acceptance checks; and
56/56 built routes returning HTTP 200 from an isolated localhost production
server. The final API rerun remained 52/52.

## Next slice

Build durable online checkout/orders on top of this internal allocation service:
server-authoritative price revalidation, atomic order + hold creation, durable
idempotency, customer-safe order reads and cancellation/release. POS then reuses
the same allocator; handover/physical depletion follows as a separate once-only
stock event. No payment provider or public backend cutover should happen before
those commerce authority slices are verified.
