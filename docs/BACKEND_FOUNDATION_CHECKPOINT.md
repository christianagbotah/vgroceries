# Backend foundation checkpoint — 10 October 2026

Base: `main` at `0103498af84b09193527080a67fc522241d09536` after merging PR #1.
Branch: `codex/backend-foundation-20261010`. This checkpoint records local
verification of the foundation PR; hosted CI results belong to the PR checks.

## Delivered scope

- Independently installed NestJS API under `apps/api`, with its own npm lockfile,
  Node 24 runtime and PostgreSQL migration. The web dependency graph is unchanged.
- One framework-free contract package under `packages/contracts`; existing web
  paths remain re-exports. Shared response schemas include web/native identity,
  public catalogue and location-scoped inventory.
- Durable web cookies, CSRF/origin checks, native token rotation/reuse revocation,
  login budgets across replicas, and fresh role/grant checks on protected requests.
- Persistent public catalogue/availability and protected receiving. Receipt,
  exact decimal lots, movement history, idempotent outcome, audit and outbox commit
  atomically. Append-only history is enforced by PostgreSQL.
- An OpenAPI document for all 13 implemented routes, including concrete identity
  responses, cookie/bearer security, stock location query parameters and receipt
  commands. The broader 92-operation specification is still a future target.
- Explicit owner/bootstrap and non-production preview seeding, operational guide
  and an independent API CI job using PostgreSQL 17.

## Verification actually performed

Local API checks used Node 24.19.0 and real PostgreSQL 17.6 over TCP. No in-memory
repository or mocked Prisma transaction replaced the database. Test databases
were disposable and isolated from any real business data.

| Check | Observed result |
| --- | --- |
| API build + real HTTP/PostgreSQL integration suite | 40/40 passed |
| Clean API-only installation, contracts build, Prisma generation and API compilation | Passed outside the web repository dependency ancestry |
| Fresh empty database migration through the independently installed Prisma CLI | Passed |
| Owner CLI, duplicate creation refusal and hashed password storage | Passed |
| Preview seed retry after stock changed; production seed refusal | Passed; no replenishment or duplicate receipt/history/events |
| Independently installed API process startup, owner authentication and exact persistent stock read | Passed |
| Root ESLint and strict TypeScript | Passed, zero diagnostics |
| Web production build | Passed; 47/47 static pages generated |
| Root Bun tests | 35/35 passed |
| Existing engine regressions | 24/24 passed |
| Shared contracts against built web server | 32/32 passed |
| HTTP acceptance against built web server | 24/24 passed |
| Built web route sweep | 56/56 HTTP 200 |
| Scoped browser checks | Actual customer return form/list refresh, mounted inventory invalidation/refetch, and refunds render passed with no runtime errors |
| Foundation OpenAPI references and operation IDs | 13 operations; all references resolve, no duplicate IDs |
| Full API npm dependency audit | Zero reported vulnerabilities at verification time |

## Independent review and resulting regressions

The independent review exposed an undeclared direct Zod dependency, a race when
concurrent distinct receipt keys first created a stock position, and incomplete
OpenAPI response schemas. A clean isolated build reproduced `TS2307`; direct
Zod declaration/lock now passes that same installation. The receiving regression
reproduced six failures among eight simultaneous valid requests. Conflict-safe
SQL position creation followed by ordered row locking now passes three rounds
of eight distinct receipt keys across two API instances, preserving every lot.

A further HTTP regression exposed a literal colon treated as a route parameter:
an unintended URL reached variant lookup. The escaped route now accepts only its
documented command URL. OpenAPI completeness and live shared-response conformance
have explicit assertions. Database outbox fault injection proves receiving
rolls back all effects; the resulting sanitized HTTP 500 log is expected in the
successful test suite.

Two implementation rulings are explicit: `admin` represents the business owner
and can access every active stock location, while inventory managers require
stored grants; patched backend dependency versions and transitive overrides
replace audited vulnerable versions, with API and Prisma CLI compatibility
checked. Both decisions are recorded in the implementation plan/operational guide.

## Next milestone and boundaries

This foundation is a private integration milestone. Public web cutover, orders,
POS stock allocation, real payments/refunds, delivery, full staff CRUD, account
recovery/MFA, queue publishing, native screens and AI inference remain subsequent
work. Outbox persistence does not imply a running publisher or exactly-once event
delivery. The frontend cannot be pointed at the partial API for a live shop.

Next: port transactional reservation/order/POS commands and their concurrency
regressions before payment providers or public activation. Native clients reuse
the shared contracts and authenticated API. Future AI tools use the same guarded
business commands, with audited proposals and explicit approval for consequential
actions, as described in the existing architecture spec.

Setup: [BACKEND_FOUNDATION.md](BACKEND_FOUNDATION.md).
Implemented HTTP contract: [openapi-foundation.json](openapi-foundation.json).

## Commerce reservation core follow-up — 10 October 2026

The first Commerce Authority slice is now implemented internally on top of the
foundation. `AllocationService` is inventory-owned and shared by future orders
and POS; no public reservation/allocation controller was added. Reservations are
lot-specific, FEFO, exact-decimal, location-scoped, safety-stock aware and created
under stable PostgreSQL row locks. Multi-line shortages roll back the whole claim.
Release and expiry are once-only state transitions. Allocation, audit and outbox
records share the caller transaction.

Measured evidence on this branch before the final root verification:

| Check | Observed result |
| --- | --- |
| Foundation baseline | 40/40 API tests passed |
| Current API suite after allocation/event work | 52/52 passed |
| Allocation-focused suite | 7/7 passed |
| Final-unit concurrency | 10 rounds across two independent API/Prisma instances; one winner and one `OUT_OF_STOCK` loser every round |
| Multi-line shortage | No stray reservation committed |
| Safety stock / unsaleable lots | Protected; expired/today/quarantined/damaged lots excluded |
| Injected allocation outbox failure | Reservation, audit and outbox all rolled back |
| Fresh empty database migration | Foundation + commerce migration applied successfully |
| Implemented OpenAPI | Still 13 HTTP operations; no reservation/allocation route |

The public web remains on demo transport. Orders/checkout, POS, stock handover,
payments/refunds, delivery and queue publishing are not made production-authority
by this slice. The next backend plan must create durable online orders by calling
the shared allocator; it must not introduce another stock-reservation path.

Detailed invariant and API notes: [COMMERCE_RESERVATION_CORE.md](COMMERCE_RESERVATION_CORE.md).
