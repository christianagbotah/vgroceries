# POS P0e — dedicated cashier read-only workspace

## New route and login behaviour

- `/staff/cashier` is a focused, mobile-readable workspace outside
  `/admin` and its administrator-oriented navigation.
- `/staff/login?next=%2Fstaff%2Fcashier` accepts **real authenticated**
  cashier accounts. A cashier logging in without `next` also arrives at
  the cashier workspace. Administrators retain their own back office access.
- A prior UAT demo-session flag cannot authenticate the cashier route.
  Attempting real sign-in clears that flag first; report reads use their
  own `HttpServiceAdapter` with `credentials: "include"`, never the mock
  adapter or browser-stored identities.
- Every refresh checks the authenticated session again, then fetches the
  server's location-scoped till list. Any failure clears previously displayed
  cashier data; it does not show an old balance as current.
- The interface includes loading, denied/expired, disabled, empty, filtered,
  report-error and ledger-mismatch states.
- Local filters affect only the latest **50 authorised sessions** returned
  by the server; they do not imply access to older shifts.
- CSV downloads use the server-authorised reconciliation endpoint. Its
  currency figures are stored as integer pesewas and represented in the UI
  using **₵** with two decimals.

## Release dependencies

**This PR is stacked on the cashier backend PR #85** and must not be
merged independently. PR #84 is the separate administrator read-only
cash report. Coordinating its transport/UI and the cashier route should be
part of the integration review.

No POS sale, payment, till opening, float/movement, close, receipt issuance,
stock mutation, refund or payment-provider activation has been implemented by
this workspace. All POS transaction flags remain off.

## UAT acceptance

1. With real API configured and POS till foundation still disabled, the
   screen must show the disabled status, never a mock shift.
2. Without an authenticated real session, show a sign-in prompt and do not
   show a previous account's cash records.
3. A cashier can read reports only for assigned active locations; removing
   their grant must return the next request to an error without stale results.
4. Another branch's guessed till ID and CSV must return 404.
5. An inventory manager or customer session must not enter the workspace.
6. A real cashier login routes to `/staff/cashier`, and a demo-only identity
   cannot bypass real server authentication.
7. Verify mobile widths 360, 768 and 1440 px, keyboard focus, generated
   CSV, Ghana-local dates and money formatting.
8. Confirm network calls are GET-only for the workspace and that there is
   no sale, cash movement, stock or payment mutation.

Do not claim authenticated staging UAT has passed until these are
actually exercised with approved test accounts and isolated test data.
