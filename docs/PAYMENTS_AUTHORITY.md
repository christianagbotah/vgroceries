# Payments Authority

Variety Groceries now has a production **provider-neutral Payments Authority** in
`apps/api`. This milestone establishes durable payment attempts, verified provider
evidence, reconciliation, payment-aware cancellation, and safe customer/staff
projections. It does **not** activate a live merchant provider or switch the public
Next.js storefront away from demo transport.

All production paths below use the `/api/v1` prefix.

| Method and path | Authority |
| --- | --- |
| `POST /orders/{orderId}/payment-attempts` | Owning customer or guest capability. Requires `Idempotency-Key`; cookie/guest mutation flows retain trusted-Origin + CSRF checks. |
| `POST /payments/providers/{provider}/events` | Provider adapter verification, not customer authentication. The adapter receives exact raw request bytes. |
| `GET /payments` | Administrator-only safe payments ledger. |
| `POST /payments/{attemptId}/reconcile` | Administrator-only authoritative provider lookup/reconciliation. |

The browser/demo route `POST /orders/{orderId}/payment-outcome` is deliberately
absent from the production API. Browser redirects and callback JSON fields are not
payment truth.

## Financial authority and initiation

Electronic methods currently use the provider-neutral vocabulary
`mobile_money`, `card_hosted`, and `bank_transfer`. The checkout order remains the
authority for method and total. Payment initiation accepts only an optional Ghana
payer phone; it does not accept amount, currency, provider, card PAN, CVV/CVC, or
a client-selected customer identity.

An initiation first creates a durable `PaymentAttempt` and replay record, then
performs provider network I/O after the database commit. The database enforces one
live (`initiated`/`pending`) attempt per order. Same-key retries replay the same
attempt; different keys racing on one order cannot create two live attempts.

If provider initiation times out after the provider may have accepted the request,
the attempt becomes `uncertain`. A retry performs provider lookup by the durable
merchant reference before any new charge is considered. Blind duplicate charging
is forbidden.

## Provider-event evidence

The callback route uses route-specific `express.raw()` before the general JSON
parser. The configured adapter verifies those exact bytes or requires an
authoritative lookup. Variety stores a SHA-256 body digest and normalized safe
evidence, not the raw payload, signature/authentication headers, or provider
credentials.

Provider events are deduplicated durably. A callback that failed after evidence
was committed can resume against the same evidence row; a duplicate terminal
callback cannot repeat the financial/order/stock effect.

Only `PaymentOutcomeService` applies verified post-checkout payment outcomes.
Verified ingress cannot directly declare an order succeeded/failed/expired.
The service locks Order then PaymentAttempt rows in the documented order and
validates provider, merchant reference, supplied amount, and GHS currency before
applying an observation.

## Stock coverage after verified payment

Inventory remains the only reservation authority. On first verified success,
Payments calls Inventory `ensureClaimCoverage` inside the same transaction:

- complete active coverage is extended, never shortened;
- released/expired coverage is reacquired as a new reservation generation;
- partial active generations are rejected rather than mixed;
- two paid orders racing the final unit cannot both acquire it.

If real money succeeds but stock can no longer be reacquired, Variety records the
payment as succeeded evidence, sets settlement/order review state to `exception` /
`requires_review`, and creates no fabricated or partial stock hold. A success that
arrives after cancellation is likewise preserved and routed to review for the
future refund workflow.

## Reconciliation and staff ledger

`POST /payments/{attemptId}/reconcile` snapshots the immutable attempt, performs
provider lookup **outside** a PostgreSQL transaction, then locks Order followed by
PaymentAttempt and verifies the snapshot is still applicable. Matching observations
reuse `PaymentOutcomeService` and mark the attempt reconciled. Stale snapshots,
no-record lookup, amount/currency/reference mismatch, or conflicting terminal
observations remain explicit exceptions; the service never guesses money state.

`GET /payments` is administrator-only in this milestone because a separate finance
role/grant does not yet exist. It supports bounded pagination and filters for
attempt status, settlement state, provider, method, order reference, and date
range. Rows contain safe operational payment fields only—no raw provider-event
metadata, secrets, signatures, or merchant replay internals.

Customer/guest order and tracking projections expose only safe attempt data such
as method, amount, status, callback count, settlement state, normalized failure
reason, and timestamps. Provider references are currently omitted from customer
views because no adapter capability yet declares one explicitly safe for customer
support use.

## Cancellation safety

Orders lock the order first, then Payments locks all attempts in stable ID order.
Cancellation behavior is:

- no attempt, or only terminal failed/expired attempts: existing pre-handover
  cancellation may proceed;
- a live initiated/pending attempt: cancellation is refused until reconciliation;
- succeeded payment or refund/review-sensitive order state: cancellation is
  refused and the future refund workflow is required.

A verified success racing cancellation therefore serializes to one safe result;
stock cannot be released while a live charge can still become paid.

## Configuration and readiness

The payment configuration bundle is closed by default. With the entire bundle
absent the API can still boot, but electronic payment initiation is unavailable.
A partial bundle is a configuration error. A configured provider must exist in the
adapter registry and support all enabled methods before electronic payment
readiness is considered available.

Application-owned settings cover active provider ID, enabled methods, confirmed
hold duration, provider request timeout, reconciliation delay, and allowlisted
hosted-payment domains. Provider-specific secret names, merchant credentials,
webhook algorithms, and production URLs are intentionally not invented here.
Secrets belong only in deployment secret configuration and must never enter source,
database rows, outbox payloads, or client responses.

The deterministic `FakePaymentProvider` exists only under the test suite. There is
no production fake adapter.

## Hubtel status

Hubtel is **not enabled** by this milestone. A live adapter must wait for the exact,
verified merchant integration contract: official endpoint/version, authentication,
webhook verification, merchant/account identifiers, idempotency behavior, status
lookup semantics, supported methods, settlement semantics, and approved hosted
payment domains. No guessed Hubtel endpoint or secret field is committed.

## Deferred authority

Still outside this milestone:

- provider-specific live charging/Hubtel activation;
- refunds and refund execution;
- physical stock depletion/handover;
- staff fulfilment/dispatch and rider operations;
- outbox publisher/worker scheduling;
- POS payment authority;
- public frontend production-backend cutover.

The generated production specification is `docs/openapi-foundation.json`. It now
contains 25 paths: the previous 21 commerce/foundation paths plus the four Payments
Authority routes above.
