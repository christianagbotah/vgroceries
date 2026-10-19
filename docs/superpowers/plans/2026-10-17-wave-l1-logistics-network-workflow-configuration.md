# Wave L1 Logistics Network & Workflow Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production configuration authority for business logistics nodes, lanes, immutable delivery-workflow versions, deterministic route rules and route simulation without changing customer shipment execution yet.

**Architecture:** Add a dedicated NestJS `LogisticsModule` backed by normalized PostgreSQL configuration tables and shared Zod contracts. Administrators configure a network and versioned workflows, then create inactive route rules and explicitly activate only rules that pass deterministic path/workflow validation; a pure route resolver/simulator proves what future checkout will select. The Next.js back office consumes the same contracts through the existing service adapter and exposes one `Logistics & Delivery` workspace, while current checkout, Fulfilment, Dispatch/Rider and tracking behavior remain unchanged in this wave.

**Tech Stack:** NestJS, Prisma/PostgreSQL 17+, Zod/shared TypeScript contracts, Next.js 16/React 19, existing `Idempotency`/`AuditEvent`/`OutboxEvent` patterns, Node test runner, Bun regression suite.

**Spec:** `docs/superpowers/specs/2026-10-17-configurable-logistics-tracking-notifications-authority-design.md` — Wave L1 only.

## Global Constraints

- Wave L1 implements **configuration authority only**: no `Shipment`, `ShipmentStop`, `ShipmentLeg`, shipment movement, customer tracking cutover or notification delivery yet.
- `Regional`, `District`, `Zonal`, `Outlet` and `Pickup Point` remain configurable business concepts, not hard-coded route-state levels.
- `LogisticsNode` is separate from Inventory `Location`; `inventoryLocationId` is optional and customer parcels never become sellable stock by visiting a logistics node.
- Published workflow versions are content-immutable; editing a published workflow means creating a new draft version.
- Every stage maps to one canonical server event kind; `custom_checkpoint` is informational only and cannot establish payment, stock, COD, proof or delivery truth.
- Route selection is server-owned and deterministic. Zero matches and equal-authority matches fail closed; the browser never chooses a hidden route rule.
- Direct routes are valid as a one-stop route with zero lanes; multi-hop routes require an explicit active lane for every adjacent stop pair.
- Existing `fulfilment=collection` remains direct customer collection from the source location; a remote pickup point is configured as `fulfilment=delivery` with destination kind `pickup_point`.
- Configuration mutations are administrator-only in the production API and use the existing trusted-Origin/CSRF policy. Replay-sensitive mutations require `Idempotency-Key`.
- L1 must not mutate Orders, reservations, inventory stock, FulfilmentRun, DeliveryJob, PaymentAttempt, Refund or COD state.
- Existing production OpenAPI baseline is exactly **69 paths**. Wave L1 adds exactly **13 distinct paths**, for a final total of **82 paths**.
- No provider, Email, SMS, WhatsApp, GPS, ETA or notification capability may be claimed live in this wave.
- Customer-facing production copy must not introduce demo/prototype claims.

## Review Focus

- **Direct-route edge case:** a one-stop doorstep or source-collection rule with zero lanes must validate and simulate successfully; Task 6 pins this.
- **Ambiguous routing:** two active matching rules at the same highest priority must return an explicit ambiguous result and no selected route; Task 6 pins this.
- **Dependency-safe deactivation:** a node/lane used by an active route rule cannot be deactivated until dependent rules are deactivated; Tasks 3 and 4 pin this.
- **Published-version immutability:** API and direct SQL attempts to edit/delete published stage content must fail, while `published -> retired` lifecycle change remains allowed; Tasks 2 and 5 pin this.
- **Stale concurrent draft edit:** saving a draft with an old revision must return conflict instead of silently overwriting another editor; Task 5 pins this.

---

## File/Module Map

### Shared contracts

- Create `packages/contracts/src/logistics.ts` — canonical logistics vocabularies, request/response schemas and exported types.
- Modify `packages/contracts/src/index.ts` — export logistics contracts.
- Modify `packages/contracts/src/endpoints.ts` — add the 13 L1 production operation mappings.
- Modify `src/services/contracts/index.ts` and `src/services/contracts/endpoints.ts` — web compatibility re-exports/mappings.

### API authority

- Modify `apps/api/prisma/schema.prisma` — L1 Prisma models/relations.
- Create `apps/api/prisma/migrations/202610170009_logistics_configuration/migration.sql` — normalized tables, indexes, checks and workflow immutability triggers.
- Create `apps/api/src/logistics/logistics.values.ts` — bounded vocabularies/normalizers and safe-label validation.
- Create `apps/api/src/logistics/logistics-node.service.ts` — node queries/mutations/dependency checks.
- Create `apps/api/src/logistics/logistics-lane.service.ts` — lane queries/mutations/dependency checks.
- Create `apps/api/src/logistics/logistics-workflow.service.ts` — workflow template/draft/save/publish/retire authority.
- Create `apps/api/src/logistics/logistics-route-rule.service.ts` — route-rule CRUD, activation validation, deterministic resolution/simulation.
- Create `apps/api/src/logistics/admin-logistics-nodes.controller.ts` — node routes.
- Create `apps/api/src/logistics/admin-logistics-lanes.controller.ts` — lane routes.
- Create `apps/api/src/logistics/admin-logistics-workflows.controller.ts` — workflow routes.
- Create `apps/api/src/logistics/admin-logistics-route-rules.controller.ts` — route-rule/simulation routes.
- Create `apps/api/src/logistics/logistics.module.ts` in Task 3 and extend it through Tasks 4–6/12 — module wiring.
- Modify `apps/api/src/bootstrap.ts` — register `LogisticsModule`.
- Modify `apps/api/src/http/production-openapi.ts` and `docs/openapi-foundation.json` — publish the 82-path production contract.

### Web/admin experience

- Modify `src/services/client.ts`, `src/services/operation-registry.ts`, `src/services/adapters/*` only where the existing operation boundary requires it.
- Create `src/features/logistics/logistics-workspace.tsx` — tab shell and shared loading/error state.
- Create `src/features/logistics/nodes-panel.tsx` — nodes CRUD/dependency UX.
- Create `src/features/logistics/lanes-panel.tsx` — lanes CRUD/dependency UX.
- Create `src/features/logistics/workflows-panel.tsx` — draft builder/version history/publish preview.
- Create `src/features/logistics/route-rules-panel.tsx` — route rule editor/activation/simulation.
- Create `src/app/admin/logistics/page.tsx` — admin entry page.
- Modify `src/components/layout/admin-shell.tsx`, `src/lib/perms.ts` — `Logistics & Delivery` navigation with owner-admin UX permission.
- Modify `src/services/mock/router.ts` plus focused mock seed/state files as needed so the local/demo adapter can render the new admin workspace without pretending it is production authority.

### Verification/docs

- Add focused API tests named in tasks below.
- Add `scripts/logistics-ui-regressions.test.ts` and update contract/handoff checks.
- Create `docs/LOGISTICS_CONFIGURATION_RUNBOOK.md`.
- Update `docs/HANDOFF.md`, `docs/KNOWN_ISSUES.md`, `docs/VERIFICATION.md` only after fresh green verification.

## Production L1 route surface

These are the only new path keys in Wave L1:

1. `GET|POST /api/v1/admin/logistics/nodes`
2. `GET|POST /api/v1/admin/logistics/nodes/{nodeId}`
3. `GET|POST /api/v1/admin/logistics/lanes`
4. `GET|POST /api/v1/admin/logistics/lanes/{laneId}`
5. `GET|POST /api/v1/admin/logistics/workflows`
6. `GET /api/v1/admin/logistics/workflows/{templateId}`
7. `POST /api/v1/admin/logistics/workflows/{templateId}/drafts`
8. `POST /api/v1/admin/logistics/workflows/{templateId}/versions/{versionId}`
9. `POST /api/v1/admin/logistics/workflows/{templateId}/publish`
10. `GET|POST /api/v1/admin/logistics/route-rules`
11. `GET|POST /api/v1/admin/logistics/route-rules/{ruleId}`
12. `POST /api/v1/admin/logistics/route-rules/{ruleId}/activate`
13. `POST /api/v1/admin/logistics/route-rules/simulate`

The `simulate` route is read-only despite using POST because the input is structured route context; it requires administrator authentication but no idempotency key and creates no domain/audit mutation beyond ordinary request telemetry.

---

### Task 1: Freeze the L1 shared logistics contract

**Files:**
- Create: `packages/contracts/src/logistics.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/endpoints.ts`
- Modify: `src/services/contracts/index.ts`
- Modify: `src/services/contracts/endpoints.ts`
- Test: `apps/api/test/logistics-contracts.spec.ts`

**Interfaces:**
- Produces canonical schemas/types consumed by every later task:
  - `logisticsNodeKindSchema`
  - `logisticsLaneModeSchema`
  - `workflowEventKindSchema`
  - `workflowVersionStatusSchema`
  - `routeDestinationKindSchema`
  - `routeTerminalRoleSchema`
  - `logisticsNodeViewSchema`, `LogisticsNodeView`
  - `logisticsLaneViewSchema`, `LogisticsLaneView`
  - `deliveryWorkflowViewSchema`, `DeliveryWorkflowView`
  - `deliveryWorkflowVersionViewSchema`, `DeliveryWorkflowVersionView`
  - `workflowStageDefinitionSchema`, `WorkflowStageDefinitionView`
  - `deliveryRouteRuleViewSchema`, `DeliveryRouteRuleView`
  - `routeSimulationRequestSchema`, `RouteSimulationRequest`
  - `routeSimulationResponseSchema`, `RouteSimulationResponse`
- Canonical values are exactly:
  - node kind: `head_office | warehouse | fulfilment_center | hub | outlet | pickup_point | cross_dock | partner_facility | other`;
  - lane mode: `internal_transfer | linehaul | third_party | customer_pickup | last_mile`;
  - workflow version status: `draft | published | retired`;
  - route destination kind: `doorstep | pickup_point`;
  - terminal role: `transit | customer_pickup | final_mile_dispatch`;
  - workflow event kinds: the complete list from spec §7.3, including `custom_checkpoint`.
- Route simulation response uses `status: "matched" | "no_match" | "ambiguous"`; `selectedRule` is present only for `matched`; `candidates` contains bounded safe rule summaries for diagnostics.

- [ ] **Step 1: Write failing contract tests** named `logistics contract accepts canonical configuration`, `logistics contract rejects invented authority states`, and `route simulation contract distinguishes matched no-match ambiguous`. Assert every exact enum above, reject unknown event kinds, reject empty node code/name/public name, reject negative/zero `typicalMinutes`, require pickup destination to carry `finalPickupNodeId`, and require route-rule stop position to be a positive integer.

- [ ] **Step 2: Run the focused contract test and confirm RED**

Run:
```bash
npm run --prefix packages/contracts build && npm run --prefix apps/api build && node --test apps/api/dist/test/logistics-contracts.spec.js
```
Expected: FAIL because `packages/contracts/src/logistics.ts` and L1 endpoint mappings do not exist.

- [ ] **Step 3: Implement `packages/contracts/src/logistics.ts`** with Zod request/view schemas. Keep creation/update request bodies separate from view schemas; do not accept `createdBy`, `publishedBy`, timestamps, dependency counts or server-derived route diagnostics from the browser as authority.

- [ ] **Step 4: Add the 13 endpoint mappings** under stable operation names:
  - `admin.logistics.nodes`, `admin.logistics.node`
  - `admin.logistics.lanes`, `admin.logistics.lane`
  - `admin.logistics.workflows`, `admin.logistics.workflow`
  - `admin.logistics.workflow.draft`, `admin.logistics.workflow.save`, `admin.logistics.workflow.publish`
  - `admin.logistics.route-rules`, `admin.logistics.route-rule`, `admin.logistics.route-rule.activate`, `admin.logistics.route-rule.simulate`.

- [ ] **Step 5: Run the focused test and require PASS** using the command from Step 2.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/logistics.ts packages/contracts/src/index.ts packages/contracts/src/endpoints.ts src/services/contracts/index.ts src/services/contracts/endpoints.ts apps/api/test/logistics-contracts.spec.ts
git commit -m "feat(logistics): define network configuration contracts"
```

---

### Task 2: Add normalized L1 persistence and database integrity

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610170009_logistics_configuration/migration.sql`
- Test: `apps/api/test/logistics-schema.spec.ts`

**Interfaces:**
- Produces Prisma models: `LogisticsNode`, `LogisticsLane`, `DeliveryWorkflowTemplate`, `DeliveryWorkflowVersion`, `WorkflowStageDefinition`, `DeliveryRouteRule`, `DeliveryRouteRuleStop`, `DeliveryRouteRuleLeg`.
- Existing `Location` gains optional reverse relation to `LogisticsNode`; existing `DeliveryZone` gains route-rule reverse relation. No existing order/fulfilment/dispatch table receives behavior-changing columns in L1.

- [ ] **Step 1: Write failing schema tests** covering all DB-bypass invariants before the migration exists:
  - node cannot parent itself;
  - one Inventory `Location` cannot back two active logistics identities;
  - lane origin cannot equal destination;
  - `typicalMinutes > 0` and `priority >= 0`;
  - duplicate active `(origin,destination,mode,providerKey)` lane is refused, treating null provider consistently;
  - workflow `(templateId, versionNumber)` unique;
  - stage `(workflowVersionId, stageKey)` and `(workflowVersionId, sortOrder)` unique;
  - route stop `(ruleId, position)` unique and positive;
  - route leg `(ruleId, position)` unique and positive;
  - rule effective end cannot precede effective start;
  - rule check: `fulfilment=delivery` requires `deliveryZoneId`; `fulfilment=collection` requires no `deliveryZoneId`; `destinationKind=pickup_point` requires `finalPickupNodeId`; `destinationKind=doorstep` requires no `finalPickupNodeId`;
  - direct SQL update/delete of stage content under a `published` or `retired` workflow version is rejected;
  - version content mutation after publication is rejected, while the narrow `published -> retired` status transition is allowed.

- [ ] **Step 2: Run the schema spec and verify RED**

Run:
```bash
npm run --prefix apps/api build && node --test --test-concurrency=1 apps/api/dist/test/logistics-schema.spec.js
```
Expected: FAIL because the models/tables do not exist.

- [ ] **Step 3: Add Prisma models with these pinned field decisions**
  - `LogisticsNode`: UUID id, unique normalized `code`, internal `name`, `publicName`, canonical `kind`, optional `kindLabel`, optional self-FK `parentNodeId`, optional unique `inventoryLocationId`, `addressLine`, `locality`, `region`, `ghanaPostGps`, `publicDirections`, optional `publicContact`, `customerVisible`, `active`, timestamps.
  - `LogisticsLane`: UUID id, origin/destination node FKs, canonical `mode`, optional `providerKey`, `typicalMinutes`, `serviceDays Int[]`, optional `cutoffLocalTime` (`HH:mm` validated in service), nonnegative `priority`, `active`, timestamps.
  - `DeliveryWorkflowTemplate`: UUID id, name/description, `active`, optional `currentPublishedVersionId`, timestamps.
  - `DeliveryWorkflowVersion`: UUID id, template FK, positive `versionNumber`, `status`, optional `defaultSlaMinutes`, `revision INT DEFAULT 1`, `createdBy`, timestamps, optional publish actor/time.
  - `WorkflowStageDefinition`: UUID id, version FK, `stageKey`, `eventKind`, customer/admin templates/help, booleans from spec, optional `slaMinutes`, positive `sortOrder`, `displayGroup`, `exceptionSeverity`, `notificationsAllowed`.
  - `DeliveryRouteRule`: UUID id/name, origin node FK, optional zone FK, `fulfilment`, optional normalized `locality`, `destinationKind`, optional final pickup node FK, optional `serviceLevel`, workflow-version FK, nonnegative `priority`, optional effective bounds, `active`, optimistic `version`, actor/timestamps.
  - `DeliveryRouteRuleStop`: UUID id, rule FK, positive `position`, node FK, terminal role.
  - `DeliveryRouteRuleLeg`: UUID id, rule FK, positive `position`, origin-stop FK, destination-stop FK, lane FK.

- [ ] **Step 4: Add SQL checks/indexes/triggers that Prisma cannot express**
  - partial/coalesced uniqueness for active lanes;
  - published/retired workflow content immutability trigger covering version content and stage insert/update/delete;
  - allow only `published -> retired` lifecycle mutation after publication;
  - route-leg integrity trigger proving origin/destination stops belong to the same rule, are adjacent, and lane endpoints match their node IDs;
  - route stops/legs use `ON DELETE RESTRICT` where deleting configuration would destroy published/active history.

- [ ] **Step 5: Apply the migration to a brand-new PostgreSQL 17 test database, regenerate Prisma, and run the schema spec**. Require migration success and all schema tests PASS.

- [ ] **Step 6: Run `git diff --check` and commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/202610170009_logistics_configuration/migration.sql apps/api/test/logistics-schema.spec.ts
git commit -m "feat(logistics): add network configuration persistence"
```

---

### Task 3: Implement Logistics Node authority

**Files:**
- Create: `apps/api/src/logistics/logistics.values.ts`
- Create: `apps/api/src/logistics/logistics-node.service.ts`
- Create: `apps/api/src/logistics/admin-logistics-nodes.controller.ts`
- Create: `apps/api/src/logistics/logistics.module.ts`
- Test: `apps/api/test/logistics-nodes.spec.ts`

**Interfaces:**
- Produces `LogisticsNodeService.list(query)`, `get(nodeId)`, `create(actor, idempotencyKey, input, requestId)`, `update(actor, nodeId, idempotencyKey, input, requestId)`.
- Node detail includes dependency counts: active incoming lanes, active outgoing lanes, active route rules, child nodes, and whether the linked Inventory `Location` exists/is active.
- `logistics.values.ts` produces `normalizeNodeCode`, `normalizeMatchText`, `assertSafeCustomerLabel`, and bounded validation helpers reused by Tasks 4–6.

- [ ] **Step 1: Write failing node tests** for admin create/list/detail/update, duplicate normalized codes, missing/inactive Inventory location link, self-parent, non-admin refusal, idempotent replay, and audit/outbox evidence.

- [ ] **Step 2: Add the Review Focus deactivation test**: create an active route rule/lane dependency fixture and assert setting `active=false` returns 409 with safe dependency counts and does not alter the node.

- [ ] **Step 3: Run**
```bash
npm run --prefix apps/api build && node --test --test-concurrency=1 apps/api/dist/test/logistics-nodes.spec.js
```
Expected: RED because Node service/controller do not exist.

- [ ] **Step 4: Implement node queries/mutations**. Normalize `code` to uppercase ASCII `[A-Z0-9_-]` bounded to 64 chars. Trim names/public fields. Validate optional Inventory link exists and is active at assignment time. Never expose internal Inventory stock data through node views.

- [ ] **Step 5: Make every committed mutation atomic with** `Idempotency`, `AuditEvent`, and a configuration `OutboxEvent` (`logistics.node.created` / `logistics.node.updated`). Same actor/key/request replays the prior result; changed payload conflicts.

- [ ] **Step 6: Implement routes** `GET|POST /admin/logistics/nodes` and `GET|POST /admin/logistics/nodes/{nodeId}` using existing `AccessGuard`/admin-only patterns, Zod parsing, CSRF handling and safe error envelopes.

- [ ] **Step 7: Run the focused test and require PASS**, then `git diff --check`.

- [ ] **Step 8: Commit**
```bash
git add apps/api/src/logistics/logistics.values.ts apps/api/src/logistics/logistics-node.service.ts apps/api/src/logistics/admin-logistics-nodes.controller.ts apps/api/src/logistics/logistics.module.ts apps/api/test/logistics-nodes.spec.ts
git commit -m "feat(logistics): add node configuration authority"
```

---

### Task 4: Implement Logistics Lane authority

**Files:**
- Create: `apps/api/src/logistics/logistics-lane.service.ts`
- Create: `apps/api/src/logistics/admin-logistics-lanes.controller.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Test: `apps/api/test/logistics-lanes.spec.ts`

**Interfaces:**
- Produces `LogisticsLaneService.list(query)`, `get(laneId)`, `create(actor,key,input,requestId)`, `update(actor,laneId,key,input,requestId)`.
- Lane detail includes origin/destination safe node summaries and count of active route rules referencing the lane.

- [ ] **Step 1: Write failing tests** for create/list/detail/update, same-node refusal, inactive-node refusal for a new/activated lane, duplicate active lane tuple refusal, invalid cutoff/service-day values, admin-only authorization, idempotent replay and audit/outbox evidence.

- [ ] **Step 2: Add dependency-safe deactivation test** asserting an active lane referenced by an active route rule cannot be deactivated; the request returns 409 and leaves it active.

- [ ] **Step 3: Run the focused spec and verify RED**.

- [ ] **Step 4: Implement lane authority**. `serviceDays` accepts unique integers `1..7`; `cutoffLocalTime` is absent or exact `HH:mm`; `typicalMinutes` is `1..10080`; `priority` is nonnegative. `providerKey` is stored only as a future identifier and L1 must not claim provider connectivity.

- [ ] **Step 5: Implement routes** `GET|POST /admin/logistics/lanes` and `GET|POST /admin/logistics/lanes/{laneId}` with the same admin/idempotency/audit pattern as Task 3.

- [ ] **Step 6: Run focused node+lane tests together** to ensure dependency guards compose:
```bash
npm run --prefix apps/api build && node --test --test-concurrency=1 apps/api/dist/test/logistics-nodes.spec.js apps/api/dist/test/logistics-lanes.spec.js
```
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add apps/api/src/logistics/logistics-lane.service.ts apps/api/src/logistics/admin-logistics-lanes.controller.ts apps/api/src/logistics/logistics.module.ts apps/api/test/logistics-lanes.spec.ts
git commit -m "feat(logistics): add lane configuration authority"
```

---

### Task 5: Implement immutable Delivery Workflow authority

**Files:**
- Create: `apps/api/src/logistics/logistics-workflow.service.ts`
- Create: `apps/api/src/logistics/admin-logistics-workflows.controller.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Test: `apps/api/test/logistics-workflows.spec.ts`
- Test: `apps/api/test/logistics-workflow-concurrency.spec.ts`

**Interfaces:**
- Produces:
  - `listTemplates(): Promise<DeliveryWorkflowView[]>`
  - `getTemplate(templateId): Promise<DeliveryWorkflowView>`
  - `createTemplate(actor,key,input,requestId): Promise<DeliveryWorkflowView>` — atomically creates template + empty draft version 1.
  - `createDraft(templateId,actor,key,requestId): Promise<DeliveryWorkflowVersionView>` — clones the current published version into version `N+1`; refuses a second concurrent draft for the same template.
  - `saveDraft(templateId,versionId,actor,key,input,requestId): Promise<DeliveryWorkflowVersionView>` — replaces draft metadata/stages atomically and increments `revision`.
  - `publish(templateId,actor,key,{versionId,expectedRevision},requestId): Promise<DeliveryWorkflowView>`.
- `saveDraft` request includes exact `expectedRevision` and ordered `stages[]`; stale revision returns 409.

- [ ] **Step 1: Write failing lifecycle tests** for first template/draft creation, saving ordered stages, publishing, cloning a published version, preserving old published content, and switching `currentPublishedVersionId` only after successful publication.

- [ ] **Step 2: Write canonical-stage safety tests**. Require unique `stageKey`, unique positive `sortOrder`, allowed canonical event kind, positive optional SLA, and safe customer templates. Assert labels containing financial truth such as `Paid`, `Payment received`, `Cash remitted`, `Refunded` are rejected for every logistics event; assert `Delivered`/`Delivery complete` is allowed only for canonical `delivered`; assert `custom_checkpoint` cannot use delivery/payment-settlement wording.

- [ ] **Step 3: Write publication validation tests** requiring at least one stage, `order_placed` first, a terminal stage appropriate to the workflow (`delivered`/`customer_collected` where configured), and no duplicate protected canonical completion stage. Do not require every possible canonical event; workflows are intentionally business-configurable.

- [ ] **Step 4: Add concurrency test**: read draft revision `R`, save editor A to `R+1`, then save editor B with stale `expectedRevision=R`; assert 409 and editor A content remains unchanged.

- [ ] **Step 5: Add API + direct-DB immutability regressions** proving published/retired stage content cannot be changed or deleted and a published version cannot be reused as a draft. Publishing a newer version moves only the template `currentPublishedVersionId`; it does not rewrite, delete or automatically retire earlier published versions that route rules may still pin.

- [ ] **Step 6: Run workflow specs and confirm RED**, then implement the service/controller routes:
  - `GET|POST /admin/logistics/workflows`
  - `GET /admin/logistics/workflows/{templateId}`
  - `POST /admin/logistics/workflows/{templateId}/drafts`
  - `POST /admin/logistics/workflows/{templateId}/versions/{versionId}`
  - `POST /admin/logistics/workflows/{templateId}/publish`.

- [ ] **Step 7: Persist Audit/Outbox facts** for create/draft/save/publish/retire. The publication event contains IDs/version number only; it never serializes full free-form customer template content into the outbox unless a later consumer requires a bounded snapshot.

- [ ] **Step 8: Run**
```bash
npm run --prefix apps/api build && node --test --test-concurrency=1 apps/api/dist/test/logistics-workflows.spec.js apps/api/dist/test/logistics-workflow-concurrency.spec.js apps/api/dist/test/logistics-schema.spec.js
```
Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add apps/api/src/logistics/logistics-workflow.service.ts apps/api/src/logistics/admin-logistics-workflows.controller.ts apps/api/src/logistics/logistics.module.ts apps/api/test/logistics-workflows.spec.ts apps/api/test/logistics-workflow-concurrency.spec.ts
git commit -m "feat(logistics): add immutable delivery workflows"
```

---

### Task 6: Implement deterministic Route Rule authority and simulation

**Files:**
- Create: `apps/api/src/logistics/logistics-route-rule.service.ts`
- Create: `apps/api/src/logistics/admin-logistics-route-rules.controller.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Test: `apps/api/test/logistics-route-rules.spec.ts`
- Test: `apps/api/test/logistics-route-simulation.spec.ts`
- Test: `apps/api/test/logistics-route-rule-concurrency.spec.ts`

**Interfaces:**
- Produces:
  - `list(query): Promise<DeliveryRouteRuleView[]>`
  - `get(ruleId): Promise<DeliveryRouteRuleView>`
  - `create(actor,key,input,requestId): Promise<DeliveryRouteRuleView>` — creates inactive rule only.
  - `update(actor,ruleId,key,input,requestId): Promise<DeliveryRouteRuleView>` — updates only inactive rule configuration using optimistic `expectedVersion`.
  - `activate(actor,ruleId,key,{expectedVersion},requestId): Promise<DeliveryRouteRuleView>` — validates dependencies then activates atomically.
  - `deactivate(...)` is represented by `update(...,{active:false})` only after locking/rechecking current rule; content cannot change while active.
  - `simulate(input: RouteSimulationRequest): Promise<RouteSimulationResponse>`.
  - internal `resolve(context, at): Promise<ResolvedRoute>` for later L2 checkout integration; this method throws fail-closed errors on no-match/ambiguity instead of returning a random candidate.

- [ ] **Step 1: Write failing route-rule CRUD tests** requiring a published workflow version, active source/final nodes, normalized locality/service-level matching, valid destination semantics, and positive ordered stop positions. Assert browser-supplied IDs are references only and server re-reads every dependency before activation.

- [ ] **Step 2: Pin route structural rules in tests**:
  - first stop node equals `originNodeId`;
  - repeated node IDs/cycles are rejected for active rules;
  - every multi-stop rule has exactly `stops.length - 1` legs;
  - each leg's lane endpoints match adjacent stops and lane is active;
  - doorstep route ends with terminal role `final_mile_dispatch`;
  - remote pickup route uses `fulfilment=delivery`, `destinationKind=pickup_point`, ends at `finalPickupNodeId` with terminal role `customer_pickup`;
  - source collection uses `fulfilment=collection`, no delivery zone, one stop at origin, zero legs, terminal role `customer_pickup`;
  - direct doorstep route may use one source stop, zero legs, terminal role `final_mile_dispatch`.

- [ ] **Step 3: Add matching-precedence tests**. Candidate selection filters by active/effective window, exact origin, fulfilment, delivery zone when delivery, destination kind, optional final pickup node, optional normalized locality and optional service level. Highest numeric `priority` wins. If more than one candidate remains at that highest priority, result is `ambiguous`; do not introduce hidden specificity tiebreakers.

- [ ] **Step 4: Add Review Focus tests** for one-stop direct success, no-match, and equal-highest-priority ambiguity. `simulate` returns diagnostics; internal `resolve` throws `LOGISTICS_ROUTE_NOT_CONFIGURED` or `LOGISTICS_ROUTE_AMBIGUOUS` and never chooses arbitrarily.

- [ ] **Step 5: Add stale update/concurrent activation tests** using rule `version`: two updates/activation attempts from the same old version cannot both commit; one succeeds and the other returns 409.

- [ ] **Step 6: Run focused route specs and verify RED**, then implement `LogisticsRouteRuleService` and routes:
  - `GET|POST /admin/logistics/route-rules`
  - `GET|POST /admin/logistics/route-rules/{ruleId}`
  - `POST /admin/logistics/route-rules/{ruleId}/activate`
  - `POST /admin/logistics/route-rules/simulate`.

- [ ] **Step 7: On activation, lock the rule and all referenced nodes/lanes/workflow version**, rerun structural validation, and query active rules at the same priority whose selector/effective windows overlap this rule. If any overlap can match the same route context, reject activation as ambiguous. Otherwise set `active=true`, increment version and write Audit/Outbox in one transaction. This preflight prevents newly authored ambiguity, while `simulate`/`resolve` still fail closed if legacy/direct-DB data is ambiguous.

- [ ] **Step 8: Run all logistics API specs created so far** and require PASS.

- [ ] **Step 9: Commit**
```bash
git add apps/api/src/logistics/logistics-route-rule.service.ts apps/api/src/logistics/admin-logistics-route-rules.controller.ts apps/api/src/logistics/logistics.module.ts apps/api/test/logistics-route-rules.spec.ts apps/api/test/logistics-route-simulation.spec.ts apps/api/test/logistics-route-rule-concurrency.spec.ts
git commit -m "feat(logistics): add deterministic route rules"
```

---

### Task 7: Wire the Logistics module and publish the 82-path OpenAPI authority

**Files:**
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/src/http/production-openapi.ts`
- Create: `apps/api/test/logistics-authority.spec.ts`
- Modify: `apps/api/test/dispatch-authority.spec.ts`
- Modify: `apps/api/test/fulfilment-authority.spec.ts`
- Modify: `apps/api/test/payments-authority.spec.ts`
- Modify: `apps/api/test/refunds-authority.spec.ts`
- Modify: `apps/api/test/product-media-lifecycle.spec.ts`
- Modify: `docs/openapi-foundation.json`

**Interfaces:**
- Registers all four admin logistics controllers and four L1 services.
- Production OpenAPI contains exactly 82 path keys and documents L1 security/idempotency accurately.

- [ ] **Step 1: Write failing authority test** asserting all 13 path keys above exist, all are admin-authenticated, mutation POSTs require `Idempotency-Key` and cookie mutations document CSRF, while `/route-rules/simulate` requires admin auth but no idempotency header.

- [ ] **Step 2: Add negative authority assertions** that L1 does **not** expose shipment movement, customer tracking replacement, notification, courier webhook, COD or return-restock routes.

- [ ] **Step 3: Update existing fixed path-count assertions from 69 to 82** without weakening their authority-specific checks. Preserve all Dispatch/Rider, Fulfilment, Payments, Refunds and Product Media route assertions.

- [ ] **Step 4: Register `LogisticsModule` in `bootstrap.ts`** after Dispatch and before Payments unless deterministic OpenAPI ordering tests require another stable location; do not change existing module behavior.

- [ ] **Step 5: Document schemas/descriptions in `production-openapi.ts`** from shared L1 contracts. Descriptions must state that configuration does not prove shipment movement/provider connectivity.

- [ ] **Step 6: Generate OpenAPI twice**
```bash
npm run --prefix apps/api openapi
cp docs/openapi-foundation.json /tmp/logistics-openapi-a.json
npm run --prefix apps/api openapi
cmp /tmp/logistics-openapi-a.json docs/openapi-foundation.json
node -e "const d=require('./docs/openapi-foundation.json'); if(Object.keys(d.paths).length!==82) process.exit(1); console.log('82 paths')"
```
Expected: byte-identical output and `82 paths`.

- [ ] **Step 7: Run all OpenAPI authority specs** and require PASS.

- [ ] **Step 8: Commit**
```bash
git add apps/api/src/logistics/logistics.module.ts apps/api/src/bootstrap.ts apps/api/src/http/production-openapi.ts apps/api/test/logistics-authority.spec.ts apps/api/test/dispatch-authority.spec.ts apps/api/test/fulfilment-authority.spec.ts apps/api/test/payments-authority.spec.ts apps/api/test/refunds-authority.spec.ts apps/api/test/product-media-lifecycle.spec.ts docs/openapi-foundation.json
git commit -m "docs(api): publish logistics configuration authority"
```

---

### Task 8: Add web client operations, cache tags, permissions and local/demo parity

**Files:**
- Modify: `packages/contracts/src/common.ts`
- Modify: `src/services/client.ts`
- Modify: `src/services/operation-registry.ts`
- Modify: `src/services/mock/store.ts`
- Modify: `src/services/mock/router.ts`
- Modify: `src/lib/perms.ts`
- Test: `scripts/http-adapter-regressions.test.ts`
- Create: `scripts/logistics-client-regressions.test.ts`

**Interfaces:**
- Adds cache tag `logistics`.
- Adds typed `apiOps` methods corresponding one-for-one with Task 1 operation names.
- Adds UX-only permission `logistics.manage` to `owner_admin` only; production authorization remains backend `role=admin`.
- Local mock data models the same request/response shapes but remains explicitly non-authoritative and is never used as production evidence.

- [ ] **Step 1: Write failing HTTP-adapter tests** proving placeholder substitution/methods for all 13 operations, idempotency header forwarding on mutations, and no idempotency requirement for simulation.

- [ ] **Step 2: Write failing client-contract tests** proving `apiOps.logisticsNodes`, `logisticsNode`, `logisticsNodeCreate/Update`, lane equivalents, workflow list/detail/create/draft/save/publish, route rule list/detail/create/update/activate/simulate return the Task 1 contract types.

- [ ] **Step 3: Add `logistics` cache semantics**: configuration reads tag `logistics`; successful logistics mutations invalidate `logistics` and `config`; no L1 operation invalidates `stock`, `orders`, `payments`, `returns` or `delivery` because L1 changes no runtime shipment authority.

- [ ] **Step 4: Add bounded local mock handlers** sufficient for UI development: seed a source Head Office, one direct workflow draft/published example and one direct rule. Label demo-only records in mock metadata/copy, not in production API data.

- [ ] **Step 5: Add `logistics.manage`** to `Permission`; grant only `owner_admin` in the demo UX matrix.

- [ ] **Step 6: Run**
```bash
bun test scripts/http-adapter-regressions.test.ts scripts/logistics-client-regressions.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add packages/contracts/src/common.ts src/services/client.ts src/services/operation-registry.ts src/services/mock/store.ts src/services/mock/router.ts src/lib/perms.ts scripts/http-adapter-regressions.test.ts scripts/logistics-client-regressions.test.ts
git commit -m "feat(web): add logistics configuration client"
```

---

### Task 9: Build the Logistics & Delivery admin shell plus Nodes and Lanes UX

**Files:**
- Create: `src/app/admin/logistics/page.tsx`
- Create: `src/features/logistics/logistics-workspace.tsx`
- Create: `src/features/logistics/nodes-panel.tsx`
- Create: `src/features/logistics/lanes-panel.tsx`
- Modify: `src/components/layout/admin-shell.tsx`
- Create: `scripts/logistics-ui-regressions.test.ts`

**Interfaces:**
- `/admin/logistics` renders one responsive workspace with tabs `Locations & hubs`, `Network lanes`, `Workflows`, `Route rules`.
- `NodesPanel` consumes Task 8 node methods; `LanesPanel` consumes Task 8 lane methods.
- Admin navigation adds `Logistics & Delivery` under the Delivery group with `logistics.manage`.

- [ ] **Step 1: Write failing page/UX regressions** asserting the new nav item exists once, route is permission-gated, page exposes the four tabs, and mobile/desktop layout does not require horizontal page scrolling.

- [ ] **Step 2: Add failing Nodes UX contract assertions** for searchable list, kind/customer visibility badges, create/edit form, optional parent/group node, optional Inventory-location reference field, public directions/contact fields, dependency summary, and explicit archive/deactivate confirmation. Assert deactivation conflict keeps the form open and shows server dependency guidance rather than pretending success.

- [ ] **Step 3: Add failing Lanes UX contract assertions** for origin/destination selectors, mode, typical minutes, service days, optional provider key labeled as a configuration key rather than a connected provider, and dependency-safe deactivate feedback.

- [ ] **Step 4: Implement `LogisticsWorkspace` and `NodesPanel`** with accessible labels, loading/error/retry, empty state, successful mutation refresh and forms that scroll into view when create/edit opens.

- [ ] **Step 5: Implement `LanesPanel`**. Filter destination options to avoid the selected origin, but retain backend validation as authority. Show `Origin → Destination` prominently and keep service-day/cutoff controls usable on mobile.

- [ ] **Step 6: Add nav entry** using an existing appropriate Lucide icon; do not add a new icon dependency.

- [ ] **Step 7: Run focused Bun regressions, ESLint on changed files and TypeScript**
```bash
bun test scripts/logistics-ui-regressions.test.ts scripts/logistics-client-regressions.test.ts
bunx eslint src/app/admin/logistics/page.tsx src/features/logistics/*.tsx src/components/layout/admin-shell.tsx src/lib/perms.ts
bunx tsc --noEmit --incremental false
```
Expected: PASS.

- [ ] **Step 8: Commit**
```bash
git add src/app/admin/logistics/page.tsx src/features/logistics/logistics-workspace.tsx src/features/logistics/nodes-panel.tsx src/features/logistics/lanes-panel.tsx src/components/layout/admin-shell.tsx scripts/logistics-ui-regressions.test.ts
git commit -m "feat(admin): add logistics network workspace"
```

---

### Task 10: Build the immutable Workflow Builder UX

**Files:**
- Create: `src/features/logistics/workflows-panel.tsx`
- Modify: `scripts/logistics-ui-regressions.test.ts`

**Interfaces:**
- Consumes Task 8 workflow operations.
- Builder edits only `draft` versions and sends full ordered stage set with `expectedRevision`.
- Published versions are read-only and expose `Clone as new draft`.

- [ ] **Step 1: Add failing UI regressions** asserting workflow list/version history, current published badge, create-template action, draft-only editable controls, read-only published content, publish confirmation, and clone-to-draft path.

- [ ] **Step 2: Add failing safety-copy assertions** requiring every stage row to show both `System event` and `Display label`; `custom_checkpoint` shows an informational-only warning; the page never labels a custom display string as system authority.

- [ ] **Step 3: Implement ordered stage editing** with add/remove and explicit Move up/Move down controls (keyboard/mobile accessible; no drag-and-drop dependency required in L1). Stage editor includes canonical event, key, customer title/detail, admin label/help, pending visibility, SLA minutes, grouping, exception severity and notification-eligible toggle.

- [ ] **Step 4: Implement a truthful customer-preview pane** using only the draft's presentation configuration. Mark it `Preview` and never show any stage as actually completed; pending-preview behavior follows `showPlannedWhenPending` only.

- [ ] **Step 5: Handle stale revision 409** by preserving unsaved local content, showing `This workflow changed elsewhere`, and offering reload; never silently overwrite.

- [ ] **Step 6: Implement publish flow** requiring explicit confirmation and latest revision; after publish refresh template/version history and switch the published view to read-only.

- [ ] **Step 7: Run focused UI tests + typecheck** and require PASS.

- [ ] **Step 8: Commit**
```bash
git add src/features/logistics/workflows-panel.tsx scripts/logistics-ui-regressions.test.ts
git commit -m "feat(admin): add delivery workflow builder"
```

---

### Task 11: Build Route Rule editor and simulation UX

**Files:**
- Create: `src/features/logistics/route-rules-panel.tsx`
- Modify: `scripts/logistics-ui-regressions.test.ts`

**Interfaces:**
- Consumes Task 8 route-rule and node/lane/workflow reads.
- Active rules are read-only except explicit deactivation; edits create/update inactive configuration.
- Simulation never mutates configuration.

- [ ] **Step 1: Add failing route-rule UI regressions** asserting rule table shows active/inactive, priority, effective dates, origin, delivery-zone/locality/service-level coverage, workflow version and destination kind; editor supports ordered stops and lane selection between each adjacent stop.

- [ ] **Step 2: Add failing semantics assertions**:
  - selecting `collection` hides delivery-zone and remote-route controls and presents one source pickup stop;
  - selecting delivery + `pickup_point` requires final pickup node;
  - selecting delivery + `doorstep` ends at `final_mile_dispatch`;
  - one-stop direct delivery is allowed without a lane row;
  - active rules cannot be edited in place.

- [ ] **Step 3: Implement rule editor** with explicit Priority help text: `Higher number wins; two matching rules with the same highest priority are blocked as ambiguous.` Do not invent hidden route-ranking heuristics in the UI.

- [ ] **Step 4: Implement simulation form** for origin, fulfilment, delivery zone, locality, destination kind/final pickup, service level and effective time. Render:
  - `Matched` with selected rule, workflow version and ordered node/lane path;
  - `No route configured` with safe actionable guidance;
  - `Ambiguous` with conflicting rule names/priorities and instruction to fix configuration.

- [ ] **Step 5: Implement activation preflight** by calling simulation/validation through the server-owned activation command. If dependencies changed or path is invalid, keep the rule inactive and display the exact safe validation issue.

- [ ] **Step 6: Run UI tests, ESLint and TypeScript** and require PASS.

- [ ] **Step 7: Commit**
```bash
git add src/features/logistics/route-rules-panel.tsx scripts/logistics-ui-regressions.test.ts
git commit -m "feat(admin): add route rules and simulation"
```

---

### Task 12: Add guarded direct-route bootstrap and operations runbook

**Files:**
- Create: `apps/api/src/logistics/logistics-bootstrap.service.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Create: `apps/api/scripts/bootstrap-direct-logistics.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/logistics-bootstrap.spec.ts`
- Create: `docs/LOGISTICS_CONFIGURATION_RUNBOOK.md`

**Interfaces:**
- Produces `LogisticsBootstrapService.ensureDirectDefaults(actorId, requestId)` used only by the explicit CLI command, never automatically at app startup.
- `npm run --prefix apps/api logistics:bootstrap-direct` is idempotent and uses current `COMMERCE_LOCATION_ID` plus all active `DeliveryZone` rows.
- It creates only missing defaults with stable codes/keys and refuses to overwrite operator-authored conflicting configuration.

- [ ] **Step 1: Write failing bootstrap tests** proving the command creates one logistics source node linked to the configured commerce Inventory location, one published direct-doorstep workflow, and one active direct route rule per active delivery zone; every direct rule has one stop and zero legs.

- [ ] **Step 2: Add idempotency/conflict tests**: second run makes no duplicates; if the stable default code/name is already owned by incompatible operator data, fail with a clear conflict and do not rewrite it.

- [ ] **Step 3: Implement bootstrap service/script** using the same Task 3–6 services where practical, or a narrowly scoped transaction when CLI bootstrap needs batch atomicity. Never execute it from `bootstrap.ts` or migrations.

- [ ] **Step 4: Write runbook** covering prerequisites, dry inspection commands, direct bootstrap, creating multi-hop nodes/lanes/workflow/rules, simulation, safe deactivation order, rollback by deactivating L1 rules/config (not dropping tables), and statement that L1 alone changes no live shipment execution.

- [ ] **Step 5: Run bootstrap spec twice against an isolated database** and require deterministic counts.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/logistics/logistics-bootstrap.service.ts apps/api/src/logistics/logistics.module.ts apps/api/scripts/bootstrap-direct-logistics.ts apps/api/package.json apps/api/test/logistics-bootstrap.spec.ts docs/LOGISTICS_CONFIGURATION_RUNBOOK.md
git commit -m "ops(logistics): add guarded direct-route bootstrap"
```

---

### Task 13: Full Wave L1 verification, review and handoff

**Files:**
- Modify: `scripts/contracts-check.ts`
- Modify: `scripts/handoff-regressions.ts`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/KNOWN_ISSUES.md`
- Modify: `docs/VERIFICATION.md`
- Create: `docs/WAVE_L1_LOGISTICS_CONFIGURATION_HANDOFF.md`

**Interfaces:**
- Records exact verified branch SHA, migration count, API test count, OpenAPI path count/hash, root regression counts and deliberate non-live capabilities.
- Does not claim L2 shipment execution, L3 tracking, L4 notifications or L5 AI/SLA automation live.

- [ ] **Step 1: Rebase/merge latest `origin/main` into the implementation branch if main advanced**. Resolve only semantic conflicts, especially OpenAPI path counts and migration ordering; rerun all focused logistics tests after reconciliation.

- [ ] **Step 2: Create a brand-new isolated PostgreSQL 17 database** and apply every migration including `202610170009_logistics_configuration`. Require all migrations succeed from empty state.

- [ ] **Step 3: Run the full API CI-equivalent suite**
```bash
npm test --prefix apps/api
```
Expected: all tests PASS. Record exact count; do not pre-write a count in docs.

- [ ] **Step 4: Run focused L1 suite independently** so failures are attributable:
```bash
node --test --test-concurrency=1 apps/api/dist/test/logistics-contracts.spec.js apps/api/dist/test/logistics-schema.spec.js apps/api/dist/test/logistics-nodes.spec.js apps/api/dist/test/logistics-lanes.spec.js apps/api/dist/test/logistics-workflows.spec.js apps/api/dist/test/logistics-workflow-concurrency.spec.js apps/api/dist/test/logistics-route-rules.spec.js apps/api/dist/test/logistics-route-simulation.spec.js apps/api/dist/test/logistics-route-rule-concurrency.spec.js apps/api/dist/test/logistics-authority.spec.js apps/api/dist/test/logistics-bootstrap.spec.js
```
Expected: all PASS.

- [ ] **Step 5: Generate OpenAPI twice**, require byte equality, exactly 82 paths and no uncommitted drift. Record SHA-256.

- [ ] **Step 6: Run root CI-equivalent checks serially**
```bash
bun run lint
bunx tsc --noEmit --incremental false
bun run build
bun scripts/handoff-regressions.ts
bun test
bun scripts/contracts-check.ts http://localhost:3000/api/mock/v1
bash scripts/acceptance-checks.sh
bun scripts/route-sweep.mjs http://localhost:3000
```
Run route/contract/acceptance checks against an isolated production server as established by the repository verification workflow. Record exact page/test/expectation/route counts.

- [ ] **Step 7: Run authority-boundary snapshot regression** around L1 create/update/publish/activate/simulate operations and assert no `Order`, `Reservation`, `StockLot`, `StockDepletion`, `FulfilmentRun`, `DeliveryJob`, `PaymentAttempt` or `Refund` row changes.

- [ ] **Step 8: Run production-copy scan** over `/admin/logistics` and customer-facing order/tracking routes; require zero new misleading claims that logistics configuration implies actual parcel movement or connected providers.

- [ ] **Step 9: Request whole-branch code review** against this plan/spec. Fix every Critical/Important finding with RED→GREEN evidence and rerun affected full gates.

- [ ] **Step 10: Update handoff docs only from fresh evidence**. `KNOWN_ISSUES` must explicitly leave Shipment execution, route-aware customer tracking, Email/SMS/WhatsApp/in-app Notification Authority, live courier integrations, COD implementation and Physical Returns closed unless separately verified.

- [ ] **Step 11: Verify clean tree**
```bash
git diff --check
git status --short
git rev-parse HEAD
```
Expected: `git diff --check` clean; only intended verification-doc commit changes before final commit.

- [ ] **Step 12: Commit verification docs**
```bash
git add scripts/contracts-check.ts scripts/handoff-regressions.ts docs/HANDOFF.md docs/KNOWN_ISSUES.md docs/VERIFICATION.md docs/WAVE_L1_LOGISTICS_CONFIGURATION_HANDOFF.md
git commit -m "docs: record Wave L1 logistics verification"
```

- [ ] **Step 13: Push the implementation branch and open a PR**. Do not bypass branch protection. Merge only after required GitHub CI is green and repository policy permits; if main advances, update safely and let CI rerun.

---

## Wave L1 completion boundary

Wave L1 is complete only when administrators can safely configure and simulate a direct or multi-hop network and publish immutable workflow versions, while all existing commerce/fulfilment/dispatch behavior remains unchanged. The next plan is **Wave L2 — Shipment Route Execution + Dispatch Integration**, which will introduce `Shipment`, `ShipmentStop`, `ShipmentLeg`, append-only movement events, Fulfilment handover activation, depart/arrive/reroute commands and final-mile readiness. L2 must not start until L1 is merged and its exact database/API contract is green.
