# Variety Groceries — Verified stock correction retry transport hardening
*15 November 2026 · canonical inventory UAT · source-only*

## Confirmed integration bug

A real-browser trial of the verified stock correction screen, with a genuine
inventory-manager session against a **disposable** database, exposed a mismatch
between the common client HTTP adapter and the backend's strict schema.

- The UI passes an idempotency key separately to the transport.
- `normalizedRequestBody()` intentionally injects that key into the JSON
  payload for historical mock/checkout compatibility.
- The new `inventory.verified.adjustments.create` authority uses a strict,
  security-reviewed Zod body that **does not permit** an
  `idempotencyKey` field. The server requires an `Idempotency-Key`
  **HTTP header**, not JSON replay metadata.
- Browser validation originally rejected the submission before any network
  stock-changing request. No inventory movement occurred.

## Narrow fix and safety boundary

Each REST operation may optionally declare
`replayTransport: "headerOnly"` in the shared endpoint registry.
The verified stock correction request opts in. The HTTP adapter still
detects conflicting body/header keys, retains the validated replay key
in the HTTP header, and removes that metadata field from the JSON body
for declared strict routes.

**All other routes preserve their existing replay serialization**.
In particular, legacy checkout/mock payloads and compatibility tests
are unchanged. No backend stock authority, schema, migration, payment,
POS cash sale or other financial logic is modified.

## Regression coverage

`scripts/http-adapter-regressions.test.ts` now asserts:

- Verified correction requests send a strict JSON payload with exactly
  the supplied lot, variant, location, signed delta and reason.
- The same request carries `Idempotency-Key` as a header.
- Conflicting replay keys are rejected before transport.
- Forged `actor` is rejected by strict request validation.
- Legacy checkout and logistics replay behavior remains intact.

Targeted regression: `bun test scripts/http-adapter-regressions.test.ts`,
**24 passing tests**, zero failures.

## Browser UAT boundaries

The browser acceptance environment uses PostgreSQL 18 and all 47
migrations in a fresh database named `variety_foundation_test` on
127.0.0.1 only, seeded with synthetic merchandise (20 kg rice plus
salt), one inventory manager with the Accra branch, and separate
administrators. API and Next.js test servers bind to 127.0.0.1 only;
the stock mutation feature is enabled **only on that isolated API**.
The live canonical API remains stock-adjustments OFF, and the
POS-integrated frontend and API remain unchanged.

Browser checks:
1. Anonymous visitor is sent to real staff login.
2. Inventory manager signs in; sees only the assigned Accra branch
   and a mobile 375 px responsive layout.
3. Choose the rice lot, request a signed quantity correction and verify
   the lot quantity remains unchanged while pending.
4. Sign out and sign in as a different administrator; approve explicitly.
5. Assert **one** movement, **one** audit event, **one** outbox event,
   and the correct resulting physical quantity.
6. Remove the synthetic PostgreSQL instance, test browser profile and
   test credentials. No real Variety Groceries staff account is created.

**Not a go-live sign-off.** A supervised physical count using authorised
warehouse personnel, live-role session revocation, stocktake controls,
cash/POS reconciliation, public portal release parity, and rollback
acceptance are still required before enabling real stock mutations.
