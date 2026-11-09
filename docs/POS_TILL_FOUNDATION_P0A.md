# POS P0a — Administrator Cash-Drawer Foundation

**Scope:** preliminary till opening, recorded cash-in / cash-out / cash-drop,
and immutable drawer-only close evidence. This is **not** a production POS
checkout, cash-invoice system, cash remittance or merchant settlement ledger.

**Feature gate:** `POS_TILL_FOUNDATION_ENABLED=false` by default. The only
roles allowed by this first backend slice are authenticated administrators.
Cashier and supervisor role delegation requires future explicit permission
work, device/till assignment and independent authorization review.

## Backend authority

- PostgreSQL migration `202611090035_pos_till_session_foundation` establishes
  cash drawer sessions and append-only movement evidence.
- A physical till may have at most one open session per active location,
  enforced through a partial unique index.
- Opening records active administrator identity, till code, float and date.
  The administrator cannot alter a recorded opening float afterwards.
- Drawer movements are positive integer pesewa amounts. Cash-out/drop cannot
  exceed recorded drawer cash. Customer/payment claims do not appear here.
- Closing requires the administrator to count physical drawer cash and record
  a reason. The database independently checks the expected drawer balance
  derived from opening float and immutable cash movements, and records any
  difference. An already closed drawer cannot be modified or reopened.
- Every mutation requires a request-scoped Idempotency-Key. The service locks
  the till for concurrent operations, stores deterministic replay snapshots,
  and records an audit event. Database triggers reject direct-SQL actor,
  balance, evidence and state forgery.

## Administrator API

- `GET /api/v1/admin/pos/tills` — read bounded recent sessions.
- `GET /api/v1/admin/pos/tills/{sessionId}` — read immutable snapshot plus moves.
- `POST /api/v1/admin/pos/tills` — open session.
- `POST /api/v1/admin/pos/tills/{sessionId}/movements` — record drawer movement.
- `POST /api/v1/admin/pos/tills/{sessionId}/close` — close and count drawer.

All POST bodies are strict contract schemas, not arbitrary JSON.

## Non-goals and activation prohibition

This foundation does **NOT** include sales, till cash from sales,
discount approval, online/POS reservation competition, payment terminal
verification, tax, customer refund, cash-on-delivery remittance or supplier
payout. The `expectedDrawerOnlyMinor` total explicitly **excludes sales**,
and every result states `includesSales:false` so it cannot be confused with
real closing cash reconciliation.

The existing mock POS and cashier-session frontend remain simulated. Do not
wire these draft authority endpoints to real users or rename the old demo
receipts as production transactions.

## Next POS P0b/P0c

1. Design atomic counter-order creation against the exact shared stock and
   reservation/depletion authority used by online checkout; prove last-unit
   online/POS concurrency and idempotent handover.
2. Add payment-tender evidence: cash counted by authorised cashier, verified
   MoMo/card provider results, mixed tenders and change. Never record an
   unverified electronic tender as captured.
3. Connect committed cash sales and authorised cash refunds to till sessions
   before enabling full shift reconciliation. Supervisor approval, discrepancy
   and independent payment settlement follow.
4. Replace frontend mock adapter only after the API is hardened, production
   OpenAPI matches, both CI workflows are green, and real UAT with printed
   receipts is accepted.

**Release:** apply migrations on restored UAT first; run replay/concurrent
opening, direct SQL, role, negative-cash and money/stock non-mutation tests.
Leave this feature flag OFF in production until complete POS reconciliation
and operator training are approved.
