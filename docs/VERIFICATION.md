# Verification record

## Customer inbox completion checkpoint — 5 November 2026

**Scope:** Completes the in-app notification channel on `feat/l4-customer-notification-inbox`, based on deployed `f635f3f`. Includes authenticated customer UI, stable cursor pagination, read-one/read-all, immutable database evidence, shared REST/demo contracts and a bounded systemd projector timer. External notification channels and L2 execution remain closed. The deployment checkpoint is separate from these code checks.

| Check | Observed result |
| --- | --- |
| Focused PostgreSQL inbox integration/security | 10/10 passed |
| Notification REST/shared-schema/in-process and HTTP demo transport | 4/4 passed |
| Full Bun regressions | 188/188 passed; 1,404 expectations across 33 files |
| Independent whole-branch review | One demo HTTP identity defect corrected; re-review found no remaining important findings |
| Full API, lint/type/build, browser and HTTP gates | In progress; results must be recorded before release |

The initial branch's API workflow failed three checks: two exact route assertions omitted the inbox routes, and a guest fixture violated `Order_owner_xor`. Those fixtures/assertions were corrected, and their focused baseline passed 49/49. New failing behavior tests then proved the missing pagination, read-all, cookie CSRF route, manual-provider event parity and immutable snapshot guards before implementation. Atomic rollback and simultaneous projector tests also passed. The review's HTTP demo transport regression failed with `NOT_FOUND` before the notification ID moved into the request body, then passed after correction.

A first full API attempt used a unique database name accepted by most suites but rejected by several older guards requiring the exact foundation database name. That attempt was stopped. The definitive run uses a new PostgreSQL instance on private loopback port 55434, with its own `variety_foundation_test` database; neither the shared test database nor UAT data is reset.

## Development checkpoint: Wave L4 phase 1 customer in-app notifications — 4 November 2026

**Scope:** Isolated branch `feat/l4-customer-notification-inbox`, based on deployed `f635f3f`. The live portal/API services and current PostgreSQL data were not changed. This is an in-app inbox foundation only; external notification channels and frontend inbox remain closed.

| Verification | Observed result |
| --- | --- |
| Shared TypeScript contracts compile | Passed |
| Prisma client generation with new Notification and NotificationOutboxReceipt models | Passed |
| Complete API TypeScript compile | Passed |
| Targeted ESLint on changed API code and new tests | Passed |
| Production OpenAPI generation | 113 paths; two consecutive generations byte-identical; SHA-256 `64590314360c6a3a0f83cc545c4489fd4ccd0af3ee426026edaa5a944a46805c` |
| `git diff --check` | Passed |
| New end-to-end PostgreSQL notification tests and full existing API suite | Pending CI; local VPS has no separate PostgreSQL test service |
| Migration 021 on staging/production | Not applied |
| Live portal/API cutover or notification projector scheduling | Not performed |

The new tests target committed event processing, guest-order skip, forged recipient payload rejection, account isolation, idempotent read, and COD/financial message truth. **Tests are not reported as passed until executed.**

## Previous checkpoint: Wave L3 Advanced Customer Tracking — 4 November 2026

Code checkpoint: `91702072711ec0f14e306596c437a0d3b9e9b905`, PR #54. The code adds the optional, strict `PublicOrder.trackingJourney` projection and shared guest/account/checkout presentation without new routes, tables, migrations or movement authority. Production L2 shipment execution stays disabled.

Observed checks for this checkpoint:

| Check | Result |
| --- | --- |
| Focused API tracking contracts/projection/OpenAPI/security cases | 26/26 passed |
| Root Bun regression suite | 184/184 passed; 1,389 expectations across 32 files |
| ESLint | Passed |
| TypeScript no-emit | Passed |
| Production OpenAPI | 111 paths; two generations byte-identical, SHA-256 `c7d78f05178e878e71e72c90ab0e51f6a89bd93abbe953cdd01bc613282570c2` |
| Complete API suite against fresh isolated PostgreSQL | 567/567 passed; 0 failed, 21/21 migrations applied in GitHub API foundation run 41745990319 |
| Final production build | Passed; 54/54 Next.js pages generated |
| Handoff regressions / HTTP contracts / business acceptance / route sweep | 27/27, 42/42, 24/24 and 66/66 HTTP 200 |
| Browser responsiveness and refresh | 4/4 scenarios passed at 360/768/1440 px, no horizontal overflow; real fixture tracking + manual refresh and separately labelled planned-stage UI fixture |
| GitHub CI at the code checkpoint | Passed, run 41745990386 |
| GitHub API foundation at the code checkpoint | Passed, run 41745990319; integration/security suite 567/567 |

A fresh read-only whole-branch review of `0e90f07..51d0403` found five important issues. Regression-first corrections in `9170207` cover cancelled orders retaining planned Shipments, delivery failure/reschedule before pickup, repeated workflow arrival occurrences, informational event volume erasing earlier evidence, and overlapping/stale refresh responses. Five new API behavior tests failed against the reviewed code and passed after correction; five request-coordinator behavior tests likewise demonstrated RED to GREEN. The focused UI/request set passed 8/8. Terminal legacy responses stop polling, and the planned-step explanation is consistent with the rendered timeline.

Order identity changes remount the lookup component and invalidate its outstanding request coordinator; this avoids both stale customer views and synchronous effect-driven state resets. An initial verification command ran the OpenAPI test from the repository root and failed its relative file lookup; rerunning from `apps/api`, the package's documented test working directory, passed 26/26. The final whole-API command uses that same package context.

Implementation decisions: repeated event kinds consume committed occurrences in workflow order, including hidden stages; a single event cannot certify two arrivals. State and stage truth is derived before the public display is bounded to 160 milestones. Reading complete evidence avoids false progress after many checkpoints; query work therefore grows with an individual shipment's event history. These are projection choices, not new movement or financial authority.

Browser evidence is in `docs/qa/evidence/customer-tracking-l3-20261104/`: three real mock-order screenshots, a separately labelled UI-only planned Shipment fixture, and `results.json`. The planned fixture keeps the surrounding payment/fulfilment/delivery badges coherent. Chromium checks loaded and manually refreshed tracking at all three widths, found no browser errors or horizontal overflow, and confirmed planned stages contain no time element. Phone and desktop screenshots were visually inspected. These are isolated production-build checks with fictional fixtures, not a production shipment rollout.

The review did not claim runtime/browser or whole-suite results; those were independently executed and are recorded above. A broader audit of unchanged L1 free-text validation is outside this wave; existing validation and customer-copy guards remain in force.

Historical verification sections below describe earlier checkpoints and do not supersede this current record.

## Wave L2 Shipment Route Execution + Dispatch Integration — 1 November 2026

**Branch under review:** `feat/shipment-route-execution-l2-20261030`
**Reviewed L2 code checkpoint before final verification-doc refresh:** `798a9d6`
**Integrated base:** `origin/main` at `575673f`

Wave L2 adds server-owned Shipment/Stop/Leg runtime authority on top of L1 configuration: immutable route snapshots, append-only movement evidence, Fulfilment handover activation, depart/arrive/checkpoint/reroute, final-mile Dispatch gating, and Rider/manual-provider custody synchronization. `LOGISTICS_SHIPMENT_EXECUTION_ENABLED` defaults to `false`; this verification proves the code authority and fail-closed rollout gate, not production enablement.

### Clean-room database and API evidence

A freshly recreated isolated PostgreSQL database on `127.0.0.1:55432`, separate from production/staging, applied all **21 migrations** through `202611010020_shipment_return_dispatch_event`. The complete API suite was run under a PID-1-owned transient systemd service after the remote command harness was found to terminate long child processes; that stable exact-head run completed normally with **541/541 tests passed, 0 failed**.

| Check | Result |
|---|---:|
| Empty database migrations | **21/21 applied** |
| Complete API integration/security suite | **541/541 passed, 0 failed** |
| Focused physical-return/Shipment contract + migration-lineage review set | **11/11 passed, 0 failed** |
| Root ESLint on L2 API checkpoint | **PASS** |
| Production OpenAPI | **111 paths** |
| OpenAPI deterministic regeneration | **PASS — two byte-identical generations** |
| OpenAPI SHA-256 | `d763a7b8011c4ca6cdfa9d719073755b2171e73e42093dc9c225f988b2b2e6e` |
| `git diff --check` | **PASS** |
| Root/frontend TypeScript `tsc --noEmit --incremental false` | **PASS** |
| Next.js production build / static generation | **PASS — 54/54 pages** |
| Handoff regression assertions | **27/27 passed** |
| Bun regression suite | **176/176 passed — 1,346 expectations across 30 files** |
| Shared contract checks | **38/38 passed** |
| Business-rule acceptance checks | **24/24 passed** |
| Production-server route sweep | **66/66 HTTP 200** |

### L2 authority evidence

The focused and complete suites prove:

- delivery checkout snapshots exactly one server-resolved route when L2 is enabled, while collection and flag-off checkout remain Shipment-free;
- no-match and equal-priority ambiguity roll the checkout transaction back rather than inventing a route;
- Fulfilment handover activates Shipment state in the same transaction as the existing exactly-once stock depletion boundary;
- direct routes become `final_mile_ready`, multi-hop routes execute one ready/active leg at a time, and pickup-terminal routes become `ready_for_pickup`;
- reroute is accepted only at a physical node with no active leg, preserves all earlier route revisions and fails atomically on no replacement/ambiguity;
- checkpoints are append-only informational evidence and cannot change projection/custody/payment/inventory truth;
- Dispatch excludes routed Shipments before final-mile readiness while preserving legacy no-Shipment compatibility;
- Rider/manual-provider pickup and delivery synchronize Shipment custody without settling COD or mutating inventory;
- physical return receipt restores the Shipment to its immutable final-mile dispatch node as `final_mile_ready`, appends return evidence, permits safe reassignment and still performs no restock/payment mutation;
- admin Shipment reads/mutations are role-restricted, replay-protected where mutating, bounded/customer-safe, and publish exactly seven L2 paths on the 111-path production surface;
- L3 customer route-aware tracking, L4 notifications, COD remittance, Physical Returns, POS, live courier APIs and GPS/ETA remain absent from the published authority.

### Remaining merge gate

Local whole-branch frontend lint/typecheck/production build, handoff/Bun/contract/acceptance/route-sweep verification, exact-head OpenAPI determinism, clean-room API verification and review are complete. Fresh GitHub `CI` + `API foundation` pull-request runs remain required before merge readiness is claimed. No production database migration or L2 production flag enablement was performed by this checkpoint.

## Wave L1 Logistics Network & Workflow Configuration — 19 October 2026

**Branch under review:** `feat/logistics-network-workflow-l1-20261017`
**Reviewed code checkpoint before verification-doc commit:** `3752722`
**Integrated base:** `origin/main` at `b82dc55d4c17ad11268b65c8c1001b317924abe8`

Wave L1 adds production configuration authority for Logistics Nodes, Lanes, immutable Delivery Workflow versions, deterministic Route Rules, route simulation and the `/admin/logistics` workspace. It deliberately does not add Shipment movement, customer tracking cutover or notifications.

### Clean-room database and API evidence

A fresh isolated PostgreSQL database on `127.0.0.1:55433`, separate from production/staging, applied all **10 migrations** through `202610170009_logistics_configuration`. The final late-review regression first reproduced a missing route/workflow compatibility invariant: a doorstep route could bind a `customer_collected` workflow. The root cause was route validation checking only `published` status. Commit `3752722` now requires doorstep workflows to end in `delivered` and pickup/collection workflows to end in `customer_collected`; the exact RED test became GREEN and adjacent route/concurrency/bootstrap/authority-boundary suites passed **11/11**.

| Check | Result |
|---|---:|
| Empty database migrations | **10/10 applied** |
| Final exact-head complete API suite | **429/429 passed, 0 failed** |
| Final focused L1 Logistics suite | **30 passed, 0 failed** |
| Post-review affected route/bootstrap/boundary suite | **11 passed, 0 failed** |
| Production OpenAPI | **82 paths** |
| OpenAPI deterministic regeneration | **PASS — two byte-identical generations** |
| OpenAPI SHA-256 | `fe1de21570acdea4f22297c1cda1952efcf0f092feabf9ecdce04fadbd3d365b` |
| `git diff --check` | **PASS** |

### Root/frontend compatibility evidence

| Check | Result |
|---|---:|
| ESLint | **PASS** |
| TypeScript `tsc --noEmit --incremental false` | **PASS** |
| Next.js production build | **PASS** |
| Static page generation | **50/50** |
| Handoff regression assertions | **27/27** |
| Bun regression suite | **114/114 — 1009 expectations across 15 files** |
| Shared contract checks | **38/38** |
| Business-rule acceptance checks | **24/24** |
| Production-server route sweep | **60/60 HTTP 200** |

The production build includes `/admin/logistics`. Contract checks cover the new logistics node/lane/simulation schemas and live mock-adapter response shapes. Handoff regression 9 proves configuration/simulation leaves runtime mock commerce state unchanged.

### Proven L1 invariants

- business hierarchy is configurable rather than hard-coded as regional/district/zonal states;
- LogisticsNode remains distinct from Inventory Location and transit does not restock;
- published workflow content is immutable and stale draft writes fail with conflict;
- direct routes can have one stop/zero lanes; multi-hop routes require active adjacent lanes;
- route selection is server-owned, highest-priority and fail-closed on no-match/ambiguity;
- route activation is concurrency-safe and bootstrap refuses conflicting/ambiguous defaults;
- doorstep route workflow ends in `delivered`; pickup/collection workflow ends in `customer_collected`;
- L1 create/update/publish/activate/simulate operations do not mutate runtime commerce authorities.

### Deliberately not production-live

L2 Shipment movement, L3 route-aware customer tracking, L4 Email/SMS/WhatsApp/in-app notification delivery, L5 SLA/AI route automation, COD collection/remittance, Physical Returns, POS, live courier APIs, GPS/ETA, Hubtel production activation and final Product Media provider/storage cutover remain closed unless independently verified.

GitHub PostgreSQL 17 CI is still required on the final pushed branch before merge.

This file records the current authoritative verification checkpoints for Variety Groceries. Detailed older prototype/browser history remains available in git history; the records below describe the production backend and the frontend compatibility evidence the current branch actually depends on.

## Integrated Dispatch/Rider persistence hardening — 17 October 2026

**Branch under review:** `feat/dispatch-rider-authority-20261013`
**Reviewed code checkpoint before this documentation commit:** `8355ac1a1d1878389f6c40f3172f4f5252ff3144`
**Integrated base:** `origin/main` at `d4f72d3dde5c6b409a35075927987134b65437c1`

This checkpoint closes two persistence-level bypasses that remained possible even though application services already enforced the intended Dispatch/Rider workflow. A delivery job now has a database trigger requiring authoritative Fulfilment dispatch handover before assignment, and database checks prevent a failed rider-custody job from being released to `unassigned` before custody is safely back at dispatch/store. Direct database use of `pin` as delivery proof is also regression-tested and remains rejected; supported proof metadata stays `signature` or `photo_note` until an order-bound PIN verifier exists.

### Fresh isolated PostgreSQL / API gate

Verification used a fresh isolated PostgreSQL **18** instance on `127.0.0.1:55433`; no production or staging database was modified. The database was recreated, all **9 migrations** applied, and the repository's complete API suite ran with the same required environment shape used by API CI.

| Check | Result |
|---|---:|
| PostgreSQL migrations on fresh database | **9/9 applied** |
| Complete API integration/security/concurrency suite | **399 passed, 0 failed** |
| Focused Dispatch/Rider/manual-provider suite | **68 passed, 0 failed** |
| Focused new schema authority regressions | **6 passed, 0 failed** |
| Production OpenAPI | **69 paths** |
| OpenAPI deterministic regeneration | **PASS — two byte-identical generations** |
| OpenAPI SHA-256 | `0a83f3dc194ca6735558dc082769817c7f3bce2ed855a58193f135878353ca90` |
| `git diff --check` | **PASS** |

The TDD RED run first proved both persistence bypasses: direct job creation without handover and direct failed-rider-custody release did not reject. After migration `202610170008_dispatch_rider_integrity`, both regressions and the existing lifecycle tests ran GREEN. Existing fixture-only direct DeliveryJob creation was updated to create the same authoritative Fulfilment handover required in real operation.

### Root/frontend compatibility gate

The integrated repository was then verified through the root build and production-server checks:

| Check | Result |
|---|---:|
| Frozen dependency install | **PASS** |
| ESLint | **PASS** |
| TypeScript `tsc --noEmit --incremental false` | **PASS** |
| Next.js production build | **PASS** |
| Static page generation | **49 pages** |
| Handoff regression script | **PASS** |
| Bun regression tests | **97 passed, 0 failed** |
| Shared contract checks | **32 passed, 0 failed** |
| Business-rule acceptance checks | **24 passed, 0 failed** |
| Production-server route sweep | **68 passed, 0 failed** |

The production server for these checks was isolated on port **33017**. This verification does not claim a production deployment or a production database migration.

### Integrated authority state at this checkpoint

The 69-path contract includes the previously verified 22-path Dispatch/Rider surface plus the Product Media authority now present in the integrated repository. Product Media supports durable upload/generation/review/gallery workflows and guarded UAT operation, while its runbook deliberately keeps external image generation and production object-storage cutover behind explicit configuration and verification. The current storefront/UAT work therefore must not be interpreted as proof that external AI generation, S3-compatible production storage, live courier APIs, COD remittance, Physical Returns, POS, Hubtel production money movement, live GPS/ETA or notification providers are production-live.

A fresh GitHub PR workflow remains required before merge so PostgreSQL **17**, the repository's CI database version, independently verifies the migration and test suite.

## Dispatch + Rider Authority — 13 October 2026

**Branch:** `feat/dispatch-rider-authority-20261013`
**Reviewed code checkpoint before this documentation commit:** `9515745da95dfaf2c59bee2d7019b18de3c24f3b`
**Base:** Fulfilment + Stock Handover Authority merged on `main` as `7be1b0fdfc457763704512bae5a2bba685369279`

### Local clean-room PostgreSQL / API gate

A brand-new database on an isolated PostgreSQL **18.1** cluster bound only to `127.0.0.1:55432` under the unprivileged `lightworld` OS user was used. It was separate from every production/staging PostgreSQL instance. Migrations **001–007** applied in order and the complete repository API suite then passed **333/333, 0 failed**. A focused post-review Dispatch/Rider suite separately passed **65/65**.

| Check | Result |
|---|---:|
| PostgreSQL migrations | **7/7 applied** |
| Complete API integration/security/concurrency suite | **333 passed, 0 failed** |
| Focused Dispatch/Rider suite | **65 passed, 0 failed** |
| Production OpenAPI | **57 paths** |
| Dispatch/Rider additive surface | **22 paths** |
| OpenAPI deterministic regeneration | **PASS — two byte-identical generations** |
| Committed OpenAPI drift check | **PASS** |
| Dispatch source authority scan | **PASS** |

The static scan found no Dispatch/Rider import/call to stock depletion, no direct StockLot/Reservation/StockDepletion/PaymentAttempt/Refund mutation, no COD cash/remittance fields, no GPS/ETA authority and no provider-network primitive. The integration suite proves that pickup/failure/reschedule/return never become a second stock authority, delivery never settles COD payment, session identity owns rider operations, and audit/outbox failures roll back atomically.

The repository's GitHub API workflow runs PostgreSQL **17**. A fresh successful PR workflow is still required as final PostgreSQL-17 evidence before merge readiness; local PostgreSQL 18.1 is recorded only as clean-room local evidence.

### Root CI / frontend compatibility gate

Fresh exact-head local results:

| Check | Result |
|---|---:|
| ESLint | **PASS** |
| TypeScript `tsc --noEmit --incremental false` | **PASS** |
| Next.js production build | **PASS** |
| Static page generation | **48/48** |
| Handoff regression assertions | **24/24** |
| Bun regression tests | **50/50** — 460 expectations across 5 files |
| Shared contract checks | **32/32** |
| Business-rule acceptance checks | **24/24** |
| Production-server route sweep | **58/58 HTTP 200** |

Port 3000 was already occupied by an unrelated VPS service, so the branch's production server was isolated on **33013** for contracts/acceptance/route sweep and then terminated. No existing service was disturbed.

### Independent review findings — RED to GREEN

The whole-branch review found operational/security defects beyond the original task tests. Each accepted finding was reproduced before the fix and then re-run GREEN. Earlier pre-review hardening also required an explanatory note for failure reason `other` at both contract/database layers and corrected two stale exact-path assertions from the pre-Dispatch OpenAPI surface.

1. operational rider/staff notes defaulted customer-visible -> event visibility now fails closed;
2. rescheduled jobs could dead-end -> due-time custody-preserving retry uses existing rider/provider commands;
3. reschedule replay failed after the scheduled time -> time eligibility runs only after idempotency replay lookup;
4. an unassigned former rider could still read customer detail -> unassigned detail access is revoked while provenance remains;
5. rider command locks could invert with assignment -> consistent lock ordering was introduced;
6. `allowedActions` omitted real manual-provider/return/retry operations -> projections now derive assignment kind, custody and due time;
7. active work could project as offline after a declared offline change -> effective busy state now outranks declaration;
8. Zod cross-field refinements disappeared from generated OpenAPI -> affected request schemas now publish explicit `oneOf` constraints;
9. returned-to-store responses omitted the required Returns-inspection truth -> typed `Returned to store — awaiting Returns inspection.` projection added;
10. a later concurrency regression reproduced a real PostgreSQL **40P01 deadlock** between admin assignment/reassignment paths -> assignment authority now serializes that race with a transaction advisory lock;
11. physically returned goods could become operationally unassignable after safe unassignment -> `unassigned + store_returned + returnedToStoreAt` is now safely assignable without changing Returns/inventory truth.

The final focused regressions for the two follow-up defects passed **20/20**, and the complete exact-head API run subsequently passed **333/333**.

### Proven Dispatch + Rider invariants

- Dispatch eligibility begins only after authoritative delivery handover and existing `stockConsumedAt`.
- Rider pickup changes custody but never performs another stock depletion.
- One order cannot acquire two delivery jobs and one rider cannot own conflicting active jobs.
- Admin assignment/reassignment races do not surface database deadlocks in the regression interleaving.
- Rider identity comes from the authenticated session and former ownership does not leak live customer detail.
- Delivery requires supported proof metadata and advances delivery/fulfilment without marking COD paid.
- Failed/rescheduled/return-to-store paths do not restore inventory; store-returned goods explicitly await future Returns inspection.
- Manual-provider transitions are staff-recorded, network-free evidence; no fake provider/GPS/ETA capability is claimed.
- Idempotent retries do not duplicate jobs/events/proof, including reschedule retries after their due timestamp.
- Production OpenAPI exposes exactly 9 admin-dispatch + 3 admin-rider + 10 rider-self-service paths while COD remittance/Returns/POS/live-provider webhooks remain absent.

### Approved continuation

After this branch reaches a green draft PR, implementation continues with the already-approved production expansion: **Wave A order tracking**, **Wave B product media + typed grocery specifications**, **Wave C external-provider registry/adapters**, then separate **COD collection/remittance** and **Physical Returns** authorities. The approved expansion design is tracked separately at `5918c7788ddfec733c9b5e28f5ce787ac9dac752`, with the Wave A implementation plan at `6834b8ee65b32f198ca2fcb4417e2c5b8461fc49`; those documents are intentionally not mixed into this focused Dispatch/Rider branch.

### Deliberately not verified as production-live

The successful gates above do **not** claim that COD cash collection/remittance, physical Returns/restocking, POS cashier authority, live courier network integrations, GPS/ETA, proof-media storage, production Hubtel credentials/webhooks, SMS/email/push, live AI execution, production product-gallery/specification authority or complete public-storefront backend cutover are live.

## Fulfilment + Stock Handover Authority — 13 October 2026

**Branch:** `feat/fulfilment-handover-20261012`  
**PR:** `#12`  
**Latest reviewed code checkpoint before documentation-only commits:** `ef6762423ded43bc3fe6f3083ce7e94941566d89`  
**PR base at verification:** `7723f457b87fa4722da317013d31f225506d166b`

GitHub's pull-request workflows tested synthetic merge commit `66c5626037875d670b146f314d448e328ac3968f`, merging that reviewed head into the PR base. Both workflows completed successfully:

- **API foundation** — run `38396198571`: success
- **CI** — run `38396198558`: success

### PostgreSQL / API authority gate

The API-foundation job used PostgreSQL 17 and applied all six migrations successfully:

1. `202610100001_foundation`
2. `202610100002_commerce_reservation_core`
3. `202610100003_checkout_orders_authority`
4. `202610100004_payments_authority`
5. `202610100005_refunds_authority`
6. `202610120006_fulfilment_stock_handover`

Observed results:

| Check | Result |
|---|---:|
| PostgreSQL migrations | **6/6 applied** |
| API integration/security/concurrency suite | **268 passed, 0 failed** |
| Production OpenAPI | **35 paths** |
| OpenAPI deterministic regeneration | **PASS — two byte-identical generations** |
| Committed OpenAPI drift check | **PASS** |

The passing API suite includes exact reservation coverage, variant provenance, immutable lot provenance, exactly-once depletion, multiple reservations sharing a lot, physical shortage atomicity, quarantine/expiry rejection, outbox rollback, paid delivery handover, collection handover, eligible delivery COD handover, unpaid/uncertain electronic-payment blocking, pack-without-depletion, shortage/lost-reservation pack blockers, admin-only seven-route workflow, handover-vs-handover race, pack-vs-cancellation race and handover-vs-cancellation race.

### Root CI / frontend compatibility gate

Observed results from CI run `38396198558`:

| Check | Result |
|---|---:|
| ESLint | **PASS** |
| TypeScript `tsc --noEmit` | **PASS** |
| Next.js production build | **PASS** |
| Static page generation | **48/48** |
| Handoff regression assertions | **24/24** |
| Bun regression tests | **50/50** — 460 expectations across 5 files |
| Shared contract checks | **32/32** |
| Business-rule acceptance checks | **24/24** |
| Production-server route sweep | **58/58 HTTP 200** |

The frontend build includes `/admin/fulfilment` and preserves the z.ai continuation-wave contract: backend-derived `allowedActions`, pick/progress/shortage presentation, packing without stock depletion and explicit packed/handover states. Root CI intentionally ran the Next.js application without a configured live API URL, so the frontend server logged prototype/mock mode; that verifies UI compatibility, not storefront production cutover.

### Pre-merge query-authority regression — RED to GREEN

The mandatory pre-merge review found a projection/command inconsistency: `FulfilmentQueryService` selected each reservation stock position's `variantId` but a dead condition did not compare it with the order-line variant. Command-side `ClaimCoverageService` already failed closed, but the queue/detail projection could advertise an action before the command rejected corrupted reservation provenance.

A regression test was added at `apps/api/test/fulfilment-query-variant-authority.spec.ts`. Commit `0b470e5694832611db75166640f600c106fb3141` produced the required RED evidence in API-foundation run `38395350376`: **268 tests ran, 267 passed, 1 failed**, and the only failure was the new variant-mismatch projection test.

The minimal source fix is commit `1097b4947f7631baf77ad6f8d2cdd20aeac31d82`: query authority now compares `line.variantId` with `row.position.variantId` and fails closed with `reservation_lost`. The subsequent normal PR gate at reviewed checkpoint `ef6762423ded43bc3fe6f3083ce7e94941566d89` provided GREEN evidence: API-foundation run `38396198571` passed **268/268**, with the new test explicitly passing, followed by deterministic **35-path** OpenAPI generation with zero drift. Root CI run `38396198558` also succeeded.

## Proven stock-handover invariants

The current backend verification establishes these boundaries:

- picking and packing never decrement physical stock;
- delivery consumes stock at dispatch handover;
- collection consumes stock at customer handover;
- exact active reservation coverage and matching order-line variant provenance are required before safe progression/depletion;
- lot quantities are locked/aggregated before decrement and cannot become negative;
- one claim produces one immutable depletion identity;
- same-key/repeated handover cannot decrement twice;
- audit/outbox failure rolls stock, reservation and operational changes back together;
- after stock handover, ordinary order cancellation cannot restore inventory;
- Fulfilment cannot directly mutate Refund or PaymentAttempt financial truth;
- physical Returns, Dispatch/COD-remittance and POS remain separate future authorities.

## Production OpenAPI checkpoint

The production OpenAPI has exactly **35 paths**. Seven are the administrator Fulfilment Authority paths. The authority tests verify administrator security, strict mutation schemas, idempotency requirements, PUT pick correction, response projections and the absence of unimplemented dispatch/rider/COD-remittance/physical-returns/POS authority routes.

## Frontend continuation wave — 12–13 October 2026

The z.ai frontend continuation work is documented in `docs/ZAI_FRONTEND_HANDOFF.md`. Its verified branch was `feat/zai-frontend-continuation-20261012` and it was incorporated into the `main` base used by PR #12.

Recorded frontend evidence from that wave includes:

- ESLint and strict TypeScript pass;
- production build pass;
- route sweep **58/58**;
- business acceptance **24/24**;
- Bun regression suite **50 tests / 460 expectations** after integration;
- responsive QA at 360/390/768/1024/1440 and screenshot evidence under `docs/qa/evidence/zai-frontend-continuation-20261012/`.

## Deliberately not verified as production-live

The successful gates above do **not** claim that these future authorities/integrations are live: courier/dispatch/rider backend, COD cash collection and remittance, physical Returns/restocking, POS cashier authority, production Hubtel credentials/webhooks, SMS/email/push, live AI execution, or complete public-storefront backend cutover.

Those boundaries are tracked in `docs/KNOWN_ISSUES.md`; the implementation order is in `docs/HANDOFF.md`.

## Admin + Storefront CMS modernization — 26 October 2026

**Branch:** `feat/admin-cms-modernization-20261026`

This wave adds an owner/admin-only Storefront CMS inside the existing staff workspace. It provides `/admin/content`, `/admin/content/homepage`, and `/admin/content/pages/[slug]`, with structured text fields, draft isolation, explicit publishing, audit events, storefront preview links, and published-content reads for the homepage hero plus Help/Returns/Privacy/Terms pages. Product Media remains under catalogue authority rather than being duplicated in the CMS.

Observed verification in the isolated worktree:

| Check | Result |
|---|---:|
| Production CMS authority integration suite | **5/5 passed** |
| Complete NestJS API integration/security suite | **457/457 passed — 0 failed** |
| Root web/script regression sweep | **146/146 passed — 1,224 expectations across 22 files** |
| Production REST operation mapping | **101/101 mapped against OpenAPI** |
| Generated production OpenAPI | **95 implemented paths, including all 9 CMS paths** |
| ESLint | **PASS** |
| Next.js production build | **PASS** |
| Static-page generation | **55/55 generated** |
| `git diff --check` | **PASS** |

The production CMS authority proves: public reads return only the published homepage or structured support/policy page; invalid page slugs fail closed; admin reads/mutations require authenticated administrator authority; browser-supplied actor identity is rejected; draft writes remain private; publish validates required content and atomically canonicalizes draft + published state; and all draft/publish mutations are audit logged with the server-derived actor. The PostgreSQL migration seeds `homepage`, `help`, `returns-policy`, `privacy`, and `terms` records while Product Media remains under catalogue authority.

The web regression/build evidence proves the CMS routes are present in the admin shell, the editors expose separate Save draft and Publish actions, the public storefront consumes published content through the service boundary, and the app still builds in prototype mode when `API_BASE_URL` is intentionally unset. The live UAT deployment remains a separate cutover step: migration, API and web release must be deployed together before persistent CMS edits are available on the production-connected portal.
