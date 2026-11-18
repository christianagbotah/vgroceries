# Hubtel Direct collection status: reference proof hardening

Status: source-only safety fix on the stacked Hubtel hosted-checkout staging branch. **Not deployed or activated.**

## Why

The Direct Request Money status adapter used to copy the *requested* merchant
reference into the returned payment observation whenever a provider JSON body
omitted that reference. A `200` response with `status: Paid` and an amount but
no independently echoed reference could therefore appear to match the attempt.

The Direct adapter now rejects missing, empty and mismatched merchant references
before a status can be passed to the authoritative payment outcome service.
The hosted Online Checkout adapter already enforces an exact clientReference
match and is unchanged by this patch. An HTTP 403 is also tested to fail closed.

## Safety and verification

Tests mock Hubtel network responses and never use real merchant credentials.
No payment is initiated, marked succeeded, refunded or reconciled; no server
flags are changed. A mismatch or missing reference is a non-authoritative
lookup error, not a payment failure. The server must continue to keep the
transaction pending or operator-reviewable until independently verified.

`Hubtel Transaction Status` on the merchant VPS still returned **HTTP 403**
on 18 November 2026 at 22:01 UTC. This code change does not bypass Hubtel
allowlisting or satisfy real-money UAT, callback authentication and refund
coverage requirements. It should be reviewed with the Hubtel draft PR stack.

## Local checks (18 November 2026)

- Focused isolated Bun adapter regression: **3 passed, 0 failed**, 16 expectations.
- Full root Bun scripts suite on this draft parent branch: **341 passed, 5 failed**. Those failures are in staff demo login, browser cache (2), admin authentication fixture and storefront composition assertions, outside the changed Hubtel paths. They are not claimed as resolved or independently proven pre-existing.
- Two further tests are added to `apps/api/test/hubtel-payment-provider.spec.ts` for the real API test runner. The local Bun runner cannot execute the NestJS-decorated test module; proper Node 24 API CI is required. The generated Prisma client and contracts were built in an isolated checkout only.
- Git diff whitespace check clean; production and staging untouched.
