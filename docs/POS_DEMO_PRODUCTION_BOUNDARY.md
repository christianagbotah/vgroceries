# POS browser boundary — simulation versus production

**Status:** frontend safety hardening. This does not activate any new sale,
payment, inventory or receipt capability, and makes no changes to the backend.

## Risk addressed

The legacy web POS screen calls `apiOps.posComplete`, `posHold`,
`posDrafts` and related **demo protocol** operations. These are a
different contract from the newer authenticated, server-owned POS
`/api/v1/admin/pos/tills`, `/quote`, `/holds`,
`/cash-sales` and `/reconciliation` backend.

An operator must never mistake a demo generated payment, reservation or
receipt for an actual live transaction or a stock change.

## Behavior

- When `NEXT_PUBLIC_API_BASE_URL` is configured (production REST
  transport), `/admin/pos` **does not mount the simulator** or invoke
  the demo session/cart/sale operations. It shows a clear
  **Production POS is not yet activated** message and navigation to the
  administration area.
- When `NEXT_PUBLIC_API_BASE_URL` is not set (the explicit
  `/api/mock/v1` development protocol), training still works but
  displays prominent **DEMO ONLY** notices on session opening and
  the cashier screen. Success notifications say **Demo sale** and
  explicitly disclaim real payments, stock deductions and accounting.
- Printed simulator receipts already say **Demo receipt — no real
  payment**. This stays distinct from immutable backend cash receipts.

## Live cutover requirements

Do not remove this guard simply because one or more POS backend
feature flags exist. Implement a separate production adapter,
real authenticated cashier-role grants, inventory location assignment,
open shift + shared stock hold + re-quote + cash handover flow,
confirmed external MoMo/card settlements before claiming paid,
tax-compliant receipt issuance, refunds, cash drawer approvals and
supervisor shift reconciliation.

Only after an end-to-end restored-UAT and physical cashier/printer
acceptance may the production route be intentionally switched to the
real adapter, with an explicit rollout plan and rollback procedure.
