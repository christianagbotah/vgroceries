# Canonical Prisma model-to-database parity — 15 November 2026

This is a **source-only** continuation of historical UAT migration-model
reconciliation (PR #101). Issue #102 tracks the pre-existing discrepancies.
No migration, database mutation, operational privilege or feature activation
is made by this patch.

## Read-only parity findings

Prisma database introspection showed 22 missing forward/inverse relationship
fields, 76 different relation-action declarations, 15 existing database
defaults not described in the Prisma model and 26 historical indexes whose
actual names differed from Prisma-generated names.

This patch describes the already-present SQL accurately in Prisma:
- Add the 22 missing relationship fields.
- Align 76 relation-action declarations with database foreign keys.
- Add 15 existing now() defaults without changing application business data.
- Map 26 existing index names with schema-level explicit index mappings.

Comparison against the original UAT PostgreSQL **without applying any SQL**:

| Proposed SQL operation | Before PR #103 | After PR #103 |
| --- | ---: | ---: |
| DROP TABLE / DROP COLUMN | 0 | 0 |
| DROP CONSTRAINT | 46 | 0 |
| ADD CONSTRAINT | 35 | 0 |
| DROP DEFAULT | 15 | 0 |
| RENAME INDEX | 26 | 0 |
| Other migrations | 0 | 0 |

The SQL output is now precisely an **empty migration**. Before the earlier
PR #101, Prisma had additionally proposed five table drops and four
POS customer identity column drops. Those were already removed by #101.

## Permanent CI guard

The API workflow runs apps/api/scripts/assert-safe-schema-drift.sh
after applying every checked-in migration to an isolated PostgreSQL CI DB.
Using Prisma migrate diff with --exit-code, CI now rejects **any** model-vs-
migrations SQL drift (not only DROP statements). The generated SQL is never
executed. Any future schema change must include a separately reviewed,
safe migration that preserves existing inventory/payment/audit invariants.

## Verification and release boundary

- Prisma schema validation, API compilation and existing API regression suite
  must pass in CI; clean PostgreSQL 17 CI is authoritative for merging.
- Read-only UAT SQL comparison returned only the empty migration marker.
- No production or UAT database schema or rows changed during this patch.
- Do not enable POS, checkout, pickup, payment, SMS or stock-changing flags.
- The public Coming Soon site remains untouched.
