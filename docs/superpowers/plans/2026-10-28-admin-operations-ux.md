# Admin Operations UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve category, receiving, stocktake, supplier, purchase-order and reports workflows in the Variety Groceries admin portal.

**Architecture:** Keep page UX inside the existing Next.js admin routes and route all data changes through `apiOps`. Add only the missing UAT-demo mutation operations and extend the existing report query with an optional date range so filters represent real recomputed data.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, shadcn-style UI primitives, Bun tests, existing mock service router.

**Spec:** `docs/superpowers/specs/2026-10-28-admin-operations-ux-design.md`

## Global Constraints
- Preserve existing role checks and demo-session isolation.
- Responsive layouts must remain usable on phones.
- Supplier and PO controls must perform real demo mutations, not cosmetic state changes.
- Date filters must recompute report aggregates from underlying demo records.

## Review Focus
- Supplier inactive state remains visible/filterable and can be reactivated.
- Purchase orders that are no longer drafts cannot have ordered lines silently rewritten.
- Date ranges include the selected boundary dates and reject reversed ranges safely.
- Empty filter results show an intentional empty state rather than a broken page.
- Wide stocktake/receiving layouts still collapse cleanly on small screens.

---

### Task 1: Behaviour helpers and mock mutation contracts

**Files:**
- Create: `src/features/staff/admin-operations-ux.ts`
- Modify: `src/services/client.ts`
- Modify: `src/services/operation-registry.ts`
- Modify: `src/services/mock/router.ts`
- Test: `scripts/admin-operations-ux-regressions.test.ts`

- [ ] Write failing tests for supplier filtering/update, PO filtering/update, and inclusive report date ranges.
- [ ] Run the new test file and verify the failures are caused by missing behavior.
- [ ] Implement minimal helper and mock-operation changes.
- [ ] Re-run the test file until green.

### Task 2: Category, receiving and stocktake layout

**Files:**
- Modify: `src/app/admin/products/page.tsx`
- Modify: `src/app/admin/categories/page.tsx`
- Modify: `src/app/admin/inventory/receiving/page.tsx`
- Modify: `src/app/admin/inventory/stocktakes/page.tsx`

- [ ] Replace Products → Manage categories navigation with an in-context management dialog.
- [ ] Make category editing dialog-based instead of an inline panel.
- [ ] Put Item, Lot number, Quantity and Expiry date on one desktop receiving row.
- [ ] Increase stocktake counting dialog width and preserve horizontal safety on smaller screens.
- [ ] Build/typecheck to verify the layout changes compile.

### Task 3: Supplier and purchase-order controls

**Files:**
- Modify: `src/app/admin/suppliers/page.tsx`
- Modify: `src/app/admin/purchases/page.tsx`

- [ ] Add supplier search/status/activity filters, Edit dialog, and card-level active/inactive switch.
- [ ] Add PO search/status/supplier filters and an Edit dialog for editable draft fields/lines.
- [ ] Show clear filtered empty states and preserve existing send action.
- [ ] Run regression tests and build.

### Task 4: Reports filters and date range

**Files:**
- Modify: `src/app/admin/reports/page.tsx`
- Modify: `src/services/mock/engine/reports.ts`
- Modify: `src/services/mock/router.ts`
- Modify: `src/services/client.ts`

- [ ] Add from/to date inputs, quick ranges, and a report-section filter.
- [ ] Pass date range through `apiOps.reports` and recompute time-bound aggregates in the mock report engine.
- [ ] Ensure CSV exports use the currently filtered dataset.
- [ ] Run focused regression tests and full frontend build.

### Task 5: Verification and delivery

- [ ] Run the new regression test plus existing frontend/staff-demo regression suites.
- [ ] Run `bun run build` and `git diff --check`.
- [ ] Review diff for permission regressions and accidental production-backend claims.
- [ ] Commit the branch with a focused feature commit.
