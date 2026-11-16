# Variety Groceries — guest checkout CSRF recovery

Incident date: 16 November 2026
Evidence: checkout screenshot showing "A fresh guest checkout capability was issued. Retry with its CSRF token." during Place order.

## Verified cause

GuestCheckoutService.requireMutation intentionally creates an HttpOnly guest session cookie (vg_guest) and a readable double-submit CSRF cookie (vg_guest_csrf) on an initial unauthorized checkout POST, then rejects the original request BEFORE any order/stock mutation.

The browser adapter only emitted X-CSRF-Token from the signed-in sessionStorage token. For guests, it never included the issued cookie token, so clicking Place order could not recover. This is an HTTP session handshake bug, not proof of purchase or payment.

## Scope of fix

- Read exactly vg_guest_csrf from document.cookie and require 64 SHA-256 hexadecimal characters. No prefix lookalikes or malformed values. No copying the guest CSRF to storage, URLs, logs or request bodies.
- Preserve account/staff session CSRF priority; use cookie CSRF only as a guest fallback.
- In apiOps.complete, retry exactly ONCE only after the server's exact pre-mutation FORBIDDEN message and only if a fresh readable guest CSRF cookie exists.
- Reuse the exact original request closure/body and idempotency key. Never fabricate a new key or retry an ambiguous network failure, a generic CSRF/authorization failure, out-of-stock rejection or replay conflict.
- When first-party cookies cannot be read, fail closed with an actionable browser-cookie message.
- Keep all API session CSRF, origin, order idempotency, stock and financial authority untouched.

## Tests and verification

8 security-focused unit/source regressions and existing checkout auth-choice tests; full frontend suite and GitHub CI/API Foundation required. Before release, staging browser UAT must cover first-time guest, stale cookie, blocked cookie, signed-in checkout, network timeout and idempotent retry without creating unapproved real orders.

## Deployment safeguards

Active portal 3052 and API 3049 originate from a separate POS-integrated source, with 24 pre-existing uncommitted paths including checkout and SMS changes. Do not deploy canonical main over that runtime. This canonical PR does not modify live services. A reviewed, surgical port plus a new release build with a rollback and smoke test is required before claiming the visible checkout error is fixed on the public URL. Public varietygroceries.com stays Coming Soon.
