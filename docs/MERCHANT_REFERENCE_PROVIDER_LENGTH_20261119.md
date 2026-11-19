# Provider-safe merchant payment references
19 November 2026 — **source-only**; no payment or deployment.

## Problem and scope
The Payments Authority generated references as `VG-PAY-` plus a full 32-character UUID hex string (39 characters). The Hubtel Hosted Online Checkout development adapter specifies a maximum **32-character** `clientReference`, and Hubtel Direct Request Money documents a 36-character limit. A newly created attempt could therefore be rejected at the gateway even when all merchant configuration and payment input were otherwise valid.

## Change
- Generate `VG-PAY-` plus **24 random uppercase hex characters**, using `crypto.randomBytes(12)` for 96 bits of cryptographic randomness. Output is always **31 characters**, independent of UUID version/variant fixed bits. The database uniqueness constraint and idempotency locking remain authoritative; no customer input can override this reference.
- Add a Hubtel Direct adapter pre-flight guard: an unexpected malformed or overlong reference is rejected **before** provider request I/O. Other payment providers keep their existing behavior.
- Keep previously issued references, attempt IDs, provider references, audit trails and idempotency records **unchanged**; a legacy long reference must continue to be investigated/reconciled by its original identity, not rewritten.
- Extend the isolated PostgreSQL `payment-initiation.spec.ts` test to assert actual persisted generated reference length and regex. Extend the real Hubtel adapter Node mock test and lightweight Bun regression suite for overlong/malformed references and zero provider calls.
- No new migration, payment provider activation, bank interaction, charging/recharging, callback processing, storefront cutover, credential changes or deployment.

## Release boundary
This adjustment reduces reference-format incompatibility for future Hubtel Hosted Checkout integration. It does **not** resolve the independent authenticated Transaction Status API **HTTP 403**, last rechecked at **10:36:34 UTC on 19 Nov 2026**, and recorded in GitHub issue #90. Payment flags stay disabled; hosted checkout development PR #140 is separate and must be rebased with current payment identity/currency safeguards before live use. Full GitHub frontend + API security/integration CI is required for merge, and staged runtime UAT/rollback are separate.
