# Ghana Meal Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three Ghana meal templates and expose missing required recipe ingredients as live Admin AI catalogue-gap suggestions.

**Architecture:** Extend the existing deterministic Ghana lexicon/templates. Add pure catalogue coverage matching in the current matching helper, then consume it from AdminIntelligenceService after loading the live purchasable catalogue through CatalogService. Reuse the existing `operations_explanation` suggestion kind and audit workflow.

**Tech Stack:** TypeScript, NestJS 11, Next.js 16, Node 24, node:test.

**Spec:** `docs/superpowers/specs/2026-10-26-ghana-meal-coverage-design.md`

## Global Constraints
- No schema migration.
- No fabricated products, prices, stock or operational actions.
- All commerce authority remains server-side.
- Wrong culinary forms are unresolved rather than substituted.
- Admin suggestions are human-reviewable only.

## Review Focus
- Dish alias collisions must not cause `jollof`, `waakye`, or `red-red` to match the wrong template.
- Catalogue coverage must distinguish a genuine ingredient product from a transformed wrong form.
- Out-of-stock/unavailable published products count as not currently purchasable for assistant coverage.
- Existing suggestion review/dismiss state must remain stable for catalogue-gap suggestions.
- The admin page must not describe live authority data as demo data.

---

### Task 1: Expand deterministic Ghana meal coverage

**Files:**
- Modify: `apps/api/src/ai/ghana-food-lexicon.ts`
- Modify: `apps/api/src/ai/ghana-meal-templates.ts`
- Modify/Test: `apps/api/test/ghana-meal-assistant-unit.spec.ts`

**Interfaces:**
- Produces new concept IDs: `rice`, `beans`, `gari`, `tomato_paste`, `vegetable_oil`, `chicken`.
- Produces template IDs: `ghana_jollof`, `waakye`, `red_red`.

- [ ] Write failing tests proving each new dish ID is recognized and only catalogue-backed lines are returned.
- [ ] Run focused tests and confirm RED because the templates do not exist.
- [ ] Add only the concepts and templates required by those tests.
- [ ] Run focused tests and confirm GREEN.

### Task 2: Generate live Ghana catalogue-gap suggestions

**Files:**
- Modify: `apps/api/src/ai/ghana-catalogue-match.ts`
- Modify: `apps/api/src/admin-intelligence/admin-intelligence.service.ts`
- Modify: `apps/api/src/admin-intelligence/admin-intelligence.controller.ts`
- Modify/Test: `apps/api/test/ghana-meal-assistant-unit.spec.ts`
- Modify/Test: `apps/api/test/admin-intelligence.spec.ts`
- Modify: `src/app/admin/ai/page.tsx`

**Interfaces:**
- Consumes the template/concept IDs from Task 1.
- Produces stable `operations_explanation` suggestions keyed by missing concept ID.

- [ ] Write a failing pure coverage test: available rice/beans must not be gaps, absent yam/pepper must be gaps, wrong-form products must not satisfy coverage.
- [ ] Run focused test and confirm RED.
- [ ] Add pure coverage matching helpers.
- [ ] Add CatalogModule import/CatalogService injection and append catalogue-gap suggestions from the complete live purchasable catalogue.
- [ ] Add integration assertions that gaps are present and reviewable, then verify in CI with disposable PostgreSQL.
- [ ] Remove stale “demo events” admin copy and describe live authority data accurately.
- [ ] Run focused tests, build, lint, frontend regressions, full API CI and production smoke before deployment.
