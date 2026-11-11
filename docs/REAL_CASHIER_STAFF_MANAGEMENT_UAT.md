# Variety Groceries — real cashier staff management (controlled UAT)

**Workstream:** Replace fictional staff data on the administrator Team & Roles page with real user accounts, branch assignments and auditable access control.

## Security boundary

The administrator screen at `/admin/team` now uses **real authenticated server records**; it does not read `apiOps.team()` or locally fabricate employees. The new endpoints are:

- `GET /api/v1/admin/staff`: bounded list of actual administrators, inventory managers, cashiers, riders and branch records, with no hashes, tokens or passwords.
- `POST /api/v1/admin/staff`: create **cashier only**, after strict name/email/credential validation and explicit existing active branch grants.
- `POST /api/v1/admin/staff/{staffId}/actions`: administrator-only cashier **branch reassignment**, **activate/deactivate** or **reset password**.

Non-admin callers are forbidden. Existing administrator, inventory-manager, rider and customer accounts cannot be mutated through cashier management. The API does not take a role from the browser when creating an account: it always creates `cashier`. Branch IDs are checked against current *active* location rows at mutation time.

The SQL transaction includes an audit event and revokes the cashier's active cookie and bearer sessions whenever permission, account status or credential is updated. Password hashes use the existing scrypt implementation and are **never** returned in API responses or recorded in audit-event details.

## Private staging walkthrough

The Team & Roles page is currently enabled **only** in the protected synthetic staging build via `NEXT_PUBLIC_POS_COUNTER_UAT=1`. The same username/password perimeter and real administrator identity from the POS UAT guide apply. Do not use this workflow to create actual employees before the invitation and first-login password change flows are implemented.

1. Sign in at `https://pos-uat.varietygroceries.com/staff/login` with a **real staging administrator**, then open `https://pos-uat.varietygroceries.com/admin/team`.
2. Confirm the team table is based on real database accounts, including their active/suspended state and assigned branch IDs. No fictional demo contacts should appear.
3. Use **Create an authorised cashier** with a synthetic name/email, a unique strong **test** password, and at least one existing active branch (e.g., `uat_accra_20261110`). Confirm account creation.
4. Log out, then sign in as that synthetic cashier. Its `/staff/cashier` page must show only assigned tills; `/staff/pos` allows only its own held-cart cash simulation.
5. Sign in as the admin again, select the cashier, modify branch grants and confirm that the cashier's previously authenticated session is invalidated. The cashier must sign in again to obtain current grants.
6. Suspend the cashier: prior sessions must be revoked and future login denied. Reactivate only when a valid active branch remains assigned.
7. Reset the synthetic cashier password: the old session and credential must fail; new credentials must work. Confirm audit entries do not expose passwords.
8. Try opening or managing the page as a cashier, customer, inventory manager or rider and verify that the API blocks those operations. In particular, this workflow cannot modify administrator accounts.

## Current limitations and production release gates

- **Initial passwords are administered directly**; the platform does not yet implement signed, expiring staff invitations, email delivery, forced first-login password changes, self-service password recovery or MFA.
- Staff listings currently cap at 500 results; pagination and filtering are required for large fleets.
- Only cashier accounts can be created or edited. Inventory-manager, rider and administrator lifecycle management needs separate scoped workflows.
- This feature is a draft development slice. No production real-account seeding, production POS write activation or public user migration should result from these changes.
- Real payment settlement, tax/accounting, refunds, backup/restore under production data, support procedures, audit monitoring and formal operational acceptance are separate launch requirements.

## Verified acceptance — 11 November 2026

- The real staff backend compiled and the **4 database-backed staff-management integration tests passed** using the disposable `variety_foundation_test` database. Tests covered administrator-only access, rejection of forged roles and inactive branches, hashed credentials, duplicate emails, branch reassignment, session invalidation, suspension/reactivation, password reset and audit records with no exposed secrets.
- OpenAPI generation succeeded with **147 documented routes**, including exactly the two staff-management paths. The canonical `docs/openapi-foundation.json` was regenerated. GitHub frontend and API CI completed successfully at the feature release candidate.
- A database backup was created before updating the **isolated** staging API and web portal. The staging API returned HTTP **200** on readiness and **401** for unauthenticated staff endpoints; the existing Variety API and public web portal both remained HTTP **200**.
- The HTTPS staging portal was rebuilt with the staff management UI and started under its existing systemd service. It returned **200** at `/admin/team` over localhost; the public HTTPS perimeter still required authentication (**401** for anonymous requests).
- Headless **Chromium, 375px**: logged in as the real staging administrator, rendered `Team & real access` and the existing synthetic cashier account from server data, displayed the genuine create-cashier form, and showed no fictional team grid. The same browser logged in as the staging cashier and confirmed they could **not** enter the administrator page or view the create-account form. Both checks passed.
- **UAT gap:** actual new account creation and mutation were verified in the **disposable integration test database**, not through the administrator browser against the owner-facing staging DB. Interactive owner acceptance of new-account onboarding, branch changes, suspension, resets, and the complete invited-staff experience is still required.

These results do **not** approve production onboarding or real POS activation.
