# Customer electronic checkout: duplicate prompt and honest verification state
19 November 2026 — **source-only**, not deployed; based on an independently scoped port of the safe intent from earlier draft PR #139.

## Problem
Order-level `paymentStatus=pending` exists both immediately after checkout (no provider request) and after the provider has been contacted. Prior UI showed “Continue to secure payment” in both conditions. Backend idempotency guarded against a second live attempt, but the UI could encourage a duplicate charge or repeated MoMo prompt. Under a real Transaction Status API 403, the order may move to `requires_review`: the page previously claimed **“Payment received”** even without provider proof and asserted an order was refunded or cancelled for a generic failed status.

## Correction
- Customer payment phase is derived from `PublicOrder.paymentAttempts` (server-owned) and exact order status. Only an electronic order with **no provider-started attempt** exposes “Continue to secure payment.”
- Any real API attempt lacks `gatewayInitiated:false`, so it is treated as already submitted and the UI shows **“Waiting for payment verification.”** No second charge action is offered. Staff review remains distinct from paid.
- The mock demo creates a prepared attempt with `gatewayInitiated:false` and marks that same attempt submitted on first initiation, reusing its ID. The second click is rejected; the demo does not claim a real collection.
- Electronic unpaid/pending and requires-review states remain refreshable. Provider initiation failures are visible to the shopper even as background order polling continues.
- Customer copy never asserts that `requires_review` means payment was received, or that a failed status proves the buyer was never charged. It directs anyone with a charged wallet to contact support before another payment.
- The UI is advisory; server-owned payment attempts and idempotency remain authoritative. No frontend signal can mark an order paid.

## Security and release
- All live payment activation flags remain OFF; Hubtel Transaction Status authenticated read-only probe returned **HTTP 403 at 09:35:19 UTC on 19 Nov 2026**, issue #90 updated.
- No real payment initiation, callback, refund, migration, settlement, deployment, API credentials or payment-state writes.
- Tests: new/pending, demo unsent, real submitted, unpaid with prior attempt, terminal/review, mock replay, accessible verification wording and visible initiation errors.
- Run full GitHub API and frontend CI; avoid merging earlier draft #139 without reconciling these code paths and any stacked checkout work (#140, #141).
