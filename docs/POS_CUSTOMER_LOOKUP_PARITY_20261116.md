# POS registered-customer selector — source-only parity (16 November 2026)

## Scope and why

The POS-integrated staging worktree currently contains an administrator/cashier endpoint
`GET /api/v1/admin/pos/customers?q=...` that searches all active customer accounts
without checking the cashier's currently assigned branches. Blindly copying it into
canonical main would widen customer-account access.

This PR ports the endpoint **with stronger privacy boundaries**. It does not alter the
running POS staging instance or overwrite its pending uncommitted work. Existing customer
sale completion, stock holds and cashier sessions are unchanged.

## Read contract

- Method/route: `GET /api/v1/admin/pos/customers?q=<2-80 chars>`.
- Protected using the existing authenticated web/native `AccessGuard`.
- Separate flag `POS_CUSTOMER_LOOKUP_ENABLED=false` by default. It may only be
  activated when `POS_TILL_FOUNDATION_ENABLED=true`.
- Only administrators and cashiers may request results. Cashiers must have an
  **active** user record and currently granted **active** location(s), checked
  against the database for each search rather than a login-time location claim.
- Cashiers see only **active registered customers previously associated with
  completed physical POS sales in one of their currently assigned branches**.
  An administrator may search all active registered customers, matching the
  pre-existing administrator customer-management responsibility.
- Search matches customer name, phone or email, but returns only
  `{id, name, phoneLast4}`, never full phone, email, order list, password,
  session details or account balances.
- Maximum 15 results, sorted by name and stable ID. Search of less than two
  characters returns an empty list; invalid query types or oversize inputs fail.
- Strict shared Zod schema and OpenAPI route response, private/no-store HTTP
  cache header, actor-scoped PostgreSQL throttle (120 attempts per 15-minute
  window using the existing `LoginThrottle` table). No new migration.

## Critical limitations

- This is **read-only**: it does not create or update customers, authorize a
  transaction, reserve stock, process electronic payments, or change POS cash sales.
- A new customer who has never completed a POS transaction at a cashier's
  currently assigned branch will not appear in cashier search. The till can
  still use the existing walk-in flow. Linking a newly registered customer
  requires a separately reviewed consent/identity policy; do not weaken this
  branch filter in the meantime.
- The POS-integrated staging frontend expects its older user object, including
  full contact fields. That client must be adapted to this reduced `phoneLast4`
  response as a separate reviewed UI parity change before any cutover.
- Default OFF even if deployed, no live UAT activation. Final acceptance needs
  isolated real-session, live branch-revocation and cross-location database tests
  plus a complete Nginx/API/portal release-parity review (#108).
- The actor-scoped throttle is **not** a global IP rate limit; consider
  additional web edge throttling and sensitive-data search audit policy for
  production operation.

## Verification

Run `node --test dist/test/pos-customers.spec.js` after compiling the shared
contracts and API. Also verify existing suite and 157-path production OpenAPI,
and check no unrestricted roster/fallback exists when the flag is disabled.
Do not claim real PostgreSQL or browser UAT completed unless actually executed.
