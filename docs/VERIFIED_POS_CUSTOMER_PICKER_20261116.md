# POS registered-customer picker — frontend parity (16 November 2026)

## Scope

This change adds a read-only, opt-in customer selection preview to the
canonical /staff/cashier/workspace route, using the restricted registered
customer API introduced by PR #118. It does not copy the POS staging
worktree, replace its pages, enable a sale, or change active 3049/3052 services.

The legacy /admin/pos route remains deliberately blocked when connected
to the live REST API. Its demo simulator is never reused for this preview.
Only real cashiers who pass existing server-verified workspace authentication
may see the picker, subject to flags.

## Explicit activation prerequisites

Both must be configured and independently approved before UAT use:

- Frontend build time: NEXT_PUBLIC_POS_CUSTOMER_LOOKUP_UAT=1. All other
  values mean disabled. Next.js embeds this at build, not runtime.
- API: POS_CUSTOMER_LOOKUP_ENABLED=true and POS_TILL_FOUNDATION_ENABLED=true
  after isolated UAT. API defaults OFF.
- Frontend NEXT_PUBLIC_API_BASE_URL must point to the trusted absolute
  HTTPS endpoint ending in /api/v1 (localhost HTTP only for controlled tests).
  A missing base, /api/mock/v1, untrusted scheme, credentials in URL or
  extra query/hash fail closed.
- A real authenticated cashier session. Demo accounts are denied before
  any customer request. The backend rechecks active cashier status and
  current branch grants on each search and rate-limits repeated searches.

Do not enable any of these flags on live services in this PR. Activation
requires a separate reviewed release decision.

## Picker contract and privacy

The frontend sends the shared endpoint operation cashier.pos.customers
as an authenticated, no-store GET to /api/v1/admin/pos/customers?q=...
through the existing browser adapter. Search is trimmed, 2–80 characters,
debounced, and returns at most 15 strictly parsed rows with these three
fields: id, name and phoneLast4. No full phone, email, password, customer
address, order history or balance can be accepted by the strict parser.
If the server returns extra data, selection fails closed.

Old asynchronous responses are ignored after a newer search/mode change.

Modes:
- Walk-in: no account, lookup or registration.
- Name for receipt: local preview name only; no account creation.
- Registered: selection with ID/name and last four phone digits, for future
  sale completion only. The future backend must independently recheck
  customer account, branch rights and sale identity when committing the sale.

The entire selection is held in component memory. No transaction, stock hold,
drawer movement, provider request, audit mutation or customer registration.

## Compatibility and outstanding UAT

The POS-integrated WIP staging frontend still expects an older
{id,name,phone,email} API result. Merging this source does not reconfigure
or replace that frontend. Before cutover, update the active POS sale UI to
phoneLast4, independently test registered-customer binding and receipt
audit under branch revocation, and complete real HTTP/database/browser UAT.
This preview is not an authorization to operate live POS.

Offline regression command:
    bun test scripts/verified-pos-customer-picker.test.ts

Checks include method/path, GET cookie/no-store behavior, strict masked
response, mock/URL/flag safeguards and read-only source structure.
