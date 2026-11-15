# 15 November 2026 — exact migration-history reconciliation

## Why this change is necessary

The configured Variety Groceries UAT PostgreSQL database has **seven
successfully applied migrations** whose SQL files are absent from the
current canonical GitHub `main` branch. `prisma migrate status` therefore
reports a divergent history even though the UAT API is healthy. It is
unsafe to guess that the database can be upgraded by regenerating keys,
running `prisma migrate dev`, force-repairing the table, or using
`prisma db push`.

The database's last shared migration with `main` is
`202611090038_pos_immutable_cash_receipts`. **Exactly one new migration**
`202611150041_pickup_attendance_audit` is pending from merged PR #97.
The other seven are **already applied**, not pending.

## Recovery method — exact SQL, no schema mutation

The seven directories in this PR were restored verbatim from the
`feat/role-voice-staging-20261113` branch, where they are also present
in the authorized UAT POS-integrated development workspace. For each
migration, the SHA-256 digest of its `migration.sql` bytes was compared
against the corresponding successfully applied record in UAT's
`_prisma_migrations.checksum` column. **All seven were exact matches.**

- `202611100039_pos_cashier_read_role`
- `202611100040_pos_cashier_scoped_cash_sales`
- `202611120041_staff_cashier_invitations`
- `202611130001_customer_support_cases`
- `202611140001_inventory_adjustment_approval`
- `202611140002_self_service_password_recovery`
- `202611140003_pos_customer_identity`

This is a **source-history restoration only**. It does not deploy
corresponding unfinished POS/customer-support/password-recovery business
features; no runtime flags are changed. The original SQL is unchanged.
No database migrations, data repair or Prisma migration-table edits
are performed by this PR.

## Essential safety gates

1. CI must create a **fresh isolated PostgreSQL test DB** and apply the
   complete migration sequence successfully, then run the full API and
   security suites.
2. Verify the canonical Prisma schema remains compatible with the
   existing UAT schema. These recovered migration files include database
   structures for which source models and business code are still being
   developed on other branches; **this PR is not a full schema/application
   merge**. Reconcile those models before shipping their associated
   features or creating further Prisma migrations.
3. Back up and validate the live UAT database, then run read-only
   `prisma migrate status`. Only
   `202611150041_pickup_attendance_audit` should remain pending.
4. Never automatically run `migrate deploy` while status has
   unexpected divergence. After the recovery is merged and independently
   accepted, the additive attendance migration requires a separate
   protected deployment and rollback decision.
5. Keep `PICKUP_ATTENDANCE_ENABLED=false`,
   `LOGISTICS_CUSTOMER_PICKUP_ENABLED=false`, payment activation OFF,
   and the public Coming Soon page unchanged.

The verified database backup for the protected attendance rollout
is kept privately on the VPS. Do not copy credentials, database contents,
or customer information into GitHub.
