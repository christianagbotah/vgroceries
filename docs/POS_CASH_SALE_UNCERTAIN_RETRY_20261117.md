# POS cashier: uncertain-response retry safety (17 November 2026)

## Risk and verified baseline

The isolated POS cash-sale service atomically consumes stock reservations,
records the cash sale and posts the till entry. A repeat with the same
Idempotency-Key and same body replays the receipt, while a new key against a
consumed hold is rejected (409). These backend protections are covered
by apps/api/test/pos-cash-sales.spec.ts.

The browser previously created a new UUID for every cash-sale request.
If the server committed the sale but its response was lost, pressing the
button again sent a new key and could show 409 instead of recovering the
receipt. The server prevented double depletion but the cashier UI could
not confirm the first attempt.

## Client hardening

- Locks the first request's hold ID, replay key, tender amount, handover
  evidence and customer selection in in-memory component state before POST.
- If the response fails, displays an explicit outcome-unconfirmed alert;
  the cashier must not collect payment again, release the reservation
  or start another sale.
- A visible Retry original cash-sale request button sends the exact same
  body and same key to allow the server to replay the original receipt.
- Customer, tender and handover controls stay locked during recovery.
- A different hold cannot replace an unresolved attempt.
- No customer, cash or key data are stored in localStorage, sessionStorage,
  query strings or links. Reloading loses the in-memory key, so operators
  must verify the original till and receipt before another attempt.
  This is not offline payment recovery.

## Verification and release boundary

Run the POS retry tests and existing POS counter transport tests. Tests
cover a simulated lost server response, immutable payload, key reuse,
wrong-hold denial, and UI guards. No backend, stock, payment, API flags,
schema migrations or production cashier actions are modified.
This change remains source-only until lint, TypeScript, production build
and isolated staging browser checks pass. Live cashier and stock
acceptance still require separate signed-off UAT evidence.
