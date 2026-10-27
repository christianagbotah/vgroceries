# Customer phone-first authentication implementation plan

## Goal
Make Ghana phone number the primary customer identity while preserving existing staff/rider email authentication and existing customer email login as a compatibility fallback.

## Invariants
- Customer registration requires name, Ghana phone and password; email is optional.
- Customer phone is canonicalized to `+233XXXXXXXXX` before persistence, throttling and lookup.
- Two customer users cannot own the same canonical phone.
- Existing users with email continue to sign in by email.
- Staff and rider sign-in remains email/password; phone login resolves customer users only.
- Empty/omitted customer email persists as NULL, never as a fabricated address.
- Profile updates preserve phone normalization and uniqueness.
- Login failures stay non-enumerating.

## Data model
1. Change `User.email` from required unique to nullable unique.
2. Keep `User.phone` for backward compatibility but add a PostgreSQL partial unique index for non-empty customer phones.
3. Existing rows require no backfill; customers without phone remain reachable by existing email.

## Contract/API
1. Shared Ghana phone normalizer/schema accepts `0241234567`, `233241234567`, and `+233 24 123 4567`, producing canonical `+233241234567`.
2. Register request: required `name`, `phone`, `password`; optional `email`.
3. Login request: exactly one of `email` or `phone`, plus password/client.
4. Registration throttles on canonical phone; login throttles on the supplied normalized identity.
5. Phone lookup is restricted to role `customer`; email lookup preserves all roles.

## Storefront
1. Signup shows phone as required and email as optional.
2. Customer login accepts “Phone number or email”.
3. Browser client sends `phone` for phone-looking identifiers and `email` for email identifiers.
4. Staff client continues sending `email` only.

## Verification
- Red/green API integration: phone-only registration, canonical persistence, phone login, duplicate phone rejection, optional email, legacy email login, staff email login.
- Red/green storefront regression: email is optional and login is phone/email.
- Prisma migration on isolated PostgreSQL schema.
- API build, focused integration tests, web regressions, lint, typecheck/build, OpenAPI deterministic check, diff check.
