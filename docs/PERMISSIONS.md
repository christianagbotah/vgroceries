# Roles & action permissions

Role-aware menus and action gating in this prototype are **UX only**. The production backend must
enforce access on every protected operation and resource. A demo-account role selector is enabled
only in demo mode and must be excluded or disabled in production; no real shared credentials exist.

## Demo identities (fictional)

| Role | Person | Where |
|---|---|---|
| owner_admin | Ama Boateng | back office — full access |
| operations_manager | Kojo Asante | orders, fulfilment, dispatch, returns, catalogue |
| inventory_officer | Nana Yaa Osei | stock, receiving, adjustments, stocktakes |
| cashier | Adjoa Yeboah | POS, cashier sessions |
| picker_packer | Kweku Fosu | picking/packing queues |
| dispatcher | Dela Agbeko | dispatch, riders |
| finance_reviewer | Serwaa Owusu | refunds, payments, reports, audit |
| rider | Kwabena / Yaw / Abena / Kofi / Efua | rider workspace only |

The matrix below is the source of truth in code (`src/lib/perms.ts`); `/admin/team` renders it.
Riders only ever see their own assigned customers; delivery job actions are FORBIDDEN unless the
job belongs to the acting rider.

## Permission matrix

| Permission | Owner/Admin | Ops Manager | Inventory Officer | Cashier | Picker/Packer | Dispatcher | Finance Reviewer |
|---|---|---|---|---|---|---|---|
| orders.view | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |
| orders.confirm | ✓ | ✓ | — | — | — | — | — |
| orders.fulfil (pick/pack) | ✓ | ✓ | — | — | ✓ | — | — |
| orders.cancel | ✓ | ✓ | — | — | — | — | — |
| orders.substitute | ✓ | ✓ | — | — | ✓ | — | — |
| pos.use | ✓ | ✓ | — | ✓ | — | — | — |
| pos.discount | ✓ | ✓ | — | — | — | — | — |
| cash.session.manage | ✓ | ✓ | — | ✓ | — | — | — |
| cash.reconcile | ✓ | ✓ | — | — | — | — | ✓ |
| catalog.view | ✓ | ✓ | ✓ | — | — | — | — |
| catalog.edit (prices, publication) | ✓ | ✓ | — | — | — | — | — |
| inventory.view | ✓ | ✓ | ✓ | — | ✓ | — | — |
| inventory.adjust | ✓ | — | ✓ | — | — | — | — |
| inventory.receive | ✓ | ✓ | ✓ | — | — | — | — |
| inventory.stocktake | ✓ | — | ✓ | — | — | — | — |
| purchasing.manage | ✓ | ✓ | ✓ | — | — | — | — |
| dispatch.view | ✓ | ✓ | — | — | — | ✓ | — |
| dispatch.assign | ✓ | ✓ | — | — | — | ✓ | — |
| riders.manage | ✓ | ✓ | — | — | — | ✓ | — |
| returns.view | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| returns.decide | ✓ | ✓ | ✓ | — | — | — | — |
| refunds.view | ✓ | ✓ | — | — | — | — | ✓ |
| refunds.approve | ✓ | — | — | — | — | — | ✓ |
| customers.view | ✓ | ✓ | — | ✓ | — | ✓ | — |
| customers.contact | ✓ | ✓ | — | — | — | — | — |
| payments.view | ✓ | ✓ | — | — | — | — | ✓ |
| payments.reconcile | ✓ | — | — | — | — | — | ✓ |
| reports.view | ✓ | ✓ | ✓ | — | — | — | ✓ |
| ai.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| team.manage | ✓ | — | — | — | — | — | — |
| audit.view | ✓ | — | — | — | — | — | ✓ |
| settings.manage | ✓ | — | — | — | — | — | — |
| demo.controls | ✓ | ✓ | ✓ | ✓ | — | — | — |

## Notable gates in the UI

- Price changes and publication: Owner/Ops only; audited with before/after.
- POS discounts: Owner/Ops only (cashiers see no discount field).
- Refund approval/execution: Owner/Finance only.
- Cash reconciliation at close: Owner/Ops/Finance.
- Adjustments approval: any role with `inventory.receive` can approve pending adjustments in the UI
  (documented simplification); production must use `inventory.adjust`-scoped approval.
- Customer contact actions: Owner/Ops only; channels are placeholders pending owner configuration
  and consent rules.
- Rider menus contain only their jobs; staff menus hide sections the role cannot access.
