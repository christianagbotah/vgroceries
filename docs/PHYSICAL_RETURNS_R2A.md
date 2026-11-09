# Physical Returns R2a — quarantined stock custody

**Status:** an incremental, independently flag-gated implementation; it is
**not** saleable restocking, returned-goods payout or a customer return approval.

## Workflow

1. An administrator physically receives a completed/depleted order under
   Physical Returns R1 and records the actual returned source order-line units.
2. An administrator inspects every return line, assigning **quarantine** or
   **destroy**, including a condition and durable inspection note.
3. For an inspected **quarantine** line, the dedicated R2a action records
   physically separated quarantine custody. A meaningful storage/custody note
   and actual physical handover confirmation are mandatory.
4. The API resolves the original location, original stock lot, item variant,
   original expiry and source unit cost **from the stored depleted order**.
   The browser never chooses an arbitrary source or destination location.
5. R2a requires **one unambiguous original depleted stock lot per returned
   line**. Multi-lot lines are refused pending a future per-lot evidence policy.
6. In one transaction, the API creates a `StockReceipt`, a new
   `StockLot` with `kind=physical_return_quarantine` and
   `quarantined=true`, a matching `StockMovement` and one immutable
   `PhysicalReturnCustody` record referencing source and quarantine lots.
7. The existing `variant_availability` query includes only
   `kind=regular AND NOT quarantined` lots, so a returned-goods quarantine
   lot **cannot increase saleable stock or checkout availability**.
8. The receipt projection shows original and quarantine lot numbers, held
   quantity and custody timestamp without revealing staff phone, supplier or
   payment details.

## Safety and controls

- Two separate feature flags default OFF:
  `PHYSICAL_RETURNS_INTAKE_ENABLED=false` and
  `PHYSICAL_RETURNS_CUSTODY_ENABLED=false`. Custody requires intake.
- The new route is **administrator-only**:
  `POST /api/v1/admin/physical-returns/items/{itemId}/quarantine`.
  It requires CSRF/Origin (for browser sessions), a valid replay key and a
  strict evidence body. A concurrent second custodian is rejected.
- The stored line must already be finally inspected as **quarantine**.
  A damaged item designated for destruction, uninspected receipt or mismatched
  original lot cannot be added to quarantine inventory.
- PostgreSQL prevents a physical-return quarantine lot without its matching
  custody record and stock movement on transaction commit. The custody record
  and returned quarantine lot are append-only and immutable, including direct
  SQL writes. This is deliberately conservative; release/destruction will
  require independent, audited future approval logic.
- Replays return the original immutable result; failed batches roll back all
  lot, receipt, movement, outbox and audit effects.
- **No money or stock available for sale is created.** A quarantined stock
  receipt is *not* permission for resale; neither the order's original depleted
  stock lot nor payment status changes. No refund obligation, COD cash, provider
  refund or customer payment is inferred from custody.

## Next, still required

- Formal staff review/approval of any restock-eligible item, with explicit
  food-safety policy, unbroken packaging, expiry/cold-chain data, separation
  of duties, saleable lot and accounting transitions. Nothing here silently
  releases quarantined stock to the shop.
- Partial/multi-lot source provenance evidence and cross-location receiving.
- Returned-goods quarantine aging and controlled destruction procedures.
- Customer-owned return request status, refund approval and safe binding to
  the existing Refund Authority, with captured-payment and double-refund
  reconciliation. These are not implemented in R2a.

## Release

Apply migration `202611090030_physical_return_quarantine_custody`
after a protected UAT database backup and rehearsal on a restored copy.
Require PostgreSQL tests for direct SQL forging, receipt/replay uniqueness,
damaged goods, multi-lot evidence ambiguity, same-item concurrency,
unauthorized roles, no stock availability change and no money effects.
Run full GitHub frontend/API CI. Deploy with **both flags OFF** and never
interpret the presence of the staff button as an activation approval.

Related: `docs/PHYSICAL_RETURNS_R1.md`, `docs/RELEASE_COMPLETION_ROADMAP.md`,
GitHub issue #61.
