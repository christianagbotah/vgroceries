# PostgreSQL UTC deadline runtime gate — 18 November 2026

**Source-only, not deployed.** Follows P0 [issue #109](https://github.com/christianagbotah/vgroceries/issues/109). No production PostgreSQL rows, secrets, sessions, stock or service configuration changed.

## Why

The existing PrismaPg connection option `-c timezone=UTC` prevents an observed non-UTC timestamp-shift bug. Expired customer sessions, cashier invitations, password resets and POS stock holds must never become valid merely because a connection uses the wrong timezone. Source configuration alone is not runtime evidence.

## Guard

On NestJS `Database.onModuleInit`, immediately after connecting, query the **actual Prisma session** via `SELECT current_setting('TimeZone')` and compare PostgreSQL `clock_timestamp()` epoch against JavaScript time. Reject anything except the explicit `UTC` session name, one valid clock sample and absolute skew at most 60 seconds. A rejected check disconnects the Prisma client and prevents API startup. No credentials, user information or connection strings appear in error messages.

Each new pooled connection still receives `options: "-c timezone=UTC"`. This startup sample does **not** independently prove every future connection or historical row is correct and must not substitute for the integration tests or on-host SQL-clock checks.

## Verification

- Pure Bun tests: `bun test scripts/db-utc-startup-guard.test.ts`, including non-UTC, malformed evidence, ±60s skew and DST boundary cases.
- CI's disposable PostgreSQL database: after the existing full API suite, rerun the isolated deadline tests under `TZ=America/Toronto` to guard against the known time zone failure class. Keep the CI database disposable; do not apply these tests to UAT or production.
- Require both hosted API foundation and frontend CI to pass. Test the exact POS 3049 packaged release independently, since the public portal uses a different API artifact from canonical main. Both POS source and POS API deployment **currently contain** `-c TimeZone=UTC` (observed 18 November), but this is not a live SQL proof.

## Release boundary

Hubtel status API remains blocked with HTTP 403 and must remain disabled. No cutover of 3049/3052, Coming Soon, order operations or backend feature flags is authorized by this patch. Existing records with historical timestamps must be audited separately rather than rewritten automatically.
