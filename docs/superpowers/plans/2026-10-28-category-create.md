# Category Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a tested category-creation workflow to the existing category-management UI.

**Architecture:** Extend the existing mock catalogue operation boundary with `admin.categories.create`, expose it through the typed client, and reuse a single creation form inside the shared category manager. The standalone Categories page will expose the same shared manager rather than duplicating creation behavior.

**Tech Stack:** Next.js, React, TypeScript, Bun tests, existing mock service adapter.

**Spec:** `docs/superpowers/specs/2026-10-28-category-create-design.md`

## Global Constraints
- Do not invent a production REST endpoint that the API does not implement.
- Preserve existing category edit behavior and permissions.
- Slugs must be non-empty, URL-safe, and unique.

## Review Focus
- Duplicate slug must be rejected without mutating the store.
- Empty name/slug must be rejected.
- Generated slug must stay editable before save.
- Closing/reopening the modal must not retain stale create-form data.
- Read-only catalogue users must not see the create action.

### Task 1: Category create operation
**Files:** `scripts/admin-operations-ux-regressions.test.ts`, `src/services/mock/router.ts`, `src/services/client.ts`, `src/services/operation-registry.ts`
- [ ] Write failing create/duplicate validation tests.
- [ ] Run tests and confirm RED.
- [ ] Implement `admin.categories.create` in mock authority and client.
- [ ] Run tests and confirm GREEN.

### Task 2: Category creation UI
**Files:** `src/features/staff/category-manager-dialog.tsx`, `src/app/admin/categories/page.tsx`
- [ ] Add Add category form to shared manager.
- [ ] Reuse shared manager on Categories page.
- [ ] Verify permissions and form reset behavior.

### Task 3: Verification and delivery
- [ ] Run category regression test, full script suite, `tsc --noEmit`, ESLint, production build, and `git diff --check`.
- [ ] Commit, push, open PR, wait for required workflows, deploy verified UAT build, smoke test live category creation UI.
