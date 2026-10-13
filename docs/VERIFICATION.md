# Verification record

This file records the current authoritative verification checkpoints for Variety Groceries. Detailed older prototype/browser history remains available in git history; the records below describe the production backend and the frontend continuation wave that the current branch actually depends on.

## Fulfilment + Stock Handover Authority — 13 October 2026

**Branch:** `feat/fulfilment-handover-20261012`  
**PR:** `#12`  
**Verified implementation SHA:** `f07f86c098460285e9b73a8963d3fad5204b99c6`  
**PR base at verification:** `7723f457b87fa4722da317013d31f225506d166b`

GitHub's pull-request workflows tested the synthetic merge commit `289e11a01c4372d9da9efd06d51e43eda1bfd94d`, which merged the verified implementation head into the PR base. Both required workflows associated with the implementation head completed successfully:

- **API foundation** — run `38381491344`: success
- **CI** — run `38381491392`: success

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
| API integration/security/concurrency suite | **267 passed, 0 failed** |
| Production OpenAPI | **35 paths** |
| OpenAPI deterministic regeneration | **PASS — two byte-identical generations** |
| Committed OpenAPI drift check | **PASS** |

The passing API suite includes the new authority-boundary and race scenarios: exact reservation coverage, immutable lot provenance, exactly-once depletion, multiple reservations sharing a lot, physical shortage atomicity, quarantine/expiry rejection, outbox rollback, paid delivery handover, collection handover, eligible delivery COD handover, unpaid/uncertain electronic-payment blocking, pack-without-depletion, shortage/lost-reservation pack blockers, admin-only seven-route workflow, handover-vs-handover race, pack-vs-cancellation race and handover-vs-cancellation race.

### Root CI / frontend compatibility gate

Observed results from CI run `38381491392`:

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

### Pre-merge query-authority regression

The mandatory pre-merge review found a projection/command inconsistency: `FulfilmentQueryService` selected each reservation stock position's `variantId` but a dead condition did not compare it with the order-line variant. Command-side `ClaimCoverageService` already failed closed, but the queue/detail projection could advertise an action before the command rejected corrupted reservation provenance.

A regression test was added at `apps/api/test/fulfilment-query-variant-authority.spec.ts`. Commit `0b470e5694832611db75166640f600c106fb3141` produced the required RED evidence in API-foundation run `38395350376`: **268 tests ran, 267 passed, 1 failed**, and the only failure was the new variant-mismatch projection test. The minimal source fix is commit `1097b4947f7631baf77ad6f8d2cdd20aeac31d82`, which makes the query authority compare `line.variantId` with `row.position.variantId` and fail closed with `reservation_lost`. Exact-head GREEN evidence for the post-fix branch is intentionally not claimed in this paragraph until the normal PR workflows execute successfully.

## Proven stock-handover invariants

The current backend verification establishes these boundaries:

- picking and packing never decrement physical stock;
- delivery consumes stock at dispatch handover;
- collection consumes stock at customer handover;
- exact active reservation coverage is required before depletion;
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
