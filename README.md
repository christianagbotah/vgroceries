# Variety Groceries — storefront & retail operations frontend

A complete, polished **frontend prototype** for a Ghanaian grocery business: customer storefront,
staff back office (orders, fulfilment, POS, inventory, purchasing, dispatch, returns, refunds,
reports, AI), and a mobile-first rider workspace — all running on one shared, stateful demo
service with a documented API boundary for backend integration.

> **What this is / is not.** This is a working frontend with coherent, stateful demo workflows and
> a documented API boundary. It does **not** have production-safe inventory, real payments, live
> AI, or live courier connections. Our engineering team owns the backend, real integrations,
> authentication, database, and production validation.

## Stack

- **Next.js 16 (App Router) + TypeScript 5 + Tailwind CSS 4 + shadcn/ui** — as supplied by the
  starter environment; no dependency upgrades were made to chase version numbers (`bun.lock`
  pinned).
- One shared **mock service** (single Node process) exposed through a versioned API boundary
  (`/api/mock/v1/*`) with a typed client adapter (`src/services/client.ts`) — the swap point for
  the real backend.
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
bun run build                             # production build (strict TypeScript, 47/47 pages)
bun scripts/handoff-regressions.ts       # 24 handoff-review regression assertions
bun test                                # return stock/expiry regressions
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
    client.ts             typed browser API adapter
    server-data.ts        typed server-rendered data adapter
    views.ts              shared response models
    mock/                 store (globalThis singleton), seed fixtures, engine, router
  types/domain.ts         all domain models, status machines, labels
  lib/                    money, quantity, id, format, permissions
  schemas/                (reserved for zod input validation)
docs/                     ROUTES, API_CONTRACTS, PERMISSIONS, DEMO_SCENARIOS, VERIFICATION,
                          KNOWN_ISSUES, HANDOFF, HANDOFF_REVIEW (external review record)
scripts/                  acceptance-checks.sh, handoff-regressions.ts, route-sweep.mjs,
                          generate-product-svg.mjs
```

**View components are separate from business operations.** Pages never read fixtures directly;
everything flows through service operations behind **two adapters typed against the same shared
response models** (`src/services/views.ts`): client components fetch through
`src/services/client.ts`, server-rendered pages call `src/services/server-data.ts`. Both swap to
the real backend together. Storefront catalogue pages are server-rendered for SEO with client
islands for interactivity; admin/rider screens are client components over the same API.

The [production backend design](docs/superpowers/specs/2026-10-09-production-backend-design.md)
defines the NestJS/PostgreSQL API, worker queues, future Android/iOS clients and
grounded AI boundary. It is a written design for owner review, not a connected
production backend. See [the follow-up verification](docs/BACKEND_HANDOFF_CHECKPOINT.md)
for the independent check of Z.ai's corrections and additional return fixes.

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
demo suggestions), no real courier APIs, no live rider GPS (location labels are demo values with
update times), no tax calculation (owner-configured before launch). Full list:
**docs/KNOWN_ISSUES.md**.

## Licence & ownership

Source prepared for handoff to the Variety Groceries engineering team. All product, customer and
supplier data is fictional demo data. Do not deploy to the purchased domain or initiate real
payments from this prototype.
