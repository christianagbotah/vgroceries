# NestJS / PostgreSQL foundation

The API is implemented under `apps/api`. The existing Next.js frontend remains
at the repository root and continues in its existing demo mode. This is a private
integration milestone, not a public shop cutover or a completed commerce backend.

Shared contracts now live in `packages/contracts`. Existing web imports under
`src/services/contracts` and `src/types/domain.ts` are compatibility exports;
there is one definition rather than separate mock and production copies. The
package builds without Next.js, React, Prisma or mock-store dependencies. Its
identity contracts support web and future customer/rider native clients.

## Implemented HTTP surface

All paths below have the `/api/v1` prefix. The current generated specification
is `docs/openapi-foundation.json`, also served at `/api/v1/openapi.json`.
`docs/openapi.yaml` remains the broader 92-operation integration target.

| Methods and paths | Access / behavior |
| --- | --- |
| `GET /health/live`, `/health/ready` | Process liveness and PostgreSQL connectivity |
| `POST /auth/sessions` | Email/password sign-in; explicit web/native channel |
| `GET /auth/me` | Current durable actor; web CSRF token can be recovered after reload |
| `POST /auth/logout` | Revoke current session; clear web cookie |
| `POST /auth/refresh` | Rotate native access/refresh tokens; reuse revokes the family |
| `GET /catalog/categories`, `/catalog/home` | Published category/home data; no demo order tracking |
| `GET /catalog/products`, `/catalog/products/{slug}` | Bounded search/paging/sort and product detail |
| `POST /catalog/products:by-variants` | Resolve 1–100 public variant IDs |
| `GET /inventory/overview` | Owner admin at any active location; inventory manager at granted locations |
| `POST /inventory/receive` | Same permissions, whole-request validation and durable idempotency |
| `GET /checkout/zones`, `GET /checkout/zones/{zoneId}/slots` | Public active delivery configuration and derived slot capacity |
| `POST /checkout/quote` | Public authoritative current-price/availability quote; no stock promise |
| `POST /checkout/complete` | Customer/guest atomic order + Inventory reservation + optional slot booking; durable replay |
| `GET /orders/{orderId}`, `POST /orders/track` | Owner-safe status and reference+verification-code capability tracking |
| `GET /account/orders`, `POST /account/orders/{orderId}/cancel` | Customer-owned history and atomic pre-handover cancellation |

Catalogue list filters to available products at `API_STOCK_LOCATION_ID`. Product
detail can display a published, out-of-stock product. Disabled categories and
variants stay out of public responses. `popular` sorting currently uses a stable
name order and home `popular` is empty: there are no persistent sales records yet.
Currency is GHS, prices use integer pesewas, and labels use ₵.

Availability is a PostgreSQL view over eligible physical lots minus active,
unexpired reservations and safety stock. Expiry uses UTC dates; lots expiring
today are ineligible. Quarantine/damage/disposal are excluded and quantities use
exact decimals. Read-time checks work without an expiry worker. The first
Commerce Authority slice now adds an internal, lot-specific FEFO allocation
service with transactional position locks, whole-request rollback, safety-stock
protection and release/expiry. There is still no standalone public reservation HTTP command: online checkout now consumes the internal allocator atomically, while POS and stock depletion/handover remain later slices. See `COMMERCE_RESERVATION_CORE.md` and `CHECKOUT_ORDERS_AUTHORITY.md`.

Receiving requires an `Idempotency-Key` of 8–128 letters/digits/`_`/`:`/`-`.
Same actor, operation, key and normalized request replays the original receipt;
changed data returns `IDEMPOTENCY_CONFLICT`. Receipt, lots, append-only movements,
audit, outbox and replay outcome commit in one transaction. Transactions lock
scoped replay keys and stock positions in a consistent order. Quantities have
at most three decimal places; count-based units require whole quantities. Invalid
second lines or database event-write failures roll back all effects. Expired
receiving is retained physically in quarantine. Suppliers/purchasing are not
implemented, so `supplierId` is explicitly refused. Client `actor` fields never
establish identity.

## Identity and deployment policy

Passwords use salted scrypt. Random session/access/refresh secrets are hashed in
PostgreSQL. Web sign-in sends an HttpOnly, SameSite=Lax, Secure-by-default cookie
scoped to `/api/v1`; authenticated cookie mutations require a trusted Origin and
`X-CSRF-Token`. Web responses do not expose bearer/session secrets. Web sessions
expire after eight hours. Native access lasts 15 minutes, refresh families 30
days; rotation retires the old access token. Concurrent refresh reuse revokes the
whole family, including the newly issued access token. Native clients must
serialize refresh and persist refresh credentials in device secure storage.

User activity, role and location grants are read again on each protected request.
Customer and rider roles have no inventory privileges. The initial owner is
created by an explicit CLI, not public registration or the demo role picker.
The `admin` role represents the business owner and has access to every active
stock location. Inventory managers require explicit location grants for reads
and receiving; grants cannot confer an admin role.
Registration, recovery, verification, MFA and the real frontend sign-in UX are
follow-up work before production activation.

Login budgets are durable across API replicas: five attempts per normalized
email and 100 per source IP in a 15-minute window (successful attempts count too).
The API trusts forwarded addresses only from loopback. A local reverse proxy
must overwrite forwarding headers; do not broaden proxy trust without an explicit
network policy. Origin allowlists are exact and HTTPS is required in production.
Host defaults to loopback. For same-site cookies, place web and API behind the
same HTTPS origin with `/api/v1` routed to NestJS. Different sites require a
separately reviewed cookie/CSRF policy.

## Local integration setup

Use Node 24 and an independent PostgreSQL 17 database. Run from the repository:

```sh
npm ci --prefix packages/contracts
npm run --prefix packages/contracts build
npm ci --prefix apps/api
cd apps/api
cp .env.example .env
```

Set a real local database URL and configured location ID in `.env`. Keep real
credentials out of git. For each subsequent command load the same environment;
Prisma commands read shell `DATABASE_URL`, while runtime scripts load `.env`.

```sh
node --env-file=.env node_modules/prisma/build/index.js migrate deploy
npm run generate
npm run build
# Supply OWNER_EMAIL, OWNER_PASSWORD (12–256 characters), OWNER_NAME in your shell.
npm run owner:create
# Explicit sample catalogue only, prohibited with NODE_ENV=production:
npm run seed:preview
npm start
```

Preview seeding creates distinctly labelled sample records without credentials.
Re-running it does not replenish an existing preview lot. Production catalogue
import/editing and actual receiving must use reviewed business commands; preview
records are not real stock.

Do not set the web `API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` to this partial API
for a public shop. Many screen operations intentionally return 404 until their
backend modules exist; the frontend must never fall back to mock checkout with
a live catalogue.

## Verification and follow-up

`npm test --prefix apps/api` builds and exercises real HTTP with PostgreSQL. It
requires a disposable database named `variety_foundation_test` and truncates test
records. CI provisions PostgreSQL, deploys migrations to an empty database, runs
the API suite and checks generated OpenAPI drift. The existing frontend workflow
still checks its own build, regression suites, contracts and routes.

Outbox records are durable, but there is no publisher/Redis/BullMQ worker in this
milestone. Lot-specific reservation allocation is now implemented internally and
audited in the caller transaction. POS workflow, handover/depletion, worker publishing, payments/refunds, staff fulfilment/dispatch, full admin CRUD, native screens and grounded AI are subsequent work. No provider credentials or AI
calls were introduced.
Identity and resource guards are reusable by those modules; AI tools will invoke
the same authorised domain commands and cannot directly alter stock or money.

Backend dependency overrides pin patched `deepmerge-ts`, `mysql2` and `js-yaml`
versions until upstream constraints include them. Full API/CLI verification is
required when updating these pins. They do not change the web dependency graph.

## Checkout and orders authority

The production API now includes durable quote/checkout/order-read/tracking/cancellation primitives described in `docs/CHECKOUT_ORDERS_AUTHORITY.md`. Inventory remains the sole reservation writer. Online checkout reuses that authority atomically; payments, stock handover/depletion, POS, staff fulfilment/dispatch and public web cutover remain closed.
