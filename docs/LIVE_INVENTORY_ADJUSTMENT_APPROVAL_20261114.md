# Variety Groceries — live physical stock adjustment approval

**Deployed only to:** https://portal.varietygroceries.com

**Production:** https://varietygroceries.com remains Coming Soon. This inventory-governance workflow does not authorise a production public launch.

## Problem corrected

The existing `/admin/inventory/adjustments` page used a simulated operation surface and pointed to non-existent adjustment routes. It could misleadingly appear that approvals were real. This work adds persistent records, real database-level change control, real permission gates and an actual browser workflow.

## Implementation

- New `StockAdjustment` model with stable UUIDs, original lot/variant/location, signed Decimal(15,3) quantity delta, reason, optional supporting note, maker, checker, recorded original balance, optional approved balance, decision timestamp and movement receipt reference.
- Migration: `202611140001_inventory_adjustment_approval`. PostgreSQL constraints forbid zero delta, invalid workflow states, negative recorded balances and inconsistent terminal-state metadata.
- Real routes:
  - `GET /api/v1/inventory/adjustments`: authenticated inventory reader and branch-grant enforcement.
  - `POST /api/v1/inventory/adjustments/create`: inventory manager or administrator; strict input, bounded decimals, non-empty reason, mandatory `Idempotency-Key`, server-owned maker identity.
  - `POST /api/v1/inventory/adjustments/decide`: administrator only; strict decision schema and server-owned checker identity.
- A requester cannot decide their own correction, including an administrator. An inventory manager can request, never approve. A cashier cannot request or approve.
- Requests do **not** alter physical stock or sellable availability. The approving transaction locks the adjustment, then the stock position, then the physical lot; it rejects stale original balances and ineligible, quarantined or expired stock. It checks active reservations and refuses to reduce stock below the quantity held for carts or orders.
- Successful approval atomically creates an actual adjusted physical quantity, `StockReceipt` anchor, immutable `StockMovement`, a final approved adjustment, audit event and outbox event. The special receipt anchor has no incoming lot items and is not shown as a supplier goods receipt.
- Rejection atomically records the checker and audit event without touching the physical stock. A repeated same decision is a replay; an opposite final decision fails without modifying data.
- The mobile-responsive administrator interface includes clear lot selection, signed quantity, mandatory explanation, history and explicit approval/rejection confirmation dialogs. Unsafe lots cannot be selected.
- The production OpenAPI registry declares all three routes, response/request schemas, and session/CSRF/idempotency requirements. The exact-path contract test guards against undocumented endpoint regressions.

## Acceptance and preservation

- Before original staging migration, a private PostgreSQL custom-format backup was created at `/home/lightworld/backups/varietygroceries-stage-consolidation/original-portal-before-adjustment-20261114.dump` and restricted to mode 600.
- The migration was first applied successfully to an isolated restored clone, then to the exact original staging database `lightworld_variety_uat` on localhost. Original records were verified: **32 products, 32 stock lots, 32 receipts, zero synthetic adjustments**.
- Real PostgreSQL clone tests passed: maker/checker separation, idempotent key replay and conflicting replay, approve-once movement and audit, rejected decision with zero movement, stale-count conflict, active reservation safety, post-request quarantine blocking, owner self-approval rejection, branch isolation, and unchanged original receipt history.
- Permanent unit/security and inventory tests: **17/17 passed**.
- OpenAPI contract/authority tests: **3/3 passed**.
- Next.js production build and TypeScript compilation passed; administrator actual HTTPS browser at 375 px passed page rendering, actual empty adjustment queue, real staff identity and preservation of all 32 original stock lots.
- Public/anonymous API calls to all three adjustment routes return **401**. Health and OpenAPI endpoints return HTTP 200.
- The production root continues serving **Variety Groceries — Coming Soon**.

## Not yet implemented

- Multi-lot cycle-count/stocktake approval, evidence attachments, quarantine status changes, product disposal/write-offs, partial returned-goods resale decisions, stock-accounting journal reconciliation and final provider-backed purchase-order matching.
- No real staging adjustment was posted simply to make this screen appear populated; destructive test scenarios were isolated to the temporary clone.
- The business should onboard at least two independent authorised personnel (requester and checker) before using approvals in actual operations.

## Wider release verification

- Post-migration isolated `variety_foundation_test` database passed **61/61** cross-module tests covering checkout, reservations, till controls, invited cashier, dispatch concurrency, rider handover, depletion rollback and exact OpenAPI route contracts.
- Signed-in canonical HTTPS mobile Chrome recheck passed the admin role, empty authoritative adjustment queue, 32 unchanged original lots and corrected `varietygroceries.com` branding.
