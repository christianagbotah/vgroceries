# Ghana Catalogue Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a truthful admin catalogue-coverage workflow for Ghana meal ingredients with safe product-draft prefill.

**Architecture:** Extend the existing Ghana semantic matcher with a pure coverage projection over published catalogue products. Admin Intelligence exposes that projection through a read-only guarded endpoint, while the existing typed browser client renders a dedicated Admin AI tab and deep-links to the existing unpublished product-draft dialog.

**Tech Stack:** NestJS, TypeScript, Prisma, shared `@variety/contracts`, Next.js 16, React, Bun regression tests, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-26-ghana-catalogue-coverage-design.md`

## Global Constraints
- Never fabricate products, prices, units, stock, supplier facts or demand.
- Only published products in active categories may establish coverage.
- Wrong culinary forms never satisfy a recipe concept.
- The endpoint is admin-only and read-only.
- Deep-link prefill opens the existing draft form but never creates/publishes a product automatically.
- Preserve immutable production release/atomic-symlink deployment practice.

## Review Focus
- Correct product present but zero sellable stock must be `out_of_stock`, not `missing`.
- Wrong-form candidates such as Plantain Chips must be visible but must not satisfy raw plantain coverage.
- A missing concept with no candidate must remain `missing` and must not acquire fabricated product facts.
- Multiple meals using one concept must be deduplicated and counted correctly.
- Product prefill must not set category, unit, price, variant or stock fields.

---

### Task 1: Pure Ghana catalogue coverage projection

**Files:**
- Modify: `apps/api/src/ai/ghana-catalogue-match.ts`
- Test: `apps/api/test/ghana-meal-assistant-unit.spec.ts`

**Interfaces:**
- Consumes: `CatalogProduct[]`, `GHANA_MEAL_TEMPLATES`, `foodConceptById()`.
- Produces: `ghanaMealCatalogueCoverage(products)` returning deterministic rows with `status`, `matchingProducts`, `wrongFormProducts`, `mealIds`, `mealLabels`, and `mealCount`.

- [ ] Write failing tests covering available, out-of-stock, wrong-form-only, missing and multi-meal priority/count.
- [ ] Run the focused unit test and confirm the new assertions fail because coverage projection does not exist.
- [ ] Implement the minimal pure projection and lexical candidate helper.
- [ ] Run focused tests and confirm all pass.
- [ ] Commit the pure coverage projection.

### Task 2: Admin API contract and guarded endpoint

**Files:**
- Modify: `packages/contracts/src/ai.ts`
- Modify: `packages/contracts/src/endpoints.ts`
- Modify: `apps/api/src/catalog/catalog.service.ts`
- Modify: `apps/api/src/admin-intelligence/admin-intelligence.service.ts`
- Modify: `apps/api/src/admin-intelligence/admin-intelligence.controller.ts`
- Modify: `apps/api/src/http/openapi.ts`
- Modify: `apps/api/test/admin-intelligence-unit.spec.ts`
- Modify: `apps/api/test/admin-intelligence.spec.ts`
- Modify exact-path tests as required by the new production route.

**Interfaces:**
- Produces: `GhanaCatalogueCoverageRow`, `GhanaCatalogueCoverageResponse`, and operation `admin.ai.ghana-catalogue-coverage`.
- `CatalogService.publishedForAnalysis()` returns published active-category products whether or not currently sellable.
- `AdminIntelligenceService.ghanaCatalogueCoverage()` returns `{rows, summary}`.

- [ ] Write failing service and integration tests for all-state coverage, admin auth and OpenAPI exposure.
- [ ] Run focused tests and confirm RED for the missing service/route.
- [ ] Add shared contracts and endpoint registry entry.
- [ ] Add `CatalogService.publishedForAnalysis()` using existing authoritative product mapping.
- [ ] Add Admin Intelligence service/controller route and OpenAPI schema/description.
- [ ] Update exact OpenAPI path assertions from 93 to 94 and add the new path.
- [ ] Run focused API tests and confirm GREEN.
- [ ] Commit the API surface.

### Task 3: Admin AI coverage UI and safe product prefill

**Files:**
- Modify: `src/services/client.ts`
- Modify: `src/services/operation-registry.ts`
- Modify: `src/services/mock/router.ts`
- Modify: `src/app/admin/ai/page.tsx`
- Modify: `src/app/admin/products/page.tsx`
- Create: `scripts/ghana-catalogue-coverage-regressions.test.ts`

**Interfaces:**
- Consumes: `apiOps.aiGhanaCatalogueCoverage()`.
- Product link format: `/admin/products?newProduct=1&name=<label>&source=ghana-ai`.
- Product page prefill affects only name and derived slug; it leaves category/descriptions/variant/price/stock untouched.

- [ ] Write failing frontend regression tests asserting client operation, coverage tab/status copy, sourcing link and safe product prefill behavior.
- [ ] Run the new regression file and confirm RED.
- [ ] Add typed client/cache operation and UAT mock response.
- [ ] Render the coverage tab with summary/status/evidence and permission-aware Add Product action.
- [ ] Read query params on the product page, open Add Product once, prefill only name/slug, and preserve normal manual form behavior.
- [ ] Run the new regression test and the full frontend regression suite.
- [ ] Commit the UI workflow.

### Task 4: Whole-branch verification and release

**Files:**
- No feature code unless review finds a defect.

**Interfaces:**
- Consumes all prior tasks.
- Produces a clean pushed branch and immutable production API/portal releases after green CI.

- [ ] Run API build + focused tests, root lint, full frontend regressions, `git diff --check`, and secret scan.
- [ ] Push the branch and run/verify GitHub Actions against the exact HEAD.
- [ ] Require full API suite green and deterministic 94-path OpenAPI.
- [ ] Build immutable API and portal candidates, smoke them on isolated ports, then atomically cut over with rollback targets retained.
- [ ] Verify public pages, health/readiness, admin auth, coverage endpoint behavior, product prefill UI source markers and no recent fatal service logs.
