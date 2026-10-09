# Variety Groceries — storefront & retail operations frontend

A complete, polished **frontend prototype** for a Ghanaian grocery business: customer storefront,
staff back office (orders, fulfilment, POS, inventory, purchasing, dispatch, returns, refunds,
reports, AI), and a mobile-first rider workspace — all running on one shared, stateful demo
service behind a clean, replaceable **service-adapter boundary** with framework-free shared
contracts, an OpenAPI definition of the proposed production REST API, and architecture docs for
the NestJS backend, native mobile apps and AI module.

> **What this is / is not.** This is a working frontend with coherent, stateful demo workflows and
> a documented API boundary. It does **not** have production-safe inventory, real payments, live
> AI, or live courier connections. Our engineering team owns the backend, real integrations,
> authentication, database, and production validation.

## Stack

- **Next.js 16 (App Router) + TypeScript 5 + Tailwind CSS 4 + shadcn/ui** — as supplied by the
  starter environment; no dependency upgrades were made to chase version numbers (`bun.lock`
  pinned).
- One shared **mock service** (single Node process) behind a **two-adapter service boundary**:
  a development-only in-process mock adapter and a **production HTTP adapter with a configurable
  base URL** (`NEXT_PUBLIC_API_BASE_URL` / `API_BASE_URL`) — switching to the NestJS backend is
  an env-var change, no page rewrites.
- **Framework-free shared contracts** (`src/services/contracts/`): request/response types,
  canonical error codes, pagination, idempotency keys, cache-invalidation tags and **zod
  validation schemas** — consumable unchanged by the web app, the NestJS backend and future
  React Native apps.
- Proposed production REST API specified in **`docs/openapi.yaml`** (92 operations) with the
  complete mock→REST mapping in `docs/API_CONTRACTS.md`.
- Money as **integer GHS minor units** (pesewas), quantities as **decimal strings**. No floats as
  stock authority.

## Quick start

```bash
bun install          # dependencies (bun.lock is pinned)
bun run dev          # dev server on port 3000 (or: next dev -p 3000)
```

Then open:

| Interface | URL | Entry |
|---|---|---|
| Customer storefront | `/` | browse, cart, checkout, track |
| Staff back office | `/staff/login` → `/admin` | pick a demo role (owner, ops, inventory, cashier, picker, dispatcher, finance) |
| Rider workspace | `/rider/login` → `/rider` | pick a demo rider |

Optional checks:

```bash
bun run lint                              # ESLint — clean
bunx tsc --noEmit --incremental false    # TypeScript — 0 diagnostics
bun run build                             # production build (strict TypeScript, 56/56 pages)
bun scripts/handoff-regressions.ts       # 24 handoff-review regression assertions
bun scripts/contracts-check.ts            # 30 shared-contract assertions (schemas + registry)
bash scripts/acceptance-checks.sh         # 24 business-rule scenario checks (resets demo data)
node scripts/route-sweep.mjs             # 56 routes HTTP 200
node scripts/generate-product-svg.mjs     # regenerate product tiles into public/products/
```

## Architecture

```
src/
  app/
    (storefront)/…        customer routes (home, shop, product, cart, checkout, track, account, policies)
    admin/…               staff back office (24 routes, role-gated sidebar)
    staff/login           demo access to the back office (future auth boundary)
    rider/…               mobile-first rider workspace
    api/mock/v1/[...path] dev-only catch-all API → services/mock/router.ts
  components/
    ui/                   shadcn/ui primitives (supplied)
    layout/               storefront header/footer, admin shell, rider shell
    shared/               status badges, states, quantity input, pagination, info shell
  features/
    catalog/              product tiles, purchase panel, shop filters
    checkout/             cart store (zustand + localStorage, non-authoritative)
    staff/                demo role context, admin data hook
  services/
    contracts/           framework-free shared API contracts: types + zod schemas,
                         error codes, pagination, idempotency, cache tags
    adapters/            the service boundary: ServiceAdapter interface, HTTP adapter
                         (configurable base URL), dev-only mock adapter, browser/server
                         resolution, cache-tag invalidation
    operation-registry.ts  per-operation cache tags + mutation invalidation (92 ops)
    client.ts             browser-side typed operation surface (apiOps)
    server-data.ts        RSC-side adapter calls for server-rendered pages
    views.ts              compatibility re-export of contract view types
    mock/                 store (globalThis singleton), seed fixtures, engines, router
  types/domain.ts         all domain models, status machines, labels
  lib/                    money, quantity, id, format, permissions
docs/                     API_CONTRACTS, openapi.yaml, BACKEND_ARCHITECTURE, MOBILE_READINESS,
                          AI_ARCHITECTURE, HANDOFF_FIXES, ROUTES, PERMISSIONS, DEMO_SCENARIOS,
                          VERIFICATION, KNOWN_ISSUES, HANDOFF, HANDOFF_REVIEW, MASTER_PROMPT
scripts/                  acceptance-checks.sh, handoff-regressions.ts, contracts-check.ts,
                          route-sweep.mjs, generate-product-svg.mjs
```

**View components are separate from business operations.** Pages never read fixtures directly and
never import the mock store; everything flows through the **service interface**
(`src/services/adapters/types.ts`). Client components go through `src/services/client.ts` (HTTP →
dev mock route or production API), server-rendered pages through `src/services/server-data.ts`
(in-process mock in development, production API over HTTP when `API_BASE_URL` is set). Both
adapters are typed against the **framework-free shared contracts** and validate request bodies
with the same zod schemas; successful mutations invalidate cached reads by resource family
(stock/orders/payments/returns) so screens refresh after changes. Storefront catalogue pages are
server-rendered for SEO with client islands for interactivity; admin/rider screens are client
components over the same API. Full details: **docs/API_CONTRACTS.md**.

## Documentation index

| Document | Purpose |
|---|---|
| `docs/HANDOFF_FIXES.md` | Fix ledger for the external handoff review: findings → status, the 7 domain defects, verification results, backend integration instructions |
| `docs/API_CONTRACTS.md` | The shared service boundary, conventions, and the complete 92-operation mock→REST mapping |
| `docs/openapi.yaml` | OpenAPI 3.1 definition of the proposed production REST API (`/api/v1`) |
| `docs/BACKEND_ARCHITECTURE.md` | NestJS + PostgreSQL + Redis/BullMQ design: modules, schema, reservations, outbox, workers, migration path |
| `docs/MOBILE_READINESS.md` | React Native/Expo plan: shared contracts, auth, push, camera/barcode, location, offline retries, version compatibility |
| `docs/AI_ARCHITECTURE.md` | AI module design: provider adapters, grounding, permission-controlled tools, streaming, queues, cost/eval/audit |
| `docs/ROUTES.md`, `docs/PERMISSIONS.md`, `docs/DEMO_SCENARIOS.md`, `docs/VERIFICATION.md`, `docs/KNOWN_ISSUES.md`, `docs/HANDOFF.md` | Routes, role matrix, demo walkthroughs, verification log, honest boundary list, original handoff |

## Demo data & reset

- **Seed**: 52 fictional products across 10 categories, with variants (piece/pack/carton/kg/litre
  + purchase-unit conversion factors), lots, expiry dates, suppliers, purchase orders, 14 orders
  (online delivery, collection, POS cash, POS card, pending payment, failed payment, COD
  out-for-delivery, failed-then-rescheduled delivery, near-expiry, partial return with approved
  refund, return awaiting approval, late-payment review case), riders, delivery jobs, payment
  attempts (including a duplicate-callback case), cashier sessions (one closed with a −₵2.40
  difference, one open), returns/refunds, audit events and deterministic AI suggestions.
- **Stock scenarios**: zero-stock (sachet water — hidden from the shop), final unit (frozen
  chicken), low stock (diapers, imported rice), expired lots (shito, fresh milk), quarantined
  (returned yoghurt), damaged (biscuits, chicken), reserved stock (tomatoes, eggs).
- **Reset**: `/admin/demo` → “Reset all demo data”, or `POST /api/mock/v1/demo/reset`. State is
  in-memory and single-process: a dev-server restart also resets it. The browser cart
  (localStorage) survives resets.
- **Demo control panel** (`/admin/demo`, staff-only): latency simulation, offline mode, forced
  payment failure, reservation expiry, last-unit conflict setup, duplicate callback, pending
  payment seeding.

## Demo access

Demo identities are fictional. The role selector is demo-mode-only and must be excluded/disabled
in production; the backend must enforce access on every protected operation.

| Role | Person | Can (summary) |
|---|---|---|
| Owner/Admin | Ama Boateng | everything |
| Operations Manager | Kojo Asante | orders, fulfilment, dispatch, returns, catalogue |
| Inventory Officer | Nana Yaa Osei | stock, receiving, adjustments, stocktakes |
| Cashier | Adjoa Yeboah | POS, sessions |
| Picker/Packer | Kweku Fosu | picking, packing |
| Dispatcher | Dela Agbeko | dispatch, riders |
| Finance/Refund Reviewer | Serwaa Owusu | refunds, payments, reports |
| Rider | Kwabena, Yaw, Abena, Kofi, Efua | rider workspace |

Try the golden path: shop → add to cart → checkout (Mobile Money) → approve the payment prompt →
`/admin/fulfilment` confirm/pick/pack → `/admin/dispatch` assign a rider → the rider accepts,
picks up (stock consumed once), delivers with a PIN → the customer sees it on `/track`.

## Limitations (summary)

Prototype only: no authentication, no persistence, single-process mock state, payment providers
not connected (Hubtel is a candidate adapter — see docs/API_CONTRACTS.md), no live AI (deterministic
demo suggestions, clearly labelled Demo/Not connected), no real courier APIs, no live rider GPS
(location labels are demo values with update times), no tax calculation (owner-configured before
launch). A production build without `API_BASE_URL` falls back to the in-process mock with a loud
warning — set the env var for any real deployment. Full list: **docs/KNOWN_ISSUES.md**.

## Licence & ownership

Source prepared for handoff to the Variety Groceries engineering team. All product, customer and
supplier data is fictional demo data. Do not deploy to the purchased domain or initiate real
payments from this prototype.
