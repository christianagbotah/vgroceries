# Prisma PostgreSQL UTC deadline parity — 15 November 2026

## Confirmed P0 risk

The canonical API uses Prisma 7.10.0 + `@prisma/adapter-pg` and
PostgreSQL `timestamptz` columns for session, invitation, stock and
checkout expirations.

In an isolated PostgreSQL 18 test database with default
`TimeZone=America/Toronto`, persisting a JavaScript `Date` for **60
seconds in the past** via Prisma produced a SQL value **17,940 seconds in
the future**, despite Prisma's own returned `Date` appearing correct.
This happened for Node processes started with both `TZ=UTC` and
`TZ=America/Toronto`. Consequently, SQL `"expiresAt" > now()` could
consider an expired credential still usable.

| Node timezone | Database session timezone | Intended seconds from now | Stored seconds from now |
| --- | --- | ---: | ---: |
| UTC | America/Toronto | -60 | +17,940 |
| UTC | UTC (forced) | -60 | -60 |
| America/Toronto | America/Toronto | -60 | +17,940 |
| America/Toronto | UTC (forced) | -60 | -60 |

The values were measured from PostgreSQL using
`EXTRACT(EPOCH FROM ("expiresAt" - now()))`, **not** round-tripped
DateTimes from Prisma.

## Patch

`apps/api/src/database/database.ts` now configures
`PrismaPg({..., options: "-c timezone=UTC"})`. This instructs each
new pooled PostgreSQL connection to use UTC for the database session,
independent of the PostgreSQL server's default timezone and the Node
process timezone. It retains the existing migration history and all
`timestamptz` schema types, and does not modify database rows.

`apps/api/test/prisma-utc-expiry.spec.ts` requires a disposable database
named `variety_foundation_test` and verifies:

- Prisma connection session timezone is UTC.
- A session expired one minute ago remains expired in raw SQL and
  in the application's Prisma expiry predicate.
- Future web/native session and access-token deadlines are ~15 / 5
  minutes ahead, respectively.
- A cashier invitation's raw SQL expiry is ~48 hours ahead.

This safeguards the canonical API's Prisma connections. It does **not**
automatically patch the separately deployed POS-integrated API on port
3049. **Verified UAT deployment detail:** API 3027 and API 3049 currently
both point to the **same** PostgreSQL database,
`localhost:5432/lightworld_variety_uat`, despite being built from different
source versions. A separate POS PostgreSQL service on port 55436 also
runs, but the 3049 API environment does **not** point at it. Therefore
unpatched DateTime writes from API 3049 can still affect the shared UAT
database. Do not treat a 3027-only release as full remediation. The
production/pickup/payment feature flags are unchanged.

## Remaining operational gates

- Both GitHub CI workflows, the full isolated API regression suite,
  schema drift guard, and a read-only staging database parity check
  must pass before any source-only merge.
- Any live API deployment requires its own immutable-release rollback
  gate, backup and health/authorization smoke tests. Do not alter
  Nginx targets between the separate staging APIs.
- Do not automatically rewrite already stored historical expiries:
  measure any affected UAT sessions/invitations/stock holds using SQL
  clock and determine safe revocation/migration policy first. A read-only
  aggregate on the **shared** UAT database found 13 historical web
  sessions with recorded eight-hour lifetimes (none currently valid),
  one staff invitation with a recorded 48-hour lifetime, and zero POS
  stock holds; it did not expose user identity data. These aggregates
  do not establish that every historical expiry was safe.
- Coordinate a POS 3049 rollout of the same UTC adapter fix, including
  PostgreSQL snapshot, stock/cash regression tests and rollback, or
  deliberately isolate POS to its own database with full data-parity
  review. **Never** redirect the production portal between 3049/3027
  merely to make an endpoint return 200.
- Continue broader audit of database and date comparisons, checkout
  stock holds, guest holds, pickup windows, and other workers.
  Timestamp storage and callback processing outside the canonical
  `Database` provider may use a different connection factory.
- The exact UI display timezone remains `Africa/Accra`; pinning
  database connections to UTC does not change Ghana-local display
  formatting.

Evidence and follow-up: GitHub issue #109.
