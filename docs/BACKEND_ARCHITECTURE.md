# Variety Groceries — Backend Architecture (NestJS + PostgreSQL + Redis/BullMQ)

**Status:** design for the production backend the engineering team implements after this handoff. The frontend's business rules (mock engines) are the behavioural specification — the seven audited defects were corrected and are locked by regression tests, so the engines now describe the *intended* rules precisely.
**Scope:** modular NestJS application, PostgreSQL schema, Redis/BullMQ workers, transactional outbox, migration path from the current Next.js prototype. Companion documents: [`API_CONTRACTS.md`](API_CONTRACTS.md) (surface), [`MOBILE_READINESS.md`](MOBILE_READINESS.md), [`AI_ARCHITECTURE.md`](AI_ARCHITECTURE.md).

---

## 1. Target workspace

A pnpm/bun workspace keeps web, API, workers, mobile and shared contracts in one repository without forcing a wholesale rewrite — the current Next.js app moves in as `apps/web` **unchanged** (its adapter seam already speaks the contract).

```
vgroceries/                        (monorepo)
├── apps/
│   ├── web/                       ← the existing Next.js app (this repo, moved as-is)
│   │    src/services/contracts/   ← becomes a re-export of packages/contracts
│   ├── api/                       ← NestJS REST API (/api/v1 — implements docs/openapi.yaml)
│   ├── workers/                   ← BullMQ processors (outbox dispatch, providers, reports, AI)
│   └── mobile/                    ← Expo (React Native) customer + rider apps (later phase)
├── packages/
│   ├── contracts/                 ← src/services/contracts + types/domain, verbatim
│   ├── api-client/                ← ServiceAdapter implementations (HTTP, offline queue, RN fetch)
│   └── config/                    ← shared env/zod schemas, ESLint, tsconfig
└── infra/                          ← docker-compose (postgres, redis, api, workers), migrations
```

**Migration order (proportionate, no rewrite):**

1. Move the current repo into `apps/web` with `packages/contracts` extracted; verify the web build and all five suites still pass (they run against the dev mock adapter).
2. Stand up `apps/api` with identity + catalogue + inventory (read paths first) and point `NEXT_PUBLIC_API_BASE_URL`/`API_BASE_URL` at it — the web app switches by env var only.
3. Port write paths module-by-module (checkout/POS first — they exercise reservations), porting each mock engine's rules as service tests before implementation.
4. Add workers, then providers (payments, couriers), then AI.

The current SQLite/Prisma starter was **deleted from this repo** (unused scaffold); nothing of value is lost — the real schema is below.

---

## 2. Module boundaries (NestJS)

Each module owns its tables, enforces its invariants, and communicates with others via **domain events through the outbox** (never cross-module table writes). Public operations map 1:1 to the REST contract.

| Module | Owns | Key invariants |
| --- | --- | --- |
| **identity** | users, sessions, roles, permissions, api tokens, audit actors | 8 roles × 35 permissions (`docs/PERMISSIONS.md`); customer/rider ownership checks; session revocation |
| **catalogue** | products, variants, categories, units, conversions, barcodes, locations (stores/zones/shelves), pricing history | prices are integers in minor units; price changes audited with before/after; variant unit conversions exact (decimal strings) |
| **inventory** | lots, movements (append-only), reservations, adjustments, stocktakes, expiry, quarantine/disposal | available = sellable physical − reserved, computed from lots; movements immutable; one depletion event per handover; FEFO allocation |
| **orders** | orders, lines, fulfilment state machine, substitutions, order notes/events | server-calculated totals; state machines per channel; consumption requires live reservations |
| **pos** | cashier sessions, movements, holds/drafts, receipts, counter sales | same reservation path as online checkout; session expected-cash arithmetic in integers |
| **payments** | payment attempts, provider events, settlement, reconciliation | idempotent provider callbacks; duplicate events acknowledged not applied; late success → review |
| **returns** | return requests/lines, dispositions, refund caps | once-only dispositions; duplicate-line aggregation; per-return and per-order refund balances |
| **refunds** | refund ledger, approvals, provider transfers, retries | execution revalidates balances; retry continues the same attempt; transfer state tracked |
| **delivery** | zones, slots, jobs, rider lifecycle, POD, COD collection/remittance, provider adapters | delivery state separate from fulfilment; COD triple event (collect → deliver → remit); proof required |
| **suppliers** | suppliers, purchase orders, receipts matching | receiving matches PO lines; lot creation with expiry/location |
| **reports** | read models over the above | derived only from durable records; CSV export same source |
| **audit** | audit trail for every mutation | actor, action, entity, before/after, reason |
| **ai** | provider adapters, retrieval, tools, prompts, usage/cost, audit | see `AI_ARCHITECTURE.md`; reviewable suggestions; never mutates without authorisation |

---

## 3. PostgreSQL schema (authoritative)

Conventions: UUIDs (`*_id`) with app-level prefixed public refs (`ord_…`, `ret_…`) for display; `money` columns are `BIGINT` minor units with a `currency CHAR(3)` default `'GHS'`; quantities are `NUMERIC(12,3)` (never float); all timestamps `TIMESTAMPTZ` (UTC). **Location identifiers** (`location_id`) appear on lots, stock movements, reservations, POS sessions, riders, delivery jobs and purchase receipts — stock is always located.

### 3.1 Core entities

```
users(id PK, role, name, phone UNIQUE, email, password_hash, is_active, created_at, updated_at)
  roles: owner | manager | supervisor | cashier | storekeeper | dispatcher | rider | customer
sessions(id PK, user_id FK, refresh_token_hash, device_id, issued_at, expires_at, revoked_at, revoked_reason)

categories(id PK, parent_id FK NULL, slug UNIQUE, name, description, is_active, sort_order)
products(id PK, slug UNIQUE, name, short_description, description, tags TEXT[], image_ref,
         category_id FK, is_published, created_at)
product_variants(id PK, product_id FK, name, unit_kind, unit_size, barcode UNIQUE NULL,
                 price_minor BIGINT CHECK (price_minor >= 0), compare_at_minor BIGINT NULL,
                 safety_stock NUMERIC(12,3) DEFAULT 0, is_active,
                 location_id FK NULL,                         -- default shelf/bin
                 UNIQUE(product_id, name))
unit_conversions(id PK, variant_id FK, base_unit, alt_unit, factor NUMERIC(12,3) CHECK (factor > 0),
                 UNIQUE(variant_id, alt_unit))
price_history(id PK, variant_id FK, price_minor BIGINT, changed_by FK, changed_at, reason)
locations(id PK, kind /* store|zone|shelf|bin|quarantine */, code UNIQUE, parent_id FK NULL, name)

lots(id PK, variant_id FK, lot_number, location_id FK, kind /* regular|quarantine|damaged|returned */,
     quantity NUMERIC(12,3) CHECK (quantity >= 0), unit_cost_minor BIGINT,
     expiry_date DATE NULL, received_at, supplier_id FK NULL, purchase_id FK NULL,
     source_lot_id FK NULL,           -- set when this lot was created by a return restock
     is_active, CHECK (kind <> 'quarantine' OR quantity >= 0))
stock_movements(id PK, lot_id FK, variant_id FK, delta NUMERIC(12,3),             -- +in / −out
     reason /* receive|sale_consume|return_restock|return_dispose|adjust|stocktake|quarantine|transfer */,
     order_id FK NULL, return_id FK NULL, reservation_id FK NULL, adjustment_id FK NULL,
     resulting_quantity NUMERIC(12,3), actor_id FK, occurred_at, note,
     dedupe_key UNIQUE NULL)          -- e.g. "consume:{orderId}" → duplicate execution rejected

reservations(id PK, variant_id FK, order_id FK, quantity NUMERIC(12,3) CHECK (quantity > 0),
     status /* active|consumed|released|expired */, expires_at, consumed_at, consumed_by_movement_id FK NULL,
     released_at, released_reason, created_at)
```

**Availability is derived, never stored loosely:** `sellable_physical(variant, location) = Σ active lots(kind regular, not quarantined, not expired, quantity>0)`; `reserved = Σ reservations active`; `available_to_sell = sellable_physical − reserved − safety_stock`. The frontend's availability engine (`src/services/mock/engine/availability.ts`) is the reference semantics.

### 3.2 Orders, POS, payments

```
orders(id PK, reference UNIQUE, verification_code, channel /* online|pos */, customer_id FK NULL,
     customer_name, customer_phone, address_snapshot JSONB, zone_id FK NULL, slot_id FK NULL,
     fulfilment /* delivery|collection */, status /* see state machine */,
     subtotal_minor BIGINT, discount_minor BIGINT DEFAULT 0, delivery_fee_minor BIGINT DEFAULT 0,
     total_minor BIGINT, currency CHAR(3) DEFAULT 'GHS', payment_method,
     payment_status, fulfilment_status, delivery_status,   -- three SEPARATE dimensions
     stock_consumed_at TIMESTAMPTZ NULL, pos_receipt_no UNIQUE NULL, pos_session_id FK NULL,
     idempotency_key UNIQUE NULL, created_at, cancelled_at NULL, cancel_reason)
order_lines(id PK, order_id FK, variant_id FK, product_id FK, product_name, variant_name, unit,
     quantity NUMERIC(12,3) CHECK (quantity > 0), unit_price_minor BIGINT, line_total_minor BIGINT,
     note, substitution_of_line_id FK NULL, allocated JSONB /* [{lotId,quantity}] */)
order_events(id PK, order_id FK, actor_id FK, action, from_status, to_status, note, occurred_at)

cashier_sessions(id PK, cashier_id FK, opened_at, closed_at NULL, opening_float_minor BIGINT,
     status, counted_cash_minor BIGINT NULL, difference_minor BIGINT NULL, close_note, location_id FK)
cash_movements(id PK, session_id FK, kind /* cash_in|cash_out|drop */, amount_minor BIGINT, note, at)
pos_drafts(id PK, session_id FK, label, lines JSONB, expires_at, released_at NULL)

payment_attempts(id PK, order_id FK, method, amount_minor BIGINT, status /* pending|succeeded|failed|expired|requires_review */,
     provider_ref UNIQUE NULL, provider, failure_reason, settlement_state /* unsettled|settled|reconciled|exception */,
     callback_count INT DEFAULT 0, idempotency_key UNIQUE NULL, created_at)
provider_events(id PK, provider, event_type, payload JSONB, processed_at NULL,
     dedupe_key UNIQUE, received_at)                     -- idempotent webhook intake
```

### 3.3 Returns, refunds, delivery

```
return_requests(id PK, reference UNIQUE, order_id FK, customer_id FK NULL, channel, status,
     requested_by, evidence_note, received_at NULL, inspected_at NULL,
     disposition_kind NULL /* restock_saleable|restock_quarantine|dispose */,
     disposition_note, disposition_by FK NULL, disposition_at NULL, created_at)
return_lines(id PK, return_id FK, order_line_id FK, quantity NUMERIC(12,3) CHECK (quantity > 0),
     reason, requested_refund_minor BIGINT, approved_refund_minor BIGINT NULL)
  -- CHECK + trigger: aggregated quantity per order_line across ALL returns ≤ original line quantity
refunds(id PK, reference UNIQUE, return_id FK NULL, order_id FK, amount_minor BIGINT,
     method, reason, status /* requested|awaiting_approval|approved|processing|succeeded|failed|cancelled */,
     requested_by FK, approved_by FK NULL, provider_ref NULL, provider_transfer_state,
     retry_count INT DEFAULT 0, idempotency_key UNIQUE NULL, created_at, executed_at NULL)

delivery_zones(id PK, name, areas TEXT[], fee_minor BIGINT, minimum_order_minor BIGINT,
     service_hours, cutoff, slots_per_day INT, is_active)
delivery_slots(id PK, zone_id FK, date DATE, window_label, capacity INT, booked INT,
     UNIQUE(zone_id, date, window_label))
delivery_jobs(id PK, order_id FK, status /* unassigned|assigned|accepted|picked_up|out_for_delivery|delivered|failed|rescheduled|return_to_store */,
     rider_id FK NULL, provider_id NULL, instructions, cash_to_collect_minor BIGINT NULL,
     cash_collected_at NULL, remitted_at NULL, failure_reason, rescheduled_for,
     location_id FK NULL, created_at)
delivery_events(id PK, job_id FK, actor_id FK, action, note, occurred_at)
delivery_proofs(id PK, job_id FK, method /* photo|signature|otp|note */, detail, media_ref, at)
riders(id PK, user_id FK, kind /* in_house|contract */, vehicle, is_available, active_job_id FK NULL,
     last_location_at, last_location_lat NUMERIC NULL, last_location_lng NUMERIC NULL, last_location_label)

suppliers(id PK, name, phone, email, notes, is_active)
purchase_orders(id PK, reference UNIQUE, supplier_id FK, status /* draft|sent|received|closed */,
     expected_on DATE NULL, note, created_at, sent_at)
purchase_lines(id PK, po_id FK, variant_id FK, quantity NUMERIC(12,3), unit_cost_minor BIGINT)

adjustments(id PK, variant_id FK, lot_id FK NULL, delta NUMERIC(12,3), reason, note,
     status /* requested|approved|rejected */, requested_by FK, decided_by FK NULL, decided_at NULL)
stocktakes(id PK, reference UNIQUE, status /* open|closed */, opened_by FK, closed_at NULL)
stocktake_lines(id PK, stocktake_id FK, variant_id FK, expected_qty NUMERIC(12,3),
     counted_qty NUMERIC(12,3) NULL, variance NUMERIC(12,3) NULL)

audit_log(id PK, actor_id FK, action, entity_type, entity_id, before JSONB, after JSONB,
     reason, occurred_at)  -- append-only, no UPDATE/DELETE grants

idempotency_records(scope, key, request_hash, response JSONB, created_at,
     PRIMARY KEY (scope, key))     -- replay + conflict detection
outbox(id PK, aggregate_type, aggregate_id, event_type, payload JSONB, created_at,
     dispatched_at NULL, attempts INT DEFAULT 0, last_error NULL, next_attempt_at)
```

### 3.4 Constraints that encode the business rules

| Rule | Enforcement |
| --- | --- |
| Positive quantities everywhere | `CHECK (quantity > 0)` on order_lines, return_lines, reservations, purchase_lines + zod at the edge (the POS negative-quantity defect class) |
| Separate state dimensions | Three columns on `orders`; three state machines in services; no derived coupling |
| One depletion per handover | `stock_movements.dedupe_key UNIQUE` (`consume:{orderId}`) + `orders.stock_consumed_at` written in the same transaction |
| Reservation integrity | Consumption transaction: `SELECT … FOR UPDATE` the active reservations of the order; require full coverage; require lot physical ≥ allocation before any mutation |
| Refund ceilings | Trigger/service: Σ succeeded + Σ unresolved(processing/awaiting) refunds per return ≤ approved refundable; per order ≤ paid − already refunded |
| Idempotent checkout | `idempotency_records(scope='checkout', key)` unique; same hash → replay, different hash → conflict |
| Audit | Row-level security: `audit_log` insert-only for the app role |
| Outbox atomicity | Outbox insert happens in the SAME transaction as the state change (see §5) |

### 3.5 Migration approach

1. Prisma (or Drizzle — either works; Prisma matches the team's NestJS convention) schema from §3, generated into `apps/api`.
2. Seed from the prototype's fixtures: `src/services/mock/seed-catalog.ts` (52 products/10 categories) and `seed-ops.ts` (14 scenario orders, payments, returns, jobs) port to seed scripts — the demo scenarios keep working against PostgreSQL, and the acceptance suites (which run over HTTP) transfer unchanged.
3. Cutover per §1: reads first, then checkout/POS, then the rest; at every step the 21+3 acceptance checks, 7-defect regressions and 30 contracts checks must pass against the new backend.
4. The SQLite starter is gone; no data to migrate.

---

## 4. Money, quantities, and calculation policy

- **All money is `BIGINT` minor units** (pesewas). No float columns, no float arithmetic anywhere authoritative. Line totals = integer price × integer-scaled quantity, computed server-side with exact decimal math (`NUMERIC` semantics, banker-free truncation policy documented per market rule); totals = Σ line totals − discount + delivery fee. Discounts/taxes are configured amounts in minor units with documented rounding at the line vs order level (single choice, enforced in one shared money service).
- **Quantities are `NUMERIC(12,3)`** decimal strings over the wire (never JS numbers); unit conversions use exact factors (`NUMERIC`), never binary floats.
- **Prices, totals and refund caps are always server-calculated** — the client may display but never submit them. Refund caps: per-line `unit_price × quantity` aggregates, per-return approved amount, per-order paid balance.

## 5. Transactions, outbox, workers

**Transactional, all-or-nothing reservations (shared by checkout and POS):**

```
BEGIN;
  lock variant rows (SELECT … FOR UPDATE on lots/reservations)
  for each line: verify available_to_sell ≥ qty (physical − reserved − safety)
  create order + lines (totals server-computed)
  create reservations (expires_at = now + settings.reservationTtlMinutes)
  insert idempotency record (scope, key, request_hash, response)
  INSERT INTO outbox(order.created)
COMMIT;
```

Any failure rolls back everything — the prototype's behaviour (OUT_OF_STOCK with per-line conflicts, nothing held) is the specification.

**One stock-depletion event per handover:** consumption runs in one transaction — re-lock reservations (all must be `active`, covering the order), re-check lot physical quantities FEFO, write one `stock_movements` row per allocation with `dedupe_key = consume:{orderId}`, set `stock_consumed_at`, mark reservations `consumed`, insert `order.stock_consumed` + `delivery.*` events into the outbox, commit. A retried consumption hits the dedupe key and replays the original result; a released/expired reservation fails with `RESERVATION_LOST` and mutates nothing.

**Outbox pattern:** every state change that needs background work (provider calls, notifications, report refresh, AI enqueue) writes its event in the same transaction. A dispatcher worker polls `outbox WHERE dispatched_at IS NULL AND next_attempt_at <= now()`, delivers to BullMQ queues, and marks rows dispatched with exponential backoff (`attempts`, `last_error` give failure visibility). Workers are separately deployable (`apps/workers`), horizontally scalable, and safe to restart — undelivered events simply retry.

**Queues (BullMQ over Redis):**

| Queue | Jobs | Retry policy |
| --- | --- | --- |
| `outbox-dispatch` | deliver domain events | backoff 1s→5m, 20 attempts, then dead-letter + alert |
| `payments` | provider charge/verify/refund execution | provider-specific; idempotent by provider event key |
| `delivery` | courier dispatch, notifications, slot booking | 5 attempts |
| `reports` | nightly/daily aggregates, CSV builds | 3 attempts |
| `ai` | forecasting, long-running assistance | 3 attempts; see AI doc |

**Monitoring & failure visibility:** worker heartbeats + queue depth + dead-letter counts exported (Prometheus `/metrics`); every failed job appears in an internal ops screen backed by `outbox.last_error` and BullMQ failed-job metadata — no silent drops. The admin dashboard's actionable counters (pending payments, unassigned jobs, exceptions) read the same tables, so staff see failures in-product, not only in dashboards.

## 6. Identity, permissions, ownership

- AuthN: phone + password/PIN (customers), phone + PIN (riders), SSO optional for staff; JWT access tokens (15 min) + rotating refresh tokens with revocation list (`sessions.revoked_at`); service tokens for server-to-server (the web app's server adapter).
- AuthZ: NestJS guards per operation using the 8-role × 35-permission matrix (`docs/PERMISSIONS.md`); policy checks append to `audit_log`.
- Ownership: `account.*` and `rider.*` operations verify `customer_id`/`rider_id` against the session principal → `FORBIDDEN` otherwise. Staff operations require the mapped permission.
- Every mutating endpoint accepts an actor resolution from the session; the prototype's `actor` body fields become derived, not trusted.

## 7. Provider integrations (payments, couriers)

- Hubtel (or chosen PSP) behind a `PaymentProvider` port; webhooks land on `provider_events` with `dedupe_key` (`{provider}:{providerRef}:{eventType}`) — duplicate events acknowledged, never double-applied (the mock's duplicate-callback rule).
- Reconciliation job compares provider settlement reports with `payment_attempts` → `settlement_state: settled|reconciled|exception`; exceptions surface in the payments screen and dashboard counters.
- Couriers behind a `DeliveryProvider` port with the same event-idempotency; in-house riders and manual dispatch remain first-class paths.

## 8. Operational checklist for the implementing team

1. Port each mock engine's rules as service-level tests BEFORE implementing the module (the engines are the executable spec; the regression suites pin them).
2. Concurrency tests: online + POS racing for the final unit must produce exactly one success and one `OUT_OF_STOCK`.
3. Keep `idempotency_records` for checkout, POS, refunds, rider actions, provider events.
4. Preserve the separate payment/fulfilment/delivery/return/refund status machines — no merged "order status".
5. Location identifiers everywhere stock exists or moves.
6. Run the five verification suites from `docs/API_CONTRACTS.md` §8 against the API during the whole migration.
