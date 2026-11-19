# Checkout retry and ambiguous response safeguard — 19 November 2026

## Problem
The customer checkout page generated a fresh checkout-completion idempotency key on every click. A backend transaction may commit and the HTTP response may be lost; a second click with a different key could allocate another order/stock hold. This is separate from (and earlier than) electronic payment initiation.

## Source-only fix
- A cryptographically generated UUID, prefixed with `co_`, is stored in tab-scoped session storage at first checkout completion. Subsequent clicks and same-tab refreshes reuse that key; never store customer details or payment information there.
- Duplicate taps are blocked synchronously while a checkout request is in flight.
- Only a confirmed successful completion removes the saved key. Unknown network failures, retries and server errors retain it.
- The backend already scopes the idempotency record to principal + operation + key and hashes the checkout request. Repeating identical data replays the original order. Reusing a key with different details returns `IDEMPOTENCY_CONFLICT` instead of silently creating a new sale.
- If secure key generation or session storage fails, the client does not submit checkout.
- Changed-details conflicts direct the customer to support/order history rather than silently generating a fresh order key.

## Boundaries and verification
This is an **unreleased frontend source change**. It does not activate payments, change stock or bypass server-side availability/price checks. The server must still authorize every order and maintain transactional idempotency. An expired guest session or a different tab has a different actor scope and may require staff reconciliation before another order is placed. Automated tests cover key reuse/clear, invalid storage, blocked storage, double-submit guards and conflict UI. The actual browser journey, server receipt recovery, gateway callbacks, IP allowlisting and finance UAT remain independent release gates.
