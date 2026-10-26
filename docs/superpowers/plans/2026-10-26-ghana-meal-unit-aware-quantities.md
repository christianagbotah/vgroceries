# Ghana Meal Unit-Aware Quantities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development.

**Goal:** Convert Ghana recipe quantity intent into safe sellable variant quantities instead of equating recipe numbers with store units.

**Architecture:** Extend meal ingredient templates with an optional quantity unit. Centralize unit parsing/conversion in `ghana-catalogue-match.ts`, then annotate existing meal templates with conservative shopping amounts. The assistant service continues to choose only live available variants and prices.

**Tech Stack:** TypeScript, NestJS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-26-ghana-meal-unit-aware-quantities-design.md`

## Global Constraints
- Live catalogue remains authoritative for products, variants, prices and availability.
- No database/schema changes.
- Legacy ingredients without explicit quantity intent retain current behavior.
- Packaged variants are never fractional.
- Fractional kg/litre quantities round upward to quarter-unit increments.

## Review Focus
- Four tomatoes sold per kg must not become four kg.
- A 400 g tomato-paste tin must remain one tin for a 400 g requirement and two tins for 800 g.
- A 5 kg rice bag must remain one whole bag for 1–2 kg recipe intent.
- Four eggs in a 30-egg pack must remain one pack.
- Legacy/sellable ingredients must preserve current behavior.

### Task 1: Unit conversion engine and recipe intent
**Files:**
- Modify: `apps/api/src/ai/ghana-meal-templates.ts`
- Modify: `apps/api/src/ai/ghana-catalogue-match.ts`
- Modify: `apps/api/src/ai/ghana-meal-assistant.service.ts`
- Test: `apps/api/test/ghana-meal-assistant-unit.spec.ts`

**Interfaces:**
- Produces: `GhanaMealQuantityUnit` and `quantityUnit?: GhanaMealQuantityUnit` on recipe ingredients.
- Produces: `ingredientSellableQuantity(...)` conversion supporting weight/liquid/count intent plus legacy fallback.

- [ ] Write failing tests for per-kg produce, packaged tomato paste/rice, egg packs, and serving scaling.
- [ ] Run focused tests and confirm RED from old quantity behavior.
- [ ] Implement quantity intent parsing/conversion.
- [ ] Annotate current Ghana meal templates with conservative unit-aware shopping amounts.
- [ ] Run focused tests and confirm GREEN.
- [ ] Run API build, full lint, frontend regressions and `git diff --check`.
- [ ] Commit and push.
- [ ] Run full PostgreSQL-backed API CI; deploy immutably only if green.
