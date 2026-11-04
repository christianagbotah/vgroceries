# Wave L3 Advanced Customer Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a customer-safe, route-aware tracking journey to the existing secure `PublicOrder` projection and render it consistently across storefront order screens.

**Architecture:** Orders remains the public ownership/tracking authority. A read-only Logistics projection service converts the pinned workflow version + committed Shipment events into a strict customer tracking object; `OrderProjectionService` composes it into `PublicOrder`. No new public route, database table, movement authority, notification channel, GPS or ETA is introduced.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod shared contracts, Next.js/React/Tailwind, Node test runner, Bun regression scripts.

**Spec:** `docs/superpowers/specs/2026-11-02-wave-l3-customer-tracking-design.md`

## Global Constraints
- Preserve reference+verification-code guest security and authenticated ownership exactly.
- Never expose node/lane/route/workflow/revision/custody/actor/request/raw-metadata identifiers.
- Facility labels require `LogisticsNode.customerVisible=true` and use only `publicName`.
- No GPS, live ETA, notifications, COD/remittance or Returns/restock authority.
- Legacy no-Shipment orders must still render.
- Existing `PublicOrder.events` stays backward compatible.

## Review Focus
- Hidden/transit nodes must not leak facility identity.
- Workflow planned stages must never look completed or imply ETA.
- Repeated/exception Shipment events must retain truthful chronological ordering.
- Owner status and verified guest tracking must return the same journey.
- Return-to-dispatch must show recovery without implying inventory restock.

---

### Task 1: Strict customer tracking contracts

**Files:**
- Modify: `packages/contracts/src/checkout.ts`
- Modify: `packages/contracts/src/validation.ts`
- Test: `apps/api/test/customer-tracking-contracts.spec.ts`

**Interfaces:**
- Produces: `CustomerTrackingState`, `CustomerTrackingMilestone`, `CustomerTrackingJourney`, and optional `PublicOrder.trackingJourney`.

- [ ] Write failing tests pinning the allowed state/status/kind vocabularies, strict object shape, bounds, optional location/detail, and rejection of operational/financial fields.
- [ ] Run the focused contract test and verify RED because the schemas/types do not exist.
- [ ] Add the minimum types/Zod schemas and export them through the package’s existing export path.
- [ ] Rebuild contracts and rerun focused tests to GREEN.
- [ ] Commit: `feat(tracking): define customer journey contracts`.

### Task 2: Read-only Shipment customer projection

**Files:**
- Create: `apps/api/src/logistics/shipment-customer-tracking.service.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Test: `apps/api/test/customer-tracking-projection.spec.ts`

**Interfaces:**
- Consumes: `project(orderId: string): Promise<CustomerTrackingJourney | null>`.
- Produces: a strict customer-safe Shipment journey or `null` for no Shipment.

- [ ] Write RED tests for direct, multi-hop, in-transit, final-mile, delivered, return-to-dispatch, pickup, hidden-node, custom-title, and planned-workflow-stage cases.
- [ ] Assert tests cannot see IDs/codes/revisions/custody/actors/request IDs/safeMetadata and cannot show hidden node names.
- [ ] Implement `ShipmentCustomerTrackingService.project(orderId)` using sequence-1 Shipment, pinned workflow stages, FulfilmentRun timestamps and append-only Shipment events.
- [ ] Derive only public state/headline/location and ordered complete/current/planned milestones; never calculate ETA.
- [ ] Rerun focused tests to GREEN and commit: `feat(tracking): project customer-safe shipment journey`.

### Task 3: Compose journey into secure PublicOrder

**Files:**
- Modify: `apps/api/src/orders/order-projection.service.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Test: `apps/api/test/order-query.spec.ts` or focused new `apps/api/test/customer-tracking-order-projection.spec.ts`

**Interfaces:**
- Consumes: `ShipmentCustomerTrackingService.project(orderId)`.
- Produces: `PublicOrder.trackingJourney` for both owner status and verified guest tracking.

- [ ] Write RED tests proving owner/guest parity, legacy fallback, guessed-order secrecy, and unchanged tracking throttling.
- [ ] Compose Shipment journey when present; otherwise derive a bounded legacy journey from existing customer-safe OrderEvents.
- [ ] Keep existing `events` unchanged and never copy admin Shipment data into `PublicOrder`.
- [ ] Rerun focused ownership/security/projection tests to GREEN.
- [ ] Commit: `feat(tracking): enrich public order projection`.

### Task 4: Publish the enriched existing API contract

**Files:**
- Modify: `apps/api/src/http/production-openapi.ts` only if schema override is required
- Modify generated: `docs/openapi-foundation.json`
- Test: `apps/api/test/commerce-authority.spec.ts`
- Test: `apps/api/test/foundation.spec.ts`

**Interfaces:**
- No new route; existing `/api/v1/orders/{orderId}` and `/api/v1/orders/track` return the enriched `PublicOrder`.

- [ ] Write RED assertions that the production schema contains `trackingJourney` while path count remains unchanged and forbidden operational fields are absent from public order schemas.
- [ ] Wire the shared schema into OpenAPI using existing production builder conventions.
- [ ] Regenerate OpenAPI twice and assert byte-identical output / unchanged route count.
- [ ] Commit: `feat(api): publish customer tracking journey`.

### Task 5: Shared storefront journey component

**Files:**
- Create: `src/components/orders/order-tracking-journey.tsx`
- Modify: `src/app/(storefront)/track/page.tsx`
- Modify: `src/app/(storefront)/checkout/status/[id]/page.tsx`
- Modify: `src/app/(storefront)/account/orders/[id]/page.tsx`
- Test: `scripts/customer-tracking-regressions.test.ts`

**Interfaces:**
- Consumes: `{ order: PublicOrder; compact?: boolean }`.

- [ ] Write RED Bun/source regression tests requiring one shared component, customer headline/location, planned-vs-complete styling, and legacy `events` fallback.
- [ ] Implement the accessible timeline/stepper with text-only customer copy and no map/GPS/ETA language.
- [ ] Replace duplicated raw-event lists on all three screens with the shared component.
- [ ] Add a manual Refresh control; `/track` auto-refreshes loaded non-terminal orders on a bounded interval using the same secure lookup mode that loaded them.
- [ ] Rerun focused Bun tests, lint and typecheck to GREEN.
- [ ] Commit: `feat(storefront): show advanced order journey`.

### Task 6: Keep mock/contracts acceptance fixtures truthful

**Files:**
- Modify mock data/routes under existing `src/app/api/mock/v1/**` only as needed
- Modify: `scripts/contracts-check.ts`
- Modify: `scripts/acceptance-checks.sh` only if an L3 assertion belongs there
- Test: `bun scripts/contracts-check.ts <local-mock-base>` and `bun scripts/customer-tracking-regressions.test.ts`

**Interfaces:**
- Mock `PublicOrder` conforms to the same optional `trackingJourney` schema as production.

- [ ] Write RED contract/acceptance assertions for one shipment journey and one legacy order fallback.
- [ ] Update existing mock projection without inventing admin IDs or ETA/GPS fields.
- [ ] Run contracts + acceptance + route sweep to GREEN.
- [ ] Commit: `test(tracking): cover storefront journey contracts`.

### Task 7: Whole-branch verification, docs and integration

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/KNOWN_ISSUES.md`
- Modify: `docs/VERIFICATION.md`
- Modify generated: `docs/openapi-foundation.json` if not already committed

**Interfaces:** none beyond the finished branch.

- [ ] Recreate isolated PostgreSQL test DB and apply all migrations from empty state.
- [ ] Run complete API integration/security suite; require 0 failures.
- [ ] Run root ESLint, TypeScript no-emit, Next production build, handoff regressions, Bun tests, contracts, acceptance and route sweep.
- [ ] Regenerate OpenAPI twice and require byte-identical output and unchanged path count.
- [ ] Run `git diff --check`, credential/authority review, and whole-branch code review; fix every Important/Critical finding with focused RED→GREEN tests.
- [ ] Document L3 as customer projection only; notifications/GPS/ETA/COD/Returns remain closed.
- [ ] Push PR, require both GitHub `CI` and `API foundation` green, merge exact verified head, then fast-forward canonical `main` without enabling any production rollout flag.
