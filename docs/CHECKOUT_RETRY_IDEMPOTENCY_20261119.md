# Checkout retry and ambiguous response safeguard — 19 November 2026

## Problem
The customer checkout page generated a fresh checkout-completion idempotency key on every click. A backend transaction may commit and the HTTP response may be lost; a second click with a different key could allocate another order/stock hold. This is separate from (and earlier than) electronic payment initiation.

## Source-only fix
- A cryptographically generated UUID, prefixed with `co_`, is stored in tab-scoped session storage at first checkout completion. Subsequent clicks and same-tab refreshes reuse that key; never store customer details or payment information there.
- Duplicate taps are blocked synchronously while a checkout request is in flight.
- Confirmed successful completion removes the saved key. **Explicit, server-confirmed pre-commit rejections** (`OUT_OF_STOCK`, `PICKUP_FEE_CHANGED`, `RULE_VIOLATION`, `VALIDATION_FAILED`) also clear it, allowing customers to correct the basket, pickup fee or input and submit a fresh attempt. These codes are emitted before the backend checkout transaction commits, or from a rolled-back transaction. Other API errors and unknown network outcomes retain the key; in particular an `IDEMPOTENCY_CONFLICT` must not silently create another order.
- The backend already scopes the idempotency record to principal + operation + key and hashes the checkout request. Repeating identical data replays the original order. Reusing a key with different details returns `IDEMPOTENCY_CONFLICT` instead of silently creating a new sale.
- If secure key generation, session-storage access, or **storage read-back verification** fails, the client does not submit checkout and shows a customer-safe recovery message.
- An invalid/corrupted saved key is **never silently replaced**. It may represent an already-committed order; a new key could duplicate the order.
- When a saved key already existed before the current click, a newly issued **guest session/CSRF capability must not trigger an automatic second POST**. Server checkout records are scoped by guest actor; losing the original guest cookie after an uncertain response would otherwise bypass replay protection. New checkout attempts may still bootstrap one fresh guest session normally. A returning ambiguous attempt with changed guest identity instead shows a support/reconciliation message.
- Changed-details conflicts direct the customer to support/order history rather than silently generating a fresh order key.

## Isolated browser release gate
CI now provisions a throwaway Chromium browser for `scripts/checkout-browser-retry.mjs` after the application builds and the mock server starts. The script only accepts a loopback URL, intercepts every `checkout.complete` POST before it reaches the mock server, and checks the mobile customer checkout flow, replay header/body agreement, identical keys after ambiguous failures, and fresh keys after a confirmed stock conflict. A browser test must only be marked passed when its GitHub run actually succeeds. The busy VPS development server could not complete initial route compilation within the HTTP timeout and was stopped; that is **not** browser acceptance evidence.

## Boundaries and verification
This is an **unreleased frontend source change**. It does not activate payments, change stock or bypass server-side availability/price checks. The server must still authorize every order and maintain transactional idempotency. An expired guest session or a different tab has a different actor scope and may require staff reconciliation before another order is placed. Automated tests cover key reuse/clear, confirmed pre-commit failure recovery, preservation after ambiguous failures and conflicts, invalid storage, blocked storage, double-submit guards and conflict UI. The actual browser journey, server receipt recovery, gateway callbacks, IP allowlisting and finance UAT remain independent release gates.
