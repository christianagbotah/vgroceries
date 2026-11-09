# Physical Returns R2b — independent non-food resale release

**Operational status: default OFF.** This is a narrowly scoped and separately
activated inventory release for *approved factory-sealed non-food household
products*, not a general food-return or refund authorization. No production
activation is implied by deployment.

## What can be requested

A staff administrator may propose a resale review only after R1 physical
receipt, R1 final inspection into quarantine and R2a confirmed off-sale stock
custody. The candidate must also satisfy **all** of these server-owned rules:

- Original receipt condition recorded as `sealed`; item unit is **piece**,
  not loose or weighted goods.
- Current product is published, variant active, original warehouse/location
  active, and category slug is an explicitly supported non-food taxonomy:
  `non-food`, `household`, `household-essentials` or
  `cleaning-supplies`. Food, perishable groceries and opened packages have
  **no eligibility**.
- Variant ID is in **`PHYSICAL_RETURNS_RESALE_ALLOWED_VARIANTS`**, an
  operationally maintained allowlist. Empty (the default) denies all variants.
  A category or UI checkbox alone cannot bypass the allowlist.
- The original depleted stock lot has a traceable, non-null expiry date
  **at least 30 days in the future**. The separately quarantined lot retains
  exactly that expiry, source location and original cost.
- Actual factory seal, tamper/contamination absence, source traceability and
  expiry/storage history are **all explicitly affirmed**. The evidence note
  and four safety confirmations are immutable durable database fields.

A proposal is a permanent, auditable `pending` review. It makes **no**
inventory, cash, COD, customer order or refund change.

## Second, independent decision

A **different** authenticated administrator must approve or reject the
pending proposal. The reviewer cannot be the proposing user, physical
receiver, inspector or quarantine custodian, and must re-check eligibility
and remaining shelf life *at the decision time*.

A **rejection** becomes final and leaves quarantined goods untouched.
An **approval** is one transaction that:

1. Creates a single, traceable stock-transfer receipt.
2. Adds exactly the verified held quantity to a **new regular saleable lot**
   with the same original stock position, expiry and unit cost.
3. Creates the positive movement for that new lot.
4. Records the independent reviewer, final decision, source evidence and
   saleable lot in `PhysicalReturnResaleReview`.
5. Depletes the original quarantine lot to **zero**, retaining its
   `physical_return_quarantine` type and `quarantined=true` state.
6. Appends the exact opposite negative movement to the original quarantine
   lot, and writes audit, event outbox and idempotency outcome atomically.

The sum of physical stock across the stock position **does not change**;
only the quantity classified saleable changes on reviewed approval.

PostgreSQL triggers forbid direct deletion or tampering with review records,
reopening terminal approvals/rejections, changing a quarantine lot into
regular stock, releasing part of a lot without review, unbalanced physical
transfers and repeated negative quarantine movements. A deferred constraint
checks that both movements and both lots form a balanced transaction at
commit. Replay keys are actor-scoped; independent concurrent decisions
serialize on the original returned item.

## Deployment and risk boundaries

- `PHYSICAL_RETURNS_INTAKE_ENABLED=false` — R1 master off switch.
- `PHYSICAL_RETURNS_CUSTODY_ENABLED=false` — R2a off-sale custody switch.
- `PHYSICAL_RETURNS_RESALE_ENABLED=false` — R2b independent release switch;
  requires both R1 and R2a switches true.
- `PHYSICAL_RETURNS_RESALE_ALLOWED_VARIANTS=` — default-empty allowlist.
  **Without an explicitly verified non-food allowlist, no release is possible.**

Keep all three flags OFF on UAT until staff procedure, physical audit,
safety-classification authority, permissions, two separate named staff
accounts, original lot expiry controls and real operational trials are
approved. Do not assume this establishes Ghana food product resale
compliance. No food or other consumable item should be allowlisted by default.

### Explicit remaining work

- Refund entitlement, original successful capture, partial order financial
  valuation and provider settlement must remain entirely within Refund
  Authority. R2b **does not issue refunds**.
- Full customer return requests, customer-visible status and service rules.
- Per-lot allocations when an order line depleted multiple source lots.
- Quarantine destruction/shrinkage accounting, safety incident workflows,
  photo evidence and verified staff identity/permission beyond base admin.
- An administrator-facing, independently verified variant eligibility
  configuration workflow. R2b intentionally does **not** let a browser
  self-allowlist a product.

Rehearse migration `202611090031_physical_return_resale_review` on a restored
UAT copy before cutover. Verify direct SQL forgery, restricted categories,
bad expiry, same-user approvals, concurrent approval races, stable stock totals,
no payment writes, idempotency and default-off flags.
