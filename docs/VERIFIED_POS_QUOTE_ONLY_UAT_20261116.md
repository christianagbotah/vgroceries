# Verified POS quote-only administrator UAT — 16 November 2026

## Why this exists

The active POS-integrated staging frontend and canonical GitHub main are not
yet release-parity. Main deliberately blocks its legacy POS simulator from
a production REST connection. This adds a separate, strictly bounded
administrator-only, real-API **pricing preview** to canonical source, not a
live POS workflow or source cutover.

Route: /admin/pos/verified-uat. Requires real admin login through the
existing AdminAuthGate and an additional verified actor role check.
Build-time frontend flag NEXT_PUBLIC_VERIFIED_POS_QUOTE_UAT=1, default OFF.
NEXT_PUBLIC_API_BASE_URL must be a trusted HTTPS /api/v1 absolute URL.
Demo mode and absent/malformed API config fail closed.
The API separately requires its own admin authentication and feature gates:
POS_TILL_FOUNDATION_ENABLED=true and POS_QUOTE_ENABLED=true.
No service flags are changed here.

## Functional UAT

1. Authenticated admin loads real, current till list and published active
   catalogue via GET /api/v1/admin/pos/tills and /api/v1/admin/products.
2. Admin explicitly chooses an open till, searches grocery name/barcode and
   adds up to 100 distinct variants with positive quantities (max three
   decimal places).
3. A **read-only POST /api/v1/admin/pos/quote** returns backend-authoritative
   prices/availability, with explicit quoteOnly=true, stockReserved=false,
   orderCreated=false and paymentVerified=false. Frontend verifies all flags
   and current till ID, rejecting any contradictory response.
4. A nonfinancial tender calculator shows the estimated change in ₵ only.
5. When the independent masked-customer-search flag is ON, the existing
   read-only customer-picker preview is also shown. Its choice is not
   submitted to a quote or checkout.

No stock reservation or order/payment/wallet/drawer/customer mutation
endpoint is called by this page. **There are deliberately no buttons for
cash-sale completion, hold, refund, receipt or stock change.** The "POST
quote" is a calculator only; it does not create a payment.

## Data and browser security

- No demo/mock fallback, no untrusted cross-origin HTTP.
- The standard browser adapter supplies authenticated credentials,
  CSRF header and no-store requests.
- A strict web request schema rejects malformed quantities, zero,
  duplicated variants, overlong baskets and unknown body fields.
- The quote is invalidated whenever the till, basket or quantities change.
  Late responses from superseded requests cannot replace a newer quote.
- API authorizes **admin only**, never cashier/inventory-manager via page
  navigation or a role chosen in the browser.
- The new operations use no browser caching to avoid cross-session POS data
  reuse. No secrets are included in the public build.

## Not delivered / remaining gates

This increment does **not** port the POS WIP sales workflow or alter
the active POS service on 3049/3052. Main still lacks parity for
cashier transaction authority, hold/release, receipts, sale-time customer
confirmation in the current live frontend, returns/COD and rollback.
No live sales, payment collection or inventory decrement is authorized
by this UI. Hubtel Transaction Status remains HTTP 403 from VPS IP
163.245.212.15 as of the previous check, tracked by issue #90.

Before feature activation, use isolated disposable UAT database, verify
role/branch privileges through HTTP and browser, prove API quote/stock
read-only truth, and satisfy issue #108's POS frontend/backend parity and
approved release/restore gates. Keep the public site Coming Soon until
independent go-live approval.

### Tests
bun test scripts/verified-pos-quote-frontend.test.ts
bun test scripts/browser-cache-regressions.test.ts

The full repository CI/API Foundation workflows must pass on the exact
commit before merge. No deployment is included.
