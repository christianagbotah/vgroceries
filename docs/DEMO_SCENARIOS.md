# Demo scenarios

All data is fictional. Reset any time from **/admin/demo → Reset all demo data** (or
`POST /api/mock/v1/demo/reset`).

## The golden path (core vertical workflow)

1. **Shop**: `/` → `/shop` (search “rice”, filter category, sort by price) → open a product.
2. **Cart**: add items (quick-add or product page), adjust quantities; unavailable items warn.
3. **Checkout** `/checkout`: guest details, delivery (zone, slot, Ghana address with optional
   GhanaPostGPS) or collection; pay with **Mobile Money**; place order.
4. **Payment**: on `/checkout/status/[id]` approve the payment prompt (customer roleplay) →
   payment confirmed. Try “Payment was declined” on another order to see the failed path.
5. **Staff confirm**: `/admin/fulfilment` → *Awaiting confirmation* → Confirm.
6. **Pick**: *To pick* → Start picking → FEFO lot suggestions appear (variant, unit, quantity, lot).
7. **Pack** → then **Dispatch** `/admin/dispatch` → Assign rider (e.g. Abena Dufie).
8. **Rider**: `/rider/login` (same rider) → the job is waiting → Accept → Confirm pickup
   (**stock consumed once here**) → Start delivery → Mark delivered with a PIN (collect cash if COD).
9. **Customer**: `/track` with the reference + code (both from checkout) → delivered with proof.
10. **Dashboard** `/admin`: totals and queues reconciled at every step.

## Inventory scenarios

- **Zero stock hidden**: `/shop` never lists *Sachet Water* (lot qty 0). Open
  `/products/sachet-water` directly — clear unavailable state, purchasing disabled.
- **Final-unit conflict**: `/admin/demo` → “Reserve the last Frozen Chicken online”, then at
  `/admin/pos` search “chicken” — availability 0 and completion is rejected (OUT_OF_STOCK).
- **Reserved vs physical**: `/admin/inventory` shows physical, reserved, safety and available
  columns (tomatoes and eggs carry active holds).
- **Receiving**: `/admin/inventory/receiving` → receive a lot (try tomatoes, 10 kg, expiry in 7
  days, supplier Accra Agro) → stock and storefront update immediately.
- **Adjustments**: `/admin/inventory/adjustments` → request −2 on a lot → pending approval →
  approve (movement recorded). A seeded pending adjustment (damaged biscuits) awaits you.
- **Stocktake**: `/admin/inventory/stocktakes` → new stocktake → select items → enter counts →
  variances (the seeded ST-0011 has a −2 gari variance to review) → close with corrections.
- **Expiry**: `/admin/inventory/expiry` — expiring ≤ 7 days (tomatoes, okro, fresh milk, Milo,
  mango juice…), expired (shito, milk lot B), quarantined (returned yoghurt), damaged (biscuits).
  Quarantine or dispose with reasons.

## Payment scenarios

- **Pending payment**: order `VG-3P7K2D` (track ref `VG-3P7K2D` + code `K4V9T2`) — Mobile Money
  pending with **two callbacks** recorded; status screen keeps polling, never double-charges.
- **Duplicate callback**: `/admin/demo` → “Fire a duplicate payment callback” → state unchanged.
- **Late payment → review**: order `VG-6M4X2R` (code `R2K7F5`) — paid after its reservation
  expired; `/admin/orders/[ord_1013]` shows the review panel: resolve by re-checking stock or
  cancel-and-refund.
- **Failed payment**: order `VG-4D9L2H` (card declined → cancelled, holds released).
- **Forced failure**: `/admin/demo` → “Toggle forced payment failure” → next approved payment fails.

## Delivery scenarios

- **COD triple-event separation**: order `VG-9W4N8B` is out for delivery with rider Yaw; the job
  carries cash-to-collect separately; delivery, collection and remittance are distinct timestamps
  (see `/admin/dispatch` → Active jobs and the rider history).
- **Failed delivery → rescheduled**: order `VG-7G3K9J` (customer absent) — dispatch shows the
  failure reason and reschedule; **no phantom stock re-add**.
- **Failed delivery → return to store**: from `/admin/dispatch` → Manage → Return goods to store →
  goods enter quarantine (not resold automatically).

## Returns & refunds scenarios

- **Partial return with completed refund**: order `VG-8Q2M1A` (track code `7H2K9P`) — 2 of 4
  yoghurt returned damaged, ₵40 refunded through Mobile Money (provider ref shown); payment status
  *partially refunded*; damaged tubs sit in quarantine — never purchasable.
- **Awaiting approval**: return `RTN-2002` (3 dented sardine tins from `VG-9S1Z4T`) — approve,
  receive, inspect (choose a disposition), request refund. `/admin/refunds`: approve → **first
  execution fails (retryable demo)** → retry → succeeded.
- **Limit enforcement**: try returning more sardines than remain eligible → REFUND_LIMIT_EXCEEDED.
  Try a second refund request on the same return → rejected.
- **Manual refund recording**: refund `REF-3003` (counter return) — clearly identified, requires
  finance reviewer sign-off.

## POS scenarios

- **Counter sale**: `/admin/pos` (needs an open session — open with float ₵100) → scan barcode
  `6001234000011` (tomatoes) or search → tap tiles → cash payment with change calculation →
  receipt (print) → storefront stock and dashboard update.
- **Held sales**: Pause a sale → it reserves stock for 20 minutes → Resume revalidates.
- **Transaction lookup & return**: look up receipt `R-00001` → start a return from the original
  transaction.
- **Idempotency**: replays of the same completion key return the original receipt (see
  scripts/acceptance-checks.sh).

## AI scenarios (deterministic, clearly labelled)

- `/account/lists` → *Budget basket*: suggest a basket within a stated budget, review, add to cart.
- `/admin/ai`: replenishment (diapers), expiry promotions (Milo lot), dispatch grouping, payment
  explanations, exception flags (customer return patterns), business questions
  (“How were today's sales?”). Every suggestion lists evidence and its data period; nothing
  sensitive executes automatically; status says *deterministic demo*, never “Live AI”.

## Failure & honesty scenarios

- `/admin/demo` → latency 2000ms: skeletons and honest slow-state messaging.
- Offline mode: operations return a real 503 and screens show error states with retry.
- Rider notes: on a rider job, try sending a note (offline mode on) — it stays visibly *pending*
  and is never claimed as delivered.

## Demo data snapshot

52 products · 10 categories · 4 suppliers · 3 purchase orders · 14 orders · 11 payment attempts ·
2 cashier sessions · 5 riders · 4 delivery jobs · 3 providers · 3 returns · 3 refunds · 8 staff ·
5 seeded AI suggestions · audit trail. Every figure on dashboards/reports derives from these
records.
