# Category Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a tested category-creation workflow to the existing category-management UI, with UAT/demo parity and a real production API authority.

**Architecture:** Extend the mock catalogue boundary with `admin.categories.create`, reuse one shared creation UI, and add a dedicated NestJS category controller/service for `POST /api/v1/admin/categories`. The browser REST adapter validates the shared request contract and routes real staff sessions to the production endpoint.

**Tech Stack:** Next.js, React, TypeScript, Bun tests, NestJS, Prisma/PostgreSQL, shared zod contracts.

**Spec:** `docs/superpowers/specs/2026-10-28-category-create-design.md`

## Global Constraints
- Preserve existing category edit behavior and permissions.
- Slugs must be non-empty, URL-safe, and unique.
- Production category creation must be authenticated, explicitly authorized, audited and server-validated.
- UAT demo category creation must remain isolated from production data.

## Review Focus
- Duplicate slug must be rejected without mutation.
- Empty name/slug and invalid slugs must be rejected.
- Generated slug must stay editable before save.
- Closing/reopening the modal must not retain stale create-form data.
- Read-only catalogue users must not see the create action.
- Production endpoint must reject unauthenticated and unauthorized callers.
- Successful production creation must use next sort order and write an audit event.
- OpenAPI must publish the production POST route.

### Task 1: Demo category create operation
**Files:** `scripts/admin-operations-ux-regressions.test.ts`, `src/services/mock/router.ts`, `src/services/client.ts`, `src/services/operation-registry.ts`
- [x] Write failing create/duplicate validation tests.
- [x] Run tests and confirm RED.
- [x] Implement `admin.categories.create` in mock authority and client.
- [x] Run tests and confirm GREEN.

### Task 2: Category creation UI
**Files:** `src/features/staff/category-manager-dialog.tsx`, `src/app/admin/categories/page.tsx`
- [x] Add Add category form to shared manager.
- [x] Reuse shared manager on Categories page.
- [x] Verify permissions and form reset behavior.

### Task 3: Production API authority
**Files:** `apps/api/test/catalog-admin-category-create.spec.ts`, `packages/contracts/src/categories.ts`, `apps/api/src/catalog-admin/catalog-admin-category.controller.ts`, `apps/api/src/catalog-admin/catalog-admin-category.service.ts`, `apps/api/src/catalog-admin/catalog-admin.module.ts`, `apps/api/src/identity/permissions.ts`, web REST contract compatibility files.
- [x] Add production API regression first and observe API Foundation RED.
- [x] Add shared category request/response contract.
- [x] Add authenticated admin-only POST controller and transactional service.
- [x] Add duplicate-slug conflict handling and audit event.
- [x] Route real web sessions to the production endpoint and validate requests before transport.
- [ ] Confirm API Foundation GREEN including OpenAPI assertion.

### Task 4: Verification and delivery
- [x] Run frontend category regression test, full script suite, `tsc --noEmit`, ESLint, production build, and `git diff --check` for the UI/demo implementation.
- [ ] Confirm final-head CI and API Foundation workflows pass after the production API extension.
- [ ] Merge PR #51 only after both required workflows are green.
- [ ] Deploy/verify production API separately before claiming the real endpoint is live; the existing UAT portal UI build is already deployed.
