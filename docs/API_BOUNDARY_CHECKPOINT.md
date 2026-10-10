# Independent API-boundary handoff checkpoint

Prepared 10 October 2026. Source reviewed: Z.ai commit
`4260a0d78c7c5c60f73cc6b78a62366018eac9f9` on `main`.
Its [GitHub CI run](https://github.com/christianagbotah/vgroceries/actions/runs/37957563086)
passed. Independent verification of that source also passed lint, strict types,
production build, 32 contracts, 24 HTTP checks and 56 production routes.

Those suites did not establish production REST adapter correctness. The
contracts script used a manual mock-path fetch helper and compared selected
results with the in-process mock. Additional wire tests were required.

## Confirmed defects and corrections

| Area | Reproduced behavior | Corrected behavior |
| --- | --- | --- |
| REST routing | Product detail sent `/catalog/product?slug=farm-eggs`, while OpenAPI specified `/catalog/products/{slug}` | Explicit mapping for all 92 operations; encoded IDs, REST query aliases and separate mock protocol |
| Idempotency | Body keys never reached the header; header-only keys failed validation; contradictory keys were accepted | Normalize before validation, forward either key form and reject contradictions before sending |
| Customer returns | The actual form omitted required `requestedBy`, rejecting submission before the engine | Accept the UI/OpenAPI payload, preserve evidence and keep customer actor assignment on the server |
| Errors | A problem type URI became the code; null errors threw TypeError; incomplete successes returned undefined; bare error messages were discarded | Preserve codes/messages/details, normalize standard failures and reject malformed successes |
| Timeouts | Deadline ended at headers, leaving stalled JSON bodies unbounded | Keep the deadline active through body decoding and always clear it afterward |
| Cached reads | Query delimiters collided; invalidated or older responses restored stale data | Encode query tuples; check the invalidation generation and per-key request order |
| Mutation refresh | Mounted hooks ignored invalidation; bodyless/header-only POSTs skipped invalidation | Subscribe and reload with request ordering; determine mutation from normalized payload and REST method metadata |
| Backend mode | One renderer could select a real API while the other kept mock data; demo routes stayed accessible | Require both URLs together and reject mock requests before any mutation in backend mode |

The prior PR's eight return-stock corrections/tests are retained. All credited
lots are tracked, reversal validates before mutation, zeroed history remains,
expiry is conservative, and incomplete legacy records require reconciliation.

## Verification of the combined corrections

| Check | Result |
| --- | --- |
| Lint and strict TypeScript | Passed with no diagnostics |
| Production build | Passed; 47 static pages generated |
| `bun test` | 35 tests across four files; includes actual HTTP requests for all 92 mapping rows checked against OpenAPI |
| Existing handoff engine suite | 24 assertions passed |
| Contracts against built production server | 32 assertions passed |
| HTTP acceptance against built production server | 24 checks passed |
| Production route sweep | 56/56 HTTP 200 |
| OpenAPI parse, unique IDs and references | Passed; 92 operations, no duplicates or dangling references |
| Customer return browser flow | Actual form created RTN-2004 and refreshed the list |
| Mounted inventory browser check | Stock invalidation event caused a successful refetch |
| Refunds browser check | Data loaded and rendered; no runtime errors across the three scoped checks |

Seventeen HTTP/return cases failed before their fixes, with the mock URL control
already passing. Eight cache/configuration cases failed before their fixes,
with ordinary invalidation already passing. Independent review identified the
overlapping-read and bodyless-POST gaps; both were reproduced test-first,
corrected and independently rechecked. The reviewer reported no remaining
blocker. Rejected return/history and demo-mode mutations preserve state.

`js-yaml` is pinned as a direct test dependency. CI runs the new Bun tests with
lint, strict types, build and the existing four suites. The browser checks use
headless Chromium against the actual built standalone server; they establish
these three flows, not a new full responsive or five-flow acceptance session.

The restored checkout was fully rebuilt and retested before publication.
Worktree root inference produced a nested standalone entry; local HTTP checks
placed static/public assets beside that generated entry. No app build-path
change was required.

## Architecture and remaining implementation

The architecture distinguishes one unique order depletion event from many
allocation movements. Stable variant/location coordination rows protect stock
commands; modules may call services within one transaction. Outbox publication
is at least once with durable consumer dedupe and provider reconciliation.
Introduce backend packages alongside the web app before a separately verified
workspace migration. Public cutover requires one consistent authority.

Web transport uses cookie credentials. The future backend must implement
secure HttpOnly sessions, origin/CSRF checks and appropriate CORS. Native clients
supply bearer credentials through their secure session adapter. No web token
is read from localStorage. These are transport/design boundaries, not working
authentication.

Request schemas cover 16 high-impact operations and selected response models.
Wire tests establish mapping/transport, not 92 live NestJS endpoints. Direct
mock engine tests and mock-path HTTP scripts must be ported/adapted for database
integration. Real PostgreSQL concurrency, providers, identity, native apps and
live AI remain future implementation.

The attached build brief/master prompt assign a frontend prototype to Z.ai.
The later native-mobile and AI requirements are covered by the
[consolidated production design](superpowers/specs/2026-10-09-production-backend-design.md)
and companion backend/mobile/AI documents. No deployment, real payment or
external notification was performed.
