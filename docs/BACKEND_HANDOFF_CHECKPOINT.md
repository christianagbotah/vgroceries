# Independent backend handoff checkpoint

Prepared 9 October 2026.

## Source reviewed

Z.ai pushed `1ecec885da39926593247a393461590bb7ac64e9` to `main`.
Its [GitHub CI run](https://github.com/christianagbotah/vgroceries/actions/runs/37951056305)
completed successfully. Independent local verification of that exact commit
also passed lint, strict type checking, production build, 24 handoff assertions,
24 HTTP acceptance checks and a 56-route production HTTP sweep.

The production tests ran the actual built Next.js standalone server and the
repository's unchanged acceptance/sweep scripts. The localhost port was supplied
as a script argument. These were not checks against a substitute HTTP adapter.

## Follow-up corrections

The single-item regression cases did not cover complete return reclassification.
Two additional defects were reproduced against fresh seeded stores:

1. A POS return containing toffee and sardines restocked both items. Changing its
   disposition to damaged reversed only the last lot: available physical amounts
   were `199,59` before the return, `200,60` after restock and `200,59` after
   reclassification. One returned item remained saleable.
2. A return spanning an expired original batch and a later batch inherited the
   later expiry. Three returned units became saleable despite unresolved batch
   identity.

The corrected engine tracks every credited lot with its original quantity,
validates every credit before reversing any, and keeps zeroed original lots and
compensating movements. Missing/changed stock and active reservations require
reconciliation. Quarantine/damaged credits now have stock movement records too.
Known original expiry is conservatively preserved using the earliest date.

Independent code review found an additional legacy-state case: earlier inspected
returns may survive hot reload with only the last lot ID or without an original
quarantine-credit movement. Reconstructing the original credits from that ID or
the lot's remaining quantity could leave saleable stock behind or recreate
disposed goods. Reclassification now rejects missing complete stock history
before any mutation. Two failing regressions reproduced those cases before the
guard was added; both then passed.

The reviewer independently reran all eight return tests, confirmed the legacy
finding resolved, and reported no remaining blocking findings in the code delta.

`disposition.lotId` remains available for existing clients;
`disposition.stockLots` carries the complete set. These are additive mock
contracts, not PostgreSQL migrations.

## Verification of the follow-up code

| Check | Command or method | Result |
| --- | --- | --- |
| Lint | `npm run lint` | Passed |
| Strict TypeScript | `tsc --noEmit --incremental false` | Passed, zero diagnostics |
| Production build | `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 NEXT_TELEMETRY_DISABLED=1 npm run build` | Passed, 47 static pages generated |
| Full Bun test suite | `bun test` | 8 tests passed |
| Existing handoff regression suite | `bun scripts/handoff-regressions.ts` | 24 assertions passed |
| Production HTTP acceptance | `bash scripts/acceptance-checks.sh <local-production-api>` | 24 checks passed |
| Production route sweep | `node scripts/route-sweep.mjs <local-production-origin>` | 56/56 HTTP 200 |

Five new cases failed for their intended stock/expiry reasons before the fix;
the single-known-expiry control already passed. After the fixes all eight passed:
multi-item saleable reversal, quarantine reversal with retained history,
mixed-expiry handling, exact single-batch expiry, moved-stock rejection and
reservation protection without partial reversal, and both incomplete legacy
history cases. CI now runs the new tests.

The isolated worktree build inferred its parent workspace root and produced a
nested standalone server entry. Local HTTP verification used that generated
entry and placed static/public assets alongside it. This environment detail did
not require changes to the application's production build configuration.

No fresh browser hydration/responsive session is claimed by this checkpoint.
The route sweep establishes HTTP availability; Z.ai's recorded browser checks
remain its own verification record. Real multi-process concurrency, trusted
authentication, durable storage, providers and AI remain future backend work.

## Backend direction and remaining boundaries

The [written production design](superpowers/specs/2026-10-09-production-backend-design.md)
defines NestJS/PostgreSQL, shared versioned web/native APIs, Redis/BullMQ workers,
permissions, stock/financial transactions and provider-neutral grounded AI.
It is ready for owner review. The first implementation plan will cover the backend
foundation, identity, catalogue and availability, followed by commerce authority.

The prototype cannot verify expiry when an original sale has no recorded batch
allocation. Production return inspection must capture provenance and quarantine
perishables with unknown dates. Variant-level mock reservations deliberately
block reclassification conservatively; the backend will reconcile precise lot
allocations. Mock data remains single-process and resettable.

No deployment or external payment/courier/notification action was performed.
