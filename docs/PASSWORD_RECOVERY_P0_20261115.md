# Variety Groceries — Self-service password recovery P0 (15 November 2026)

## Intended operation

A customer or existing staff member with a registered email may request a
single-use reset link. The UI and API remain **OFF by default**. When explicitly
enabled, the backend accepts a trusted-Origin request and returns the same
account-neutral message whether an email matches an eligible user or not.
Only eligible active identities receive an email. Phone-only customers must
seek separately verified support; no identity proof is invented.

The reset email uses a token in the URL **fragment**, not a query parameter.
A SHA-256 token digest is saved in `PasswordResetToken`. Tokens expire after
**20 minutes using PostgreSQL server time**, independently of the Node host's
local timezone. Completion requires the unconsumed token and a 12–256
character new password, changes the stored scrypt hash in one transaction,
consumes the user's pending reset tokens, revokes all their web/native sessions
and records an audit event. No session is issued automatically.

## Security and deployment gates

- Server flag `PASSWORD_RECOVERY_ENABLED` is exactly `true` to activate.
  Unset/false rejects both endpoints with 503 **before account lookup**.
- Public UI flag `NEXT_PUBLIC_PASSWORD_RECOVERY_UAT` must equal `1` to
  display the request/complete forms and sign-in links; OFF by default.
- Exact trusted browser `Origin` required; independent IP/recipient throttles.
- Email delivery requires a properly validated `PASSWORD_RESET_FROM`,
  `PASSWORD_RESET_PUBLIC_ORIGIN` contained in trusted origins, and an
  available absolute-path sendmail-compatible program at
  `PASSWORD_RESET_SENDMAIL_PATH`.
- No SMTP, SMS, Hubtel, MoMo or email transport is asserted to work in
  production. Local tests use `/usr/bin/true` to avoid outbound emails.
- Test with synthetic addresses and a controlled private mailbox before
  release, then verify real message delivery, SPF/DKIM/DMARC, link opening
  on mobile, subject/body, throttling and password rotation, and old-session
  revocation. Enable only after written operator approval.
- Do not route the public POS-integrated portal (currently API 3049/portal
  3052) to the main API (3027); the environments are separate and have
  different capability/authorization sets. Any portal cutover needs its own
  parity and cookie/session review.

## Clock-safety regression

During isolated PostgreSQL testing on a Node/pg deployment with local
`America/Toronto` timezone, a Prisma-written `DateTime` deadline intended
to be expired was persisted about **five hours in the future**. This would
make credential expiry checks unsafe if implemented with application Date
values. Recovery now uses SQL-generated `now() + interval '20 minutes'`
for creation and PostgreSQL `now()` for acceptance, and integration tests
assert the resulting interval is actually between 0 and 20 minutes.
The wider token/session/inventory expiry pipeline still needs a separate
time-zone audit; this change does not imply it was repaired globally.

## Verification / rollback

- Shared contracts, API compile, strict OpenAPI (152 paths), regression
  test suite and production Next.js build are release gates.
- Test only against a separate PostgreSQL database named
  `variety_foundation_test` with the exact 47-migration chain. No real
  email is dispatched during tests.
- No SQL migration is added to this change; the existing
  `PasswordResetToken` model and historical migration are reused.
- Runtime release must keep both feature flags OFF until provider and
  operator testing succeeds. Revert code or set server/UI flags OFF to
  disable the workflow without modifying historical token records.
