# Variety Groceries — online electronic payment status clarity

Date: 17 November 2026

## Defect found

New online electronic orders have `paymentStatus=pending` directly after
checkout, **before** the shopper opens a gateway. After a payment attempt is
actually initiated, the same order-level status can still be `pending`.
The storefront previously showed **Continue to secure payment** in both
states, allowing a misleading second initiation attempt (usually rejected
by the backend as an existing live payment). Provider configuration errors
were assigned to React state but not displayed on a populated order page.
Polling also stopped for electronic `unpaid` even though a payment outcome
could still arrive.

## Implementation

- Derive the customer-facing phase from both order/payment status and the
  **server-owned paymentAttempts ledger** already included in PublicOrder.
- `start`: no gateway request has occurred. Show secure payment button.
- `verifying`: a provider initiation was attempted. **Never show another
  Pay now/Continue payment button**; show "Waiting for payment verification",
  explicit duplicate-charge warning, Refresh status and Contact support.
- `finished`/`cancelled`/`not_electronic`: no new electronic payment action.
- Underlying backend idempotency and server-owned amount/currency verification
  remain authoritative; this UI is an additional clarity/safety layer.
- New optional `gatewayInitiated` marker is for a *mock-only prepared attempt*.
  The mock currently reserves a provisional payment attempt at checkout;
  `gatewayInitiated=false` means no remote payment has begun. The mock
  payment initiation operation marks the same provisional attempt initiated.
  Live API attempts without that new field are treated conservatively as
  **already initiated**, not as permission for a new charge.
- Keep electronic `unpaid`, `pending`, `requires_review`, and refund_pending
  polling. Only terminal or cash-unpaid statuses stop scheduled polling.
- Customer-visible initiation errors now appear as alerts instead of silently
  disappearing. No card/MoMo credentials are collected.

## Release boundary

The source branch builds on the deployed full-bleed hero and makes only
frontend/prototype contract changes. No database migration, live provider
activation, stock mutation, payment request or backend service restart.
Run tests and a production build, perform canary checkout status smoke, and
deploy only the portal frontend after verifying earlier hero and navigation
features. Flutterwave/Hubtel/Paystack production integration and authenticated
sandbox settlement remain separate gated work.
