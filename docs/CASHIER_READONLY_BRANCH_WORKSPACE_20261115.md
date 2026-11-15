# Cashier read-only workspace — 15 November 2026

This change adds a **genuine cashier-only operational read**, not a new
sale/write authority. It is designed for the original authenticated Variety
Groceries portal, independent of all one-click sample role demos.

## Real staff workflow

- An authenticated account whose **server-owned** role is cashier signs in
  through the genuine staff login and is directed to
  /staff/cashier/workspace.
- The mobile-first page shows current active assigned branches, currently
  open till codes and up to 25 recent **own** cash-sale summaries.
- The page refreshes on demand and uses Ghana local dates in dd/mm/yyyy
  format and cedi values displayed as ₵ with two decimal places.
- No drawer floats, cash-in/out/drop movements, other cashiers' sales,
  customer contact details, stock/reservations, tax invoices or refund
  controls are included.

## Backend authority and query limits

GET /api/v1/cashier/pos/workspace requires a valid real web or native
session through AccessGuard. Cashier is the *only* accepted role. In each
request, PostgreSQL must confirm both an **active cashier user** and one
or more **active location grants**. No location ID is accepted from a
client request parameter. Empty/revoked assignments are HTTP 403.

The server restricts open tills by current granted location IDs (30 maximum),
and completed sales by both granted location IDs **and the actor's user ID**
(25 maximum). Query selectors intentionally omit PII, float, movement and
other financial fields. JSON contract rejects unexpected fields.

The existing administrator POS endpoints remain administrator-only and
unchanged. No reserve, sell, pay, refund, tax, release, drawer or stock
mutation is introduced.

POS feature flags remain server owned:
- If till foundation OFF, no operational records are queried.
- If cash sales OFF, no sales records are queried.
- No feature flag is enabled by deploying this source.

## Release/verification boundaries

- Five isolated regression tests for role denial, revoked/empty branch
  assignments, database-side branch ownership filters, disabled flags and
  PII/authority contract exclusion.
- API and frontend TypeScript, targeted ESLint, reproducible OpenAPI
  contract generation and GitHub full CI should pass before merge.
- Full PostgreSQL HTTP/session/RBAC tests and authenticated mobile UAT
  remain required before staff use. Real cashier invitation/activation
  onboarding is still a separate release gate.
- The original staging database, payment provider, public Coming Soon
  site and live VPS services must not be changed by this patch.
