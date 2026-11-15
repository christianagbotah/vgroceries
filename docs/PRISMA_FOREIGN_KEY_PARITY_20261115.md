# Canonical Prisma FK parity — 15 November 2026

This is a **source-only** follow-up to recovered historical UAT models
(PR #101, issue #99). It addresses pre-existing constraint discrepancies
tracked in issue #102. It is not a database migration or a production release.

## Verified read-only finding

Prisma introspection of existing UAT PostgreSQL (read-only) showed that
the canonical models lacked 22 existing forward/inverse relationship fields
and 76 relation actions differed from the database representation.
Some existing POS cashier, sale and receipt foreign keys were not declared
in Prisma despite being present in SQL.

This patch reconciles those model-only relationships, without changing
scalar columns, primary keys, migration files, roles or business data.

Read-only comparison with UAT, based on PR #101's model restoration:

| SQL operation | Before | After |
| --- | ---: | ---: |
| DROP TABLE | 0 | 0 |
| DROP COLUMN | 0 | 0 |
| DROP CONSTRAINT | 46 | 0 |
| ADD CONSTRAINT | 35 | 0 |
| DROP INDEX | 0 | 0 |

The earlier canonical main (before PR #101) additionally proposed
five table drops and four POS customer identity column drops.

**Remaining drift:** Prisma still proposes 15 DROP DEFAULT statements
and 26 index renames caused by older naming/default inconsistencies.
These were NOT executed and require explicit review before any new
generated migration. Zero FK drift is not zero total schema drift.

## Prevention and release boundary

The API CI workflow invokes the new read-only script
apps/api/scripts/assert-safe-schema-drift.sh after migrating a fresh
isolated PostgreSQL database. CI fails if generated SQL would drop a
table, column, constraint or index. It never applies that SQL.

Full API security and integration CI remain mandatory. No POS, checkout,
stock, support, payment, SMS, or pickup flag is enabled by this source
change. Continue to keep public Coming Soon unchanged.
