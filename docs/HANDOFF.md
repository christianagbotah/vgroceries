# Handoff — current production authorities and next integration wave

This is the engineering handoff for Variety Groceries after the **Fulfilment + Stock Handover Authority** implementation. The repository now contains both the polished frontend/prototype surface and a real NestJS/PostgreSQL backend for the highest-risk commerce authorities.

## 1. Current backend authority boundary

The production API now owns these capabilities:

1. **Identity, sessions and authorization** — web/native authentication, durable sessions, role/location grants and guarded staff routes.
2. **Catalogue + inventory** — publication-aware catalogue reads, safety-stock-aware availability, receiving, lots/expiry, reservations and audit/outbox history.
3. **Commerce reservations + checkout/orders** — atomic multi-line reservation, guest/customer ownership, delivery slots, order tracking, cancellation and idempotency.
4. **Payments** — provider-neutral initiation, raw provider evidence, authoritative reconciliation, duplicate callback safety, late-payment recovery and admin ledger.
5. **Refunds** — durable refund obligations, approval/execution/reconciliation, cumulative capture limits, retries and safe customer projections.
6. **Fulfilment + stock handover** — administrator fulfilment queue/detail, confirmation, picking, pick correction, packing and exactly-once handover/collection stock depletion.

The production OpenAPI surface is **35 paths**, including exactly seven administrator fulfilment paths.

## 2. Stock authority invariant

The backend now enforces the inventory invariant that matters most:

`availableToSell = sellable physical stock - active reservations - safety stock`

Picking and packing **do not** decrement physical stock. Physical stock is consumed at exactly one authoritative boundary:

- delivery order: when the packed order is handed to dispatch;
- collection order: when the packed order is handed to the customer.

`StockDepletionService.consumeClaim(...)` validates exact active reservation coverage, locks reservation/lot provenance, aggregates quantities per lot, decrements physical stock once, marks reservations consumed, writes immutable depletion history and emits audit/outbox effects in the same transaction. Retries and concurrent handovers cannot double-deplete stock.

After stock handover, ordinary cancellation is no longer a reversal mechanism. A future physical Return must own any stock coming back into inventory.

## 3. Frontend swap point

Frontend operations still route through `src/services/client.ts` and the HTTP adapter. The z.ai continuation wave already made the `/admin/fulfilment` workspace compatible with server-derived `allowedActions`, picker/progress/shortage data, packed metadata and handover state.

Production cutover should replace remaining mock operations capability-by-capability rather than replacing the frontend architecture. Do not infer operational authority from visual state; render the backend response and its `allowedActions`.

## 4. Next implementation sequence

The next backend sequence is:

1. **Dispatch + rider authority** — ready-to-dispatch queue, assignment, rider availability, provider/manual booking, pickup/POD, failed delivery and safe retry.
2. **COD cash collection + rider remittance** — keep delivery completion, customer cash collection and rider remittance as three separate events/ledgers.
3. **Physical Returns Authority** — full/partial return, actual received quantity, condition/disposition, saleable restock vs quarantine/damaged/unsafe, lot provenance and no phantom stock.
4. **POS Authority** — counter-sale workflow reusing the same inventory depletion primitive, cashier/session controls and cash/MoMo/card settlement boundaries.
5. **Storefront production cutover** — replace remaining mock-backed public/account operations once the required production API authorities exist.
6. **Reports/AI/provider integrations** — derivative work only after the transactional ledgers above are authoritative.

## 5. Deliberately closed scope

The current backend does **not** yet claim production authority for live courier integrations, dispatch/rider workflows, COD cash/remittance, physical returns/restocking, POS cashier sales, live Hubtel activation, SMS/email/push, live AI execution or complete public-storefront cutover.

Do not create placeholder endpoints that pretend these are implemented. Keep manual/provider adapter boundaries explicit until each authority is designed, tested and landed.

## 6. Verification checkpoint

Implementation head verified before this documentation update:

- branch: `feat/fulfilment-handover-20261012`
- implementation SHA: `f07f86c098460285e9b73a8963d3fad5204b99c6`
- PR: `#12`
- PostgreSQL 17: migrations **001–006** applied successfully
- API integration/security/concurrency tests: **267/267 pass**
- production OpenAPI: **35 paths**, two consecutive byte-identical generations, zero committed drift
- root CI: ESLint, TypeScript and production build pass
- Bun regression tests: **50/50**
- handoff regression assertions: **24/24**
- shared contract checks: **32/32**
- business acceptance checks: **24/24**
- route sweep: **58/58 HTTP 200**
- GitHub Actions associated with the implementation head: **CI success** and **API foundation success**

See `docs/VERIFICATION.md` for the current evidence record and `docs/ZAI_FRONTEND_HANDOFF.md` for the frontend continuation wave.
