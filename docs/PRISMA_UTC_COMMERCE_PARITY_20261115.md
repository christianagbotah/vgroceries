# Checkout and POS expiry parity regression — 15 November 2026

This test-only addition extends the existing UTC database adapter guard in
PR #111 to commerce deadlines that can affect overselling and cashier work.

`apps/api/test/prisma-utc-commerce-expiry.spec.ts` constructs **synthetic**
checkout and POS entities in an isolated PostgreSQL test database named
`variety_foundation_test`. The test is forbidden from running against a
database with another name. All synthetic rows are created inside one
transaction and **rolled back even when the test succeeds**.

The test verifies the following values as stored in PostgreSQL,
using PostgreSQL's wall-clock `clock_timestamp()` rather than the
transaction-frozen `now()` or a Prisma-returned JavaScript Date:

| Deadline | Expected SQL outcome |
| --- | --- |
| Guest checkout session set 60 seconds in the past | Already expired |
| Inventory reservation set 5 minutes ahead | Valid for no more than 5 minutes |
| POS stock hold set 2 minutes ahead | Valid for no more than 2 minutes |

It also asserts the equivalent Prisma expiry predicates, so the test checks
both raw SQL and the same adapter style used by the application. The
synthetic Category, Product, Variant, StockPosition, StockLot, Reservation,
CashierTillSession and PosStockHold exercise real relational schema
constraints without changing UAT inventory.

Run with a disposable PostgreSQL 18 instance using the full 47-migration
chain. The database can have its default timezone configured to
America/Toronto; Prisma pooled sessions must nevertheless be pinned to UTC.

This test does **not** prove that the business-level stock reservation
algorithm is correct, that cashier invoices are reconciled, or that
payments are safe. It only covers timestamp persistence and expiry
predicates. No live UAT record, API feature flag, or public portal routing
should be modified for this test-only change.

Related work: #109 and PR #111. The POS-integrated deployment remains a
separate application version, although its compiled database adapter was
verified to use UTC.
