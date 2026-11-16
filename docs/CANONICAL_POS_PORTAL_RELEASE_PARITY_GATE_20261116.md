# Canonical POS portal: fail-closed legacy release gate (16 November 2026)

## Why this exists

Issue #108 records a critical source/runtime split. The public staging hostname
`portal.varietygroceries.com` serves the POS-integrated portal on **3052** and
the POS-integrated API on **3049**. The older
`deploy/scripts/rollout-portal-live-api-uat.sh` would instead reconfigure the
portal and API to **3037** and **3027**. A routine execution could hide POS,
cashier, customer-support or staff screens and bypass their matching backend.

The old rollout script is now **blocked by default before creating temporary
backups, overwriting a configuration file, swapping a symlink or restarting
anything**. Its approval helper performs no database, network, or service
operations.

## Release prerequisites (human-reviewed, not automatically proven)

Do **not** create an approval file until authorized operators have:

1. Compared all live POS-integrated API and frontend routes, model/contract
   differences and pending uncommitted POS work against the proposed immutable
   portal/API release pair. Preserve all active UAT checkout, cashier, identity,
   support and inventory behaviours; never silently substitute canonical main.
2. Tested customer, cashier, inventory and administrator role isolation,
   invitations and revocation; POS till/quote/hold/cash-sale; reservations,
   expiry, cash reconciliation, returns, delivery and mobile presentation.
3. Confirmed all 47 database migrations, current schema drift, full backups,
   an **isolated restore rehearsal**, and rollback of both API and portal.
4. Confirmed correct upstream routes, origin, cookies, health checks and
   approved flags. **Do not activate** live Hubtel transactions, SMS,
   stock-changing, COD, pickup or refund functionality as part of this gate.
5. Given explicit release-specific sign-off for the deliberate
   **3049/3052 → 3027/3037** cutover, knowing the current POS staging app will
   be replaced. Public Coming Soon remains unchanged.

## One-time, root-controlled release-pair authorization

Only after those checks, the authorized operator may create a root-owned,
mode `0600` JSON file **outside the repository**, containing exactly these keys:

```json
{
  "schema_version": 1,
  "action": "REPLACE_CANONICAL_POS_STAGING_WITH_LEGACY_3027_3037",
  "approved_by": "Full name of authorized release reviewer",
  "approved_at_utc": "2026-11-16T12:00:00Z",
  "portal_source_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "api_source_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "portal_port": 3037,
  "api_port": 3027
}
```

The example timestamp and SHAs are illustrative **only** and must be replaced
with the approved UTC time and real 40-character commit IDs embedded in
`BUILD_SOURCE_GIT_SHA` in each packaged release. Approval expires after 24h;
timestamps more than five minutes in the future are rejected. Unapproved
routes, missing release markers, extra fields, invalid owners, permissions
other than `0600`, and mismatched SHAs fail closed.

The legacy script accepts `PORTAL_CUTOVER_APPROVAL_FILE` (path to the protected
file) and `API_RELEASE_DIR` (the exact reviewed release directory, defaulting
to the original API current symlink). It still requires `PORTAL_RELEASE_DIR`.
The helper must print a successful release-pair check **before** the script
begins its existing backup/restart workflow. Destroy the approval file after
the controlled rollout, and record the ticket, reviewer and release SHAs in
the operational audit record.

This is a deliberate manual release authorization, **not** a cryptographic
signature, a full feature-parity scanner, or permission to go live. Existing
two-person approvals, backups, restore proof, UAT checks and external-provider
gates remain mandatory.

## Verification

Run from the repository root:

```bash
bash -n deploy/scripts/rollout-portal-live-api-uat.sh
python3 -m py_compile deploy/scripts/assert-canonical-portal-cutover.py
bun test scripts/portal-canonical-parity-gate.test.ts scripts/portal-live-api-rollout-regressions.test.ts
```

In source-only development, do not execute the rollout script or create a real
approval file. The automated tests use only disposable local files.
