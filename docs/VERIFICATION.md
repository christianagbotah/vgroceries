# Verification record

This file records the current authoritative verification checkpoints for Variety Groceries. Detailed older prototype/browser history remains available in git history; the records below describe the production backend and the frontend compatibility evidence the current branch actually depends on.

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
