# Verified stock adjustments UI and scoped lot lookup — 15 November 2026

## Why this slice

The historical `/admin/inventory/adjustments` screen is a **demo** screen
whose mock requests supply a simulated `actor`. It is **not** authority to
change genuine stock. PR #113 established a server-only adjustment maker/checker
workflow, but real staff lacked a safe picker for actual stock lots.

This slice adds a separate real-session experience and one additional
read-only backend endpoint, without enabling corrections in UAT or changing
the public Coming Soon website.

## Real staff UI

- The existing route `/admin/inventory/adjustments` checks the explicit
  demo session. Demo staff continue to see the existing mock workflow;
  **real** staff see `VerifiedStockAdjustments`, which does not import
  or send a demo actor identifier.
- `NEXT_PUBLIC_STOCK_ADJUSTMENTS_UAT=0` by default; a disabled notice
  is displayed without issuing stock operations. A real staff screen
  additionally rejects missing production API configuration, mock API
  fallback and a demo session before loading private data.
- When explicitly authorised, the screen verifies the current backend
  login via `/auth/me`, permitting real `admin` or
  `inventory_manager` roles only.
- Active permitted branches are server-selected, not taken from a
  client-supplied user ID. Search lots by product, variant or lot number;
  excluded/inactive/expired/quarantined lots show why they are unavailable.
  The server caps results at 150 and asks staff to narrow the search.
- Request form enforces signed quantities with a maximum three decimal
  places, whole units for piece products, required reason and optional
  note. A confirmation dialog states **no stock changes at request time**.
- A separate administrator approval/rejection confirmation describes
  the irreversible stock movement and server-side safety checks. A maker
  cannot decide their own case. Backend authorization always wins, even
  if browser state is stale or manipulated.
- Branch-scoped history displays DD-MM-YYYY and Ghana clock, before/after
  quantity, requester, independent reviewer and status; mobile cards and
  desktop responsive table. Legitimate ending quantity `0` remains visible.
- Browser uses new `inventory.verified.adjustments.*` operations with
  strict Zod shapes. The legacy mock endpoint operation `admin.inventory.adjustments.create`
  (batch lines + actor) is preserved for demo parity but never used for
  real staff writes. Verified corrections use stable idempotency keys for
  same-payload retry and server-managed CSRF/credentials.

## Backend and security

`GET /api/v1/inventory/adjustments/lots` is an opt-in read-only extension
of the maker/checker service:

- Calls `STOCK_ADJUSTMENTS_ENABLED` gate first, and checks current
  administrator or inventory-manager identity.
- Admin sees at most 100 active branches; inventory manager sees only
  active `UserLocation` grants joined to an active staff user and active
  location. The selected branch must exist in that permitted list.
- Returns at most 150 lots with product, variant, lot number, unit,
  physical quantity and eligibility reason. Search text is bounded.
  It returns **no customers, session tokens, purchasing costs or payment data**.
- This is only a picker: actual stock changes still pass the separate,
  transactional request and independent administrator decision paths.

OpenAPI now documents **156 paths**, including the new guarded GET
selection and its typed response. No SQL migrations or database schema
changes were introduced.

## Testing and release gates

Isolated PostgreSQL 18 `variety_foundation_test` with all 47 migrations.
The targeted HTTP/unit suite covers active and revoked branch permissions,
active and quarantined lots, search, malformed query/actor spoofing,
default-OFF flag, genuine admin-only independent approval, concurrency,
audit/outbox, and legacy browser contract isolation. Use the full API
foundation workflow plus optimized Next.js production build as merge gates.

**No activation** of live stock changes, payment, till reconciliation,
staff onboarding or password recovery. `STOCK_ADJUSTMENTS_ENABLED` and
`NEXT_PUBLIC_STOCK_ADJUSTMENTS_UAT` must both remain OFF on live services
until a two-person supervised physical count, audit review, role revocation,
branch scoping and rollback acceptance are signed off.

The public portal currently uses a different POS-integrated frontend
release from the canonical Next.js main; merging the canonical UI is
**not proof that it is already available on that portal**. Do not replace
the POS frontend or redirect Nginx until an explicit version-parity and
rollback check is complete. Keep #99 open for real user acceptance.
