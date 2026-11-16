# Variety Groceries — POS/canonical source parity snapshot

Generated UTC: 2026-11-16T00:14:23+00:00

**Read-only inventory; NOT release approval.** Preserve live POS staging upstreams 3049/3052.

- Canonical: `/root/vg-pos-parity-20261116`, commit `9503fa377dfaff0892eecea6c9dadc28bf63792a`, uncommitted paths: `2`
- POS staging: `/home/lightworld/workspaces/vgroceries-pos-integrated-20261110`, commit `dc198b0057e4ea49e4f7a9143eaf21ad56d05b11`, uncommitted paths: `24`

| Scope | Canonical files | POS files | Canonical only | POS only | Different shared | Identical shared |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| frontend pages | 75 | 82 | 2 | 9 | 18 | 55 |
| api controllers | 46 | 47 | 2 | 3 | 10 | 34 |
| shared contracts | 38 | 33 | 5 | 0 | 6 | 27 |

## Allowlisted path differences only

### Frontend Pages

**Only POS (9):**
- `src/app/(storefront)/support/page.tsx`
- `src/app/admin/inventory/lots/page.tsx`
- `src/app/admin/pos/till-operations/page.tsx`
- `src/app/admin/pos/verified-uat/page.tsx`
- `src/app/admin/support/page.tsx`
- `src/app/staff/cashier/page.tsx`
- `src/app/staff/demo/[role]/page.tsx`
- `src/app/staff/pos/page.tsx`
- `src/app/uat/page.tsx`

**Only canonical (2):**
- `src/app/admin/team/verified/page.tsx`
- `src/app/staff/cashier/workspace/page.tsx`

**Different content in both (18):**
- `src/app/(storefront)/account/lists/page.tsx`
- `src/app/(storefront)/account/login/page.tsx`
- `src/app/(storefront)/assistant/page.tsx`
- `src/app/(storefront)/cart/page.tsx`
- `src/app/(storefront)/checkout/page.tsx`
- `src/app/(storefront)/help/page.tsx`
- `src/app/(storefront)/track/page.tsx`
- `src/app/admin/cashier-sessions/page.tsx`
- `src/app/admin/inventory/adjustments/page.tsx`
- `src/app/admin/inventory/expiry/page.tsx`
- `src/app/admin/inventory/page.tsx`
- `src/app/admin/inventory/receiving/page.tsx`
- `src/app/admin/pos/page.tsx`
- `src/app/admin/team/page.tsx`
- `src/app/forgot-password/page.tsx`
- `src/app/reset-password/page.tsx`
- `src/app/staff/activate/page.tsx`
- `src/app/staff/login/page.tsx`

### Api Controllers

**Only POS (3):**
- `apps/api/src/cashier-tills/pos-customers.controller.ts`
- `apps/api/src/shopping-ai/shopping-ai.controller.ts`
- `apps/api/src/support/support.controller.ts`

**Only canonical (2):**
- `apps/api/src/cashier-tills/cashier-workspace.controller.ts`
- `apps/api/src/logistics/pickup-attendance.controller.ts`

**Different content in both (10):**
- `apps/api/src/cashier-tills/cashier-tills.controller.ts`
- `apps/api/src/cashier-tills/pos-cash-sales.controller.ts`
- `apps/api/src/cashier-tills/pos-holds.controller.ts`
- `apps/api/src/cashier-tills/pos-quote.controller.ts`
- `apps/api/src/catalog-admin/catalog-admin-read.controller.ts`
- `apps/api/src/catalog/catalog.controller.ts`
- `apps/api/src/identity/identity.controller.ts`
- `apps/api/src/inventory/inventory.controller.ts`
- `apps/api/src/staff-management/cashier-invitations.controller.ts`
- `apps/api/src/staff-management/staff-management.controller.ts`

### Shared Contracts

**Only POS (0):**
- None

**Only canonical (5):**
- `packages/contracts/src/cashier-workspace.ts`
- `packages/contracts/src/inventory-adjustments.ts`
- `packages/contracts/src/password-recovery.ts`
- `packages/contracts/src/pickup-attendance.ts`
- `packages/contracts/src/staff-management.ts`

**Different content in both (6):**
- `packages/contracts/src/checkout.ts`
- `packages/contracts/src/endpoints.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/inventory.ts`
- `packages/contracts/src/pos-cash-sales.ts`
- `packages/contracts/src/validation.ts`

## Mandatory human review

NO-GO without a separate full route/service/DB/schema/UAT/restore parity review. Compare POS-only features, role and payment guards, reconcile pending local edits, and retain an isolated tested rollback.

Limitation: File-level inventory only. Page/controller counts are not route equivalence. Hashes cannot prove auth, stock, payments, database or runtime parity.


## Reconciliation order (review-required; no automatic code copying)

1. **P0 — Preserve public POS staging:** freeze the exact deployed 3049/3052 artifact SHAs and take a protected snapshot of the POS worktree, including its 24 currently uncommitted paths; the report deliberately does not print sensitive filenames or file contents.
2. **P0 — Role/session and stock security:** reconcile canonical-only cashier workspace, pickup attendance and verified staff/team screens against POS-only cashier and till routes. Assert least-privilege branch scope and the shared reservation/stock service on both sides.
3. **P0 — Checkout and inventory:** review the 18 modified shared frontend pages, 10 changed API controllers and 6 changed shared contracts. Prioritize checkout, POS quotes/holds/cash sale, stock adjustments and receiving. Run isolated transaction and UTC-expiry tests before merging.
4. **P1 — POS-only product-facing features:** assess customer support, stock lots, shopping AI, staff POS and cashier administration one feature at a time; add only supported API contracts and role tests, not direct mass cherry-picks.
5. **Cutover:** maintain Coming Soon and both live staging services. Require reviewed backend/frontend parity, a restored database rehearsal, controlled feature flags and an explicit operator go/no-go decision before any service restart or domain launch.

**Snapshot interpretation:** the canonical report was generated while the new audit script/tests were still untracked, so its canonical uncommitted-path count of 2 is not evidence of modifications to the live canonical API. POS staging's 24 modified/untracked paths predate and were not altered by this read-only scan.
