# POS P0c customer identity — immutable sale-time evidence

Date: 16 November 2026
Scope: source-only cash-sale contract and server authority for registered
customers and named/walk-in shoppers.

## Why

Canonical code previously accepted only an anonymous counted cash sale.
The UAT Prisma PosCashSale model already contains customerMode,
customerUserId, customerName and customerPhone, but the current canonical
completion service did not populate them. The POS frontend customer picker
therefore could not safely attach a selected registered account to a
completed cash-sale record.

This increment ports only the bounded customer-identity fields from the
isolated POS integration worktree. Its other uncommitted code remains
untouched. No new migration or live database modification.

## Request modes

- No customerMode / walk_in: existing request shape still accepted;
  immutable snapshot Walk-in Customer, no linked User and no phone.
- named: requires a trimmed 2–120 character customerName. The name is
  recorded only against the sale/receipt and does not register a User.
- existing: requires customerUserId. The server looks up and row-locks
  the current User record inside the exact transaction that consumes the
  stock hold. The user must be active and role=customer. Server-owned name
  and phone are copied into immutable sale-time columns, never trusted
  from request fields.

Mutually incompatible fields are rejected by a strict Zod body parser.
The customerMode remains an optional addition for old clients.
Any rejected request must create no sale, debit, stock depletion,
cash movement, new user or refund.

## Authority and consistency

- This remains the administrator-only POS CASH completion endpoint.
  The existing POS_CASH_SALES_ENABLED flag defaults OFF and the service
  retains the existing hold/till/price/cash/goods handover checks.
- Registered customer is revalidated at sale completion, not merely
  when the cashier looked them up. SELECT ... FOR SHARE holds a row lock
  through commit so a concurrent account deactivation cannot race past
  the final identity check.
- Customer details and stock/cash/receipt/audit evidence persist in the
  same database transaction as the idempotent cash sale.
- No electronic payment, delivery, credit, tax invoice, automated refund,
  SMS or customer account mutation is introduced.
- Admin detail returns mode, account reference and immutable customer
  name; no phone/email is added to the public cash-sale view.
- Printed 80mm cash receipt displays the recorded customer name after
  HTML escaping, never full phone/email. The print page remains script-
  free, authenticated, no-store, and NOT A TAX INVOICE.

## Release constraints

This source change is NOT deployed or activated. The active POS
staging frontend expects the old full-contact customer lookup response.
It needs the reduced phoneLast4 consumer from PR #120 and real-role/
branch acceptance before any cutover. Current POS cash-sale authority
is administrator-only, not a cashier financial permission.
Issue #108 tracks the full POS source/service parity and go-live gates.
Hubtel status authorization remains a separate 403 issue #90.

## Verification

- Offline Zod and HTML tests:
  bun test scripts/pos-cash-customer-contract.test.ts
- Full API Foundation CI uses a disposable PostgreSQL database and
  the real HTTP tests in apps/api/test/pos-cash-sales.spec.ts:
  active registered customer, wrong role, named walk-in, old walk-in
  payload, bad combinations, HTML escape, replay, no extra stock writes.
- API TypeScript compile and deterministic OpenAPI regeneration must pass.
- Do not assume test results from an environment until they have completed.
