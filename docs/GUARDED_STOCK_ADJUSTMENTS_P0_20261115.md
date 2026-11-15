# Variety Groceries — P0 guarded stock adjustments (15 November 2026)

## Scope and release posture

The canonical API now includes the **already-migrated** `StockAdjustment`
model's runtime authority in a three-operation flow, extracted selectively
from the unmerged POS development branch rather than importing all its
work or enabling financial actions.

| Path | Authority | What it does |
| --- | --- | --- |
| `GET /api/v1/inventory/adjustments` | Admin or branch-assigned inventory manager | Up to 500 history entries, current active branch only |
| `POST /api/v1/inventory/adjustments/create` | Admin or branch-assigned inventory manager | Idempotent, audited, pending maker request; **no stock movement** |
| `POST /api/v1/inventory/adjustments/decide` | Independent admin only | Reject without stock movement, or approve atomically |

All three routes are **OFF by default**, guarded inside the service with
`STOCK_ADJUSTMENTS_ENABLED=false`. The permission gates are separate:
`inventory.adjust.request` (admin, inventory manager) and
`inventory.adjust.approve` (admin only). Existing bearer/cookie,
origin/CSRF and session rules still apply. Cashiers, customers, riders
and unauthorised branch actors cannot perform stock corrections.

## Safety invariants

- Maker/checker: even an administrator cannot approve or reject **their own**
  request. A different administrator must review it.
- Strict signed quantity input, thousandth-unit precision where appropriate,
  whole units for piece-based items, an operator reason, valid active branch,
  sellable and non-quarantined lot, and bounded physical quantities.
- Corrections must not exceed physical nonnegative stock or eat active
  customer/POS reservations. The approver locks the original request,
  stock position and lot in a serialised order, verifies unchanged
  requested-before stock quantity, rechecks that the variant is still
  active and its quantity unit still permits the correction, and checks
  reserved quantities again.
- The pending request never changes stock. Approval adds exactly one
  stock movement, a linked stock receipt, an adjustment status transition,
  an immutable audit event and a typed inventory outbox event in one
  PostgreSQL transaction.
- Server-scoped idempotency protects retries from changing the payload.
  A repeated request after approval/rejection returns its **current**
  terminal state rather than stale `pending_approval`. Repeated decisions
  cannot apply a stock movement twice.
- Historical zero after-quantity is retained as `"0"` in adjustment
  reports, not silently omitted as falsy.

## Test and deployment gates

The integration test uses a synthetic admin, a separate checker, a branch
inventory manager and a cashier in a fresh PostgreSQL database named
`variety_foundation_test`, with the **full 47-migration chain**. Cases
cover request-to-approval with audit and movement, separate rejection,
self-approval denial, idempotency, branch revocation, invalid forms,
active reservation veto, stale stock count veto, concurrent decision
replay, terminal zero quantity reporting and default-OFF behavior.

No migration is introduced. This is a **source-only capability**; the
production storefront remains Coming Soon. No cash, POS receipt, payment
provider, tax, refund, warehouse restock or existing live UAT rows
are modified.

The workflow must remain disabled on all live/staging services until
the stock officer and two independent administrators complete a supervised
physical count, branch permissions, receipt/audit, retry and reversal
acceptance in the private UAT. Backup, restore and documented rollback
verification are required before any activation.

Current staging POS API (port 3049) is a **different implementation**
sharing the UAT database with canonical API (port 3027). Do not replace
the POS API or switch Nginx targets merely because canonical API now
contains these routes. Release parity and real operator acceptance remain
separate, explicit work items under issue #99.
