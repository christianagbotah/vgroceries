# Cashier invitation and branch-grant authority — 15 November 2026

## Implemented slice

A dedicated, **real-user** cashier onboarding workflow built upon the
`StaffInvitation` PostgreSQL model and historical migration that are
already part of the canonical repository. This changes no production
database schema and introduces no new data migration.

- `GET /api/v1/admin/staff`: real staff roster and branch assignments
  with capped results, admin only, no credentials or password hashes.
- `POST /api/v1/admin/staff/invitations`: admin-only creation or
  reissue of an inactive cashier identity and active branch grants.
  Returns a 64-character code once. **Only its SHA-256 digest** is
  persisted. Code lifetime is 48 hours. No delivery by email, SMS or
  WhatsApp is claimed; an operator must convey it securely.
- `POST /api/v1/auth/staff-invitations/accept`: public *Origin-bound*
  code redemption, bounded IP attempts, strong new cashier-chosen
  password and one-time atomic claim; does not automatically log in.
- `POST /api/v1/admin/staff/{staffId}/actions`: admin-only cashier
  branch reassignment or suspend/reactivate. Cannot change an admin,
  inventory manager, customer or rider; cannot reactivate an unaccepted
  invitation; every change revokes existing cashier sessions.
- Real administrator team form and cashier activation page are separated
  from the sample/demo staff transport; cashier then uses the already
  merged authenticated read-only workspace from PR #104.

## Security properties

The administrator cannot choose a cashier's password in this release.
There is **no direct account-creation POST** or admin password reset
action. Email and branch IDs are strictly validated, branch IDs must
be active and unique, session identity and role come from the server.
An invitation can be redeemed only once. Reissuing a pending code
invalidates the earlier code; conditional DB updates serialize reissue
and activation and fail closed on an already-accepted identity.
Inactive or revoked branch users cannot use the cashier workspace.
There is no automatic inventory, POS, tax, payment or refund authority.

## Gates and defaults

The API flag `STAFF_MANAGEMENT_ENABLED` is **false unless exactly
'true'**. The frontend flag
`NEXT_PUBLIC_STAFF_ONBOARDING_UAT` is **disabled unless '1'**.
Both must be explicitly enabled in a *private, approved* staging
environment, after code review and live-role acceptance.

The backend flag alone never enables POS till, stock hold, cash-sale,
Hubtel, refunds or public launch. All remain under their own gates.
The public Coming Soon website must stay unchanged.

## Acceptance checklist

1. Full API and client compilation, OpenAPI generation, full GitHub CI.
2. Isolated PostgreSQL regression: admin/cashier authorization,
   inactive/invalid branches, one-use code, expiry, reissue,
   concurrent acceptance, wrong origin, forbidden fields and account
   activation; session revocation after branch change/suspension;
   feature OFF by default.
3. Rehearse admin UAT with **fictional test identities**:
   invite, pass one-time code privately, activate on phone, log in,
   open cashier read-only workspace, revoke branch, verify 403.
4. Verify audited invitation lifecycle and throttling. Do not log
   codes, store them in tickets or include in screenshots.
5. Confirm database migrations and backup/rollback safety before
   enabling the flags on staging. Record named staff owner signoff.
6. Separate operational approval remains necessary for real sales,
   physical stock handover, cash receipt/till reconciliation, actual
   provider-based payments, tax and production storefront cutover.

If a code is intercepted, **reissue** it to invalidate the previous
pending code. Suspending a pending cashier revokes the invitation.
Do not disclose or reuse administrators' live credentials in UAT.
