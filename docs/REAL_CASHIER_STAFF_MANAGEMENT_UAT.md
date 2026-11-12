# Variety Groceries — real cashier onboarding and invitation UAT

**Date:** 12 November 2026 · **Status:** development branch and isolated, privately accessible staging; no production activation.

## How cashier onboarding now works

A real administrator creates a cashier account in an inactive, invitation-pending state. The administrator supplies a name, email, optional phone and one or more **active** branch grants. The system then generates a **64-character, cryptographically random, one-use invitation code** with a **48-hour expiry**. Only a SHA-256 digest is stored; the raw code is returned exactly once to the administrator.

The administrator shares the code privately with the intended **synthetic UAT** cashier. The cashier opens `/staff/activate`, enters that code and chooses a password (12–256 characters) they do **not** share with the administrator. Only a valid, unused, unexpired code for an inactive cashier with a currently active branch can activate the account. Invitation acceptance does not automatically create a session; the cashier signs in normally after activation.

**No email or SMS delivery is connected.** The administrator must manually share the one-time code using an approved private channel. Do not place codes in URLs, public chats, repositories, logs or receipts. An administrator can reissue a pending/expired/revoked invitation using the same email; the old code stops working immediately.

Invitations cannot turn an existing administrator, inventory manager, rider or customer into a cashier. A pending cashier cannot bypass the invitation by using the administrator's activation or password-reset buttons. Suspending a pending invitation revokes it; an explicit fresh issue is required to proceed.

## Release switches

- `STAFF_MANAGEMENT_ENABLED=true`: explicitly enables the three administrator routes and the public activation route on a particular API environment. **Default OFF**.
- `STAFF_DIRECT_CASHIER_CREATE_ENABLED=true`: allows the old administrator-issued-password creation route **only for separately authorized legacy test fixtures**. **Default OFF**, including private staging.
- `NEXT_PUBLIC_POS_COUNTER_UAT=1`: shows real staff test screens in the **private staging frontend only**. It is **not** a substitute for server-side authorization.
- Production POS checkout transaction feature switches remain OFF; this onboarding work does not authorize live sales.

## Exact API paths

- `GET /api/v1/admin/staff`: list real staff and locations; admin only.
- `POST /api/v1/admin/staff/invitations`: issue or reissue a cashier invitation; admin only, CSRF-protected for web sessions.
- `POST /api/v1/auth/staff-invitations/accept`: origin-restricted public code redemption with rate limiting. No existing staff session needed.
- `POST /api/v1/admin/staff/{staffId}/actions`: branch changes, suspension/reactivation, password reset. All existing staff sessions are revoked on changes; admin only.
- `POST /api/v1/admin/staff`: legacy direct creation, disabled unless **both** server switches explicitly permit it.

The user-facing responses never expose password hashes or audit secrets. A successful invitation issuance response contains the raw activation code **once**, and the cashier activation response returns only `activated: true`.

## Testing on the private HTTPS staging site

The HTTPS perimeter and the existing staging admin credentials are required. Never use actual employees or business passwords.

1. Sign in at `https://pos-uat.varietygroceries.com/staff/login` as the **staging administrator**.
2. Visit `https://pos-uat.varietygroceries.com/admin/team`. Confirm the page uses genuine database rows, not fictional demo employees.
3. Enter a synthetic full name/email, choose an active branch (the sample Accra location is `uat_accra_20261110`), and click **Issue cashier invitation**. Copy the one-time code while visible and note the expiry.
4. On a separate browser session, open `https://pos-uat.varietygroceries.com/staff/activate` and enter the code, new password and confirmation. A successful activation should instruct you to sign in, rather than signing you in automatically.
5. Sign in as the invited cashier. Confirm they can access their assigned cashier reports and synthetic POS checkout, but not the administrator Team & Roles page or other branch data.
6. Try redeeming the same invitation a second time: it must fail. Reissue a pending invitation and verify the superseded code no longer works. Expired invitations must be rejected.
7. As admin, reassign the active cashier, suspend or reset their password, and verify existing sessions become invalid. A pending invitation suspended by an administrator must also be invalidated.
8. Test the legacy direct-create endpoint with staff management enabled but direct creation disabled: the server must return `503 FEATURE_DISABLED` without creating an account.

## Safety and launch gaps

- Activation is a bearer-code handoff, not identity proof or automatic email/SMS verification. No actual invitations should be sent to customers or real employees before approved identity, communications and support procedures exist.
- Recovery for lost codes is an **administrator reissue**, not an emailed reset link. No self-service password recovery, mandatory MFA, or verified first-party delivery is implemented yet.
- Staff listing currently caps at 500; pagination and large-business workflows remain.
- Only cashiers are managed by this workflow; managers and riders need separate least-privilege onboarding.
- On-host backups and restore drills exist for synthetic staging; encrypted **off-host** backups and production recovery objectives are still open.
- Real checkout provider settlement, tax/accounting, returns/refunds, production inventory, and formal release acceptance remain separate workstreams.

See [POS_PRIVATE_STAGING_TEST_GUIDE.md](POS_PRIVATE_STAGING_TEST_GUIDE.md) and [POS_STAGING_OPERATIONS_RECOVERY.md](POS_STAGING_OPERATIONS_RECOVERY.md) for the existing cashier/till testing and disaster-recovery boundaries.
