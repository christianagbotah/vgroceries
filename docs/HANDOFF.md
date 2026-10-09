# Handoff — what to connect and verify first

For the Variety Groceries engineering team taking over from this frontend prototype.

## 1. Read order

1. `README.md` — run the prototype, feel the workflows.
2. `docs/API_CONTRACTS.md` — the operation contracts your backend implements.
3. `docs/PERMISSIONS.md` — roles and enforcement duties.
4. `docs/DEMO_SCENARIOS.md` — every seeded business case you can replay.
5. `docs/KNOWN_ISSUES.md` — the honest boundary list.

## 2. The swap point

Every page talks to operations through **`src/services/client.ts`**. Replace the `api()`
transport with real endpoints (same operation names, envelopes and error codes) and the UI works
unchanged. Delete `src/services/mock/` and `src/app/api/mock/` once the real API is live, and
remove `demo.*` operations plus the demo role selector from production builds.

## 3. Connect in this order (risk-ranked)

| # | Capability | Why first | Notes |
|---|---|---|---|
| 1 | **Catalogue + inventory read API** | Every screen depends on it; lets you validate the availability formula end-to-end | Implement `availableToSell = sellable lots − active reservations − safety stock` in SQL with row locking |
| 2 | **Reservation + depletion transactions** | The core invariant (atomic multi-line holds, single depletion event, idempotency keys) | Wrap in DB transactions; keep `stockConsumedAt` as the once-only marker |
| 3 | **Orders + status machines** | Order detail, fulfilment, tracking | Enforce the five status dimensions server-side exactly as the mock models them |
| 4 | **Authentication + roles** | Staff/rider logins replace the demo pickers | Enforce the PERMISSIONS matrix on every operation |
| 5 | **Payments (Hubtel candidate)** | Real money | Server-side outcome verification only; keep idempotency keys, duplicate-callback handling and the late-payment review flow |
| 6 | **Dispatch + riders** | Operations | Provider adapter (quote/book/cancel/status/webhook/POD) once the owner selects couriers; manual booking fallback stays |
| 7 | **Returns/refunds ledger** | Financial correctness | Cumulative limits, dispositions, manual-recording controls; authoritative tax treatment (owner-configured) |
| 8 | **Reports/AI** | Derivative | Reports read your ledger; AI adapters are provider-neutral with evidence and review-before-execute |

## 4. Verify first (fastest confidence)

Run these in production-parity order — each maps to a seeded demo you can compare against:

1. Zero-availability variant disappears from lists/search but resolves with an unavailable state
   on a saved link (demo: *Sachet Water*).
2. Atomic multi-line checkout: force a conflict (demo: last *Frozen Chicken*) and confirm
   line-level errors with no stray holds.
3. Reserve online → POS blocked on the same final unit.
4. Dispatch pickup consumes stock exactly once; replay the action (no double deduction).
5. Late payment after reservation expiry reaches staff review, then either re-reserves or
   cancels+refunds.
6. Partial return → refund preview consistent; second refund beyond the paid balance rejected.
7. Damaged return disposition never restocks.
8. COD: delivery, cash collection and rider remittance as three separate recorded events.
9. Cashier close: expected vs counted difference recorded with a note.

## 5. Data model starter

`src/types/domain.ts` is a complete, typed domain sketch (IDs, UTC stamps, minor units, decimal
string quantities, the five status families). PostgreSQL is the proposed datastore; the mock
seeds (`src/services/mock/seed-*.ts`) double as fixture specifications for your first migration
and test data.

## 6. Environment

`.env.example` lists the variable names the future integrations expect — placeholders only. Do not
deploy this prototype to varietygrocery.com and do not initiate real payments from it.
