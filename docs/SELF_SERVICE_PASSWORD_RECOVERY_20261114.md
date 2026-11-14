# Variety Groceries — self-service password recovery

**Deployed to:** https://portal.varietygroceries.com
**Production:** https://varietygroceries.com remains **Coming Soon**. No public launch is authorised.

## User request

Customers, cashiers, inventory staff, administrators and other *real* users need a **Forgot password?** link in their login screen and a secure way to reset a forgotten password without knowing the old one. Staging's one-click **sample demo profiles** do not have passwords and must remain separate from recovery of live accounts.

## Current UI

- Both `/account/login` and `/staff/login` show a **Forgot password?** link.
- `/forgot-password` accepts the account's registered email, has a generic confirmation even if no account exists, links to customer/staff login and to customer support for phone-only accounts.
- `/reset-password` accepts a token from the **URL fragment** (`#token=...`). The fragment is removed from the browser address bar on load, so it is never sent in an HTTP GET or access log. It validates matching passwords with a 12–256 character limit.
- The result confirms that all existing sessions were revoked and provides fresh login links. Expired, reused and invalid links cannot reset the password.

## Backend / security

- Public `POST /api/v1/auth/password-reset/request` accepts a strictly validated, normalised email. It requires a trusted browser Origin and rate-limits by hashed email (3/15m) and IP (40/15m). Unknown, inactive and synthetic `@example.invalid` / `@example.test` addresses produce the same generic response without sending an email or revealing whether an account exists.
- Public `POST /api/v1/auth/password-reset/complete` requires a 256-bit random raw secret and a new password, with trusted-origin and rate limits.
- A new `PasswordResetToken` PostgreSQL ledger stores **only SHA-256 token hashes**, a user reference, creation/expiry timestamps and a consumed timestamp. Links expire in **20 minutes** and are single-use.
- Successful completion atomically updates the existing scrypt password hash, consumes all outstanding reset tokens for that user, revokes **all web and native sessions**, and creates an audit event. Replay with the same code fails.
- No recovery token is placed in browser localStorage, server access-log URLs, API audit payloads or committed configuration.
- A subsequent email request invalidates earlier recovery links only **after** the new mail is accepted by the delivery transport. A failed message handoff does not invalidate an earlier valid link.
- The email transport is the local Exim-compatible sendmail wrapper. Its sender and public origin are configured in the **actual** systemd environment file `/home/lightworld/config/varietygroceries/consolidated-staging-api.env`. A separate legacy `api.env` also exists but does not govern the running staging unit.
- The sender uses the Lightworld business mailbox address. The service intentionally returns an error globally if its required delivery settings are absent, rather than claiming a reset email was sent.
- A customer who registered using **only a phone number** does not yet have a verified SMS OTP reset option. They are directed to customer support for identity-verified recovery. Phone-only self-service OTP via Hubtel remains a separate integration requirement.
- **Production hardening:** Verify email ownership at registration and on email-address changes before relying on email as a recovery identifier for customer accounts. SMTP/Exim inbox deliverability, SPF/DKIM and reply handling must be tested with an authorised test mailbox before public launch. A queued email is not proof of inbox delivery.

## Acceptance

- Migration `202611140002_self_service_password_recovery` applied to a **separate isolated PostgreSQL test database** first; then to original staging only after mode-600 backup `/home/lightworld/backups/varietygroceries-stage-consolidation/portal-before-password-recovery-20261114.dump`. No existing passwords or orders were changed by migration.
- Isolated full transaction QA passed: strict schemas, generic response for unknown accounts, generated email with correct fragment link and 20-minute expiry, only hashed secret in DB, invalid-link rejection, new password validation, web+native session revocation, audit event, one-time consumption, replay refusal and a later successful request.
- Permanent identity security and strict API contract tests passed **6/6** with the isolated PostgreSQL environment.
- Backend and Next.js optimized frontend builds and TypeScript passed; targeted frontend lint passed.
- Both customer and staff login pages show **Forgot password?** and both public recovery pages return HTTP 200 on canonical staging.
- Staging OpenAPI includes the two new paths (**162 documented paths**); original staging API readiness HTTP 200.
- Corrected live systemd configuration after a preflight caught an HTTP 503; a non-existent staging test email with proper Origin now returns the generic success response (**HTTP 201**) without any real mail sent.
- Both staging services remain active; original public shop works without login; production root remains **Variety Groceries — Coming Soon**.
- **Unverified delivery limitation:** No actual inbox receipt of a recovery email has yet been independently confirmed. The local Exim service is running, but previously had queued bounce messages. Verify deliverability with the intended mailbox before claiming production-ready recovery.

## Operator test

1. Open the canonical staging Customer or Staff login and select **Forgot password?**.
2. Enter the **registered email of an actual account** that you control (not a synthetic demo profile).
3. If an email arrives, open its reset link within 20 minutes; set and confirm a different 12+ character password.
4. Confirm the old password no longer signs in, the new password does, previously logged-in sessions are revoked and the same reset link cannot be reused.
5. For phone-only customers without a registered verified email, use the support recovery path pending a proper phone OTP integration.

No user-specific addresses, recovery codes, credentials or private configuration values are committed.
