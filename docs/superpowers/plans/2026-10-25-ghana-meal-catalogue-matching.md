# Ghana Meal Catalogue Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent semantically wrong Ghana meal ingredient substitutions while retaining truthful live-catalogue resolution.

**Architecture:** Add concept-level product-form constraints and pure helpers for candidate acceptance and explicit count-pack conversion. `GhanaMealAssistantService` remains the orchestrator and still obtains all commerce facts from `CatalogService`.

**Tech Stack:** TypeScript, NestJS, Node test runner, Prisma-backed integration tests.

**Spec:** `docs/superpowers/specs/2026-10-25-ghana-meal-catalogue-matching-design.md`

## Global Constraints
- Catalogue, stock, price, product IDs, and availability remain server-authoritative.
- Missing ingredients are unresolved; never manufacture substitute catalogue truth.
- No production catalogue mutation is part of this change.

## Review Focus
- Raw plantain must beat/reject plantain chips.
- Fresh tomato must beat/reject tomato paste.
- Groundnut paste must not resolve to roasted groundnuts.
- Salted fish must not resolve to ordinary frozen tilapia merely because both are fish.
- Explicit ingredient counts inside a pack unitSize must not multiply packs unnecessarily.

---

### Task 1: Add regression tests for culinary-form matching

**Files:**
- Create: `apps/api/test/ghana-catalogue-match.spec.ts`
- Modify: `apps/api/test/ghana-meal-assistant.spec.ts`

**Interfaces:**
- Consumes: current Ghana meal concepts and catalogue product/variant contracts.
- Produces: behavior tests that reject wrong transformed forms and preserve correct raw matches.

- [ ] Write failing pure matching tests for plantain chips, tomato paste, roasted groundnuts, frozen tilapia, and valid raw counterparts.
- [ ] Write a failing quantity test showing a 30-egg pack satisfies a four-egg estimate with one sellable pack.
- [ ] Build/run the focused tests and confirm the failures describe the missing hardening.

### Task 2: Implement concept-form constraints and quantity helper

**Files:**
- Modify: `apps/api/src/ai/ghana-food-lexicon.ts`
- Create: `apps/api/src/ai/ghana-catalogue-match.ts`
- Modify: `apps/api/src/ai/ghana-meal-assistant.service.ts`

**Interfaces:**
- Consumes: `GhanaFoodConcept`, `CatalogProduct`, `CatalogVariant`.
- Produces: `productMatchesFoodConceptForm(...)` and quantity calculation used by the service.

- [ ] Add only the concept constraints needed by failing tests.
- [ ] Implement the minimal pure acceptance helper and count-pack conversion.
- [ ] Filter candidates before ranking and delegate quantity calculation to the helper.
- [ ] Run focused tests to green.

### Task 3: Verify, commit, CI, and immutable production rollout

**Files:**
- Modify only generated artifacts if project commands require them.

**Interfaces:**
- Consumes: green branch state.
- Produces: verified commit and rollback-safe production release.

- [ ] Run TypeScript build, focused tests, lint, diff checks, and frontend/root tests relevant to the branch.
- [ ] Commit and push the branch.
- [ ] Confirm GitHub CI succeeds against its disposable PostgreSQL service.
- [ ] Package immutable API/portal releases without omitting `packages/contracts/node_modules`.
- [ ] Smoke the candidate API on a free port using production read-only meal-plan requests.
- [ ] Atomically switch symlinks, restart services, and verify live/ready, meal-plan behavior, portal pages, and rollback targets.
