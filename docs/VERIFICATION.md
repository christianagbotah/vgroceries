# Verification record

This file records the current authoritative verification checkpoints for Variety Groceries. Detailed older prototype/browser history remains available in git history; the records below describe the production backend and the frontend compatibility evidence the current branch actually depends on.

## Dispatch + Rider Authority — 13 October 2026

**Branch:** `feat/dispatch-rider-authority-20261013`
**Reviewed implementation checkpoint before this documentation commit:** `40ff740ea5a01ef4b3792f49955362884e57d966`
**Base:** Fulfilment + Stock Handover Authority merged on `main` as `7be1b0fdfc457763704512bae5a2bba685369279`

### Local clean-room PostgreSQL / API gate

A brand-new isolated database on the authorized VPS PostgreSQL **18.1** cluster was used for the final local run. Migrations applied in order:

1. `202610100001_foundation`
2. `202610100002_commerce_reservation_core`
3. `202610100003_checkout_orders_authority`
4. `202610100004_payments_authority`
5. `202610100005_refunds_authority`
6. `202610120006_fulfilment_stock_handover`
7. `202610130007_dispatch_rider_authority`

Observed local results:

| Check | Result |
|---|---:|
| PostgreSQL migrations | **7/7 applied** |
| API integration/security/concurrency suite | **318 passed, 0 failed** |
| Production OpenAPI | **57 paths** |
| Dispatch/Rider additive surface | **22 paths** |
| OpenAPI deterministic regeneration | **PASS — two byte-identical generations** |
| Committed OpenAPI drift check | **PASS** |
| Dispatch source authority scan | **PASS — 11 source files** |

The source scan found no Dispatch/Rider import or call to `StockDepletionService`, `consumeClaim`, payment capture, COD cash/remittance fields, GPS/ETA or provider-network code. The API suite separately proves that pickup/failure/reschedule/return do not mutate inventory, delivery does not settle COD payment, ownership is session-derived, races serialize safely and audit/outbox failures roll back atomically.

The repository's GitHub API workflow runs PostgreSQL **17**. The draft PR's fresh successful API workflow is the required PostgreSQL-17 evidence before merge readiness; the local PostgreSQL 18.1 run is intentionally recorded as local evidence only, not as a substitute.

### Root CI / frontend compatibility gate

Fresh local results from the same reviewed branch:

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

Because port 3000 was already occupied by an unrelated running Next.js service on the shared VPS, the branch's local production server was isolated on port 33013 for contract/acceptance/route-sweep checks rather than disturbing the existing process. GitHub CI will execute the repository's exact clean-runner port-3000 workflow.

### Review findings — RED to GREEN

Two mandatory-review defects were fixed with explicit regression evidence before readiness:

1. **Failure reason `other` required no explanation.** The request contract was tightened in `a1eea7b`, then the invariant was enforced at the PostgreSQL layer in `6e31ad1`. Contract and schema tests prove that `other` without a bounded explanatory note fails closed.
2. **Two exact OpenAPI authority tests still pinned the pre-Dispatch 35-path surface.** The first complete post-Dispatch suite provided RED evidence: **318 tests ran, 316 passed, 2 failed**, and both failures were the stale exact-path assertions in `commerce-authority.spec.ts` and `foundation.spec.ts`. No business-logic/concurrency/stock/payment/rider test failed. Commit `40ff740` updated only those authority expectations. A focused rerun passed **46/46**, followed by the clean full run passing **318/318**.

### Proven Dispatch + Rider invariants

The current backend verification establishes these boundaries:

- Dispatch eligibility begins only after authoritative delivery handover and existing `stockConsumedAt`;
- rider pickup changes custody but never performs another stock depletion;
- one order cannot acquire two delivery jobs and one rider cannot own conflicting active jobs;
- rider identity comes from the authenticated session, never a trusted request-body rider ID;
- reassignment/unassignment is blocked after physical custody leaves dispatch;
- delivery requires supported proof metadata and advances delivery/fulfilment without marking COD paid;
- failed/rescheduled/return-to-store paths do not restore inventory;
- physical return receipt to store custody still awaits future Returns inspection/disposition before any restock;
- manual provider transitions are explicit staff-recorded evidence and make zero provider network calls;
- delivery/failure races have one winner, retries do not duplicate events/proof and audit/outbox faults roll the transaction back;
- production OpenAPI exposes exactly 9 admin-dispatch + 3 admin-rider + 10 rider-self-service paths, with COD remittance/Returns/POS/live-provider webhooks still absent.

### Deliberately not verified as production-live

The successful gates above do **not** claim that COD cash collection/remittance, physical Returns/restocking, POS cashier authority, live courier network integrations, GPS/ETA, proof-media storage, production Hubtel credentials/webhooks, SMS/email/push, live AI execution or complete public-storefront backend cutover are live.

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
