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

## Portal-only rollout evidence, 17 November 2026

**Deployed immutable code:** fd4a845232794101a500702465803d9677597c2e
**Release artifact:**
/home/lightworld/releases/varietygroceries-portal-pos-retry-fd4a845-20261117
**Portal service:** varietygroceries-portal-canonical.service, unchanged port 3052
**Override:** 95-pos-retry-safety-20261117.conf (WorkingDirectory only)
**Rollback:** remove that single systemd override, daemon-reload and restart
the portal service. The previous 90-admin-sidebar-20261117.conf restores
/home/lightworld/releases/varietygroceries-portal-admin-sidebar-0a65020-20261117.

Completed:
- The POS retry, existing POS transport and cashier filter suites passed
  11 tests / 93 assertions, with zero failures.
- Targeted ESLint and full TypeScript check passed with pinned dependencies.
- Next.js 16.1.3 production build passed and generated all 63 static pages,
  retaining customer, POS, inventory, cashier, admin and support routes.
- Isolated canary (port 3096) returned HTTP 200 for homepage, shop, cart,
  checkout, staff login, POS, and cashier session pages.
- After the portal-only restart, live route checks returned HTTP 200 for
  the shop, cart, checkout, staff login, POS and cashier sessions.
- HTTPS portal homepage remained HTTP 200 and retained the Quick view basket
  control. Public varietygroceries.com retained Coming Soon.
- The API on port 3049 was not restarted and still returned HTTP 401 to
  unauthenticated requests for /api/v1/admin/pos/tills.
- No stock, till, customer, payment, schema, API or transaction-flag mutation.

A first safety check automatically rolled back because a new systemd
drop-in named 100 sorted before the existing 90 override; it was renamed
95 so its ordering is correct. A later false positive was caused by the
release verifier using grep -q in a curl pipeline with pipefail; the
response was HTTP 200 with the correct Coming Soon text, but curl exited
with SIGPIPE. The verifier now saves and checks the HTTP response separately.
Both aborted attempts safely restored the preceding release; the third
attempt passed all checks and is the current deployed portal release.

**Not yet signed off:** actual authenticated cashier transactions in the
isolated test database, stock movement/reconciliation and live payment
provider acceptance. Simulated front-end retry tests are not a real
cashier UAT pass or permission to enable production POS flags.
