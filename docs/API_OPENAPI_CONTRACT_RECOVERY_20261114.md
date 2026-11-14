# Variety Groceries — API documentation contract recovery

## Why it mattered

The server exposed several new real endpoints for shopping AI, customer support and lot reporting, but the authoritative production OpenAPI generator remained closed to unknown paths. Its strict fail-closed guard correctly rejected the undocumented routes, making the `/api/v1/openapi.json` endpoint return an HTTP 500 (with safe error envelope). This prevented accurate integrations even though the underlying feature endpoints worked.

## Fix

- Registered explicit response models and request schemas in the foundation OpenAPI authority for AI assistant/budget, customer support create/admin list/admin actions, and actual inventory lots/receipts/expiry.
- Marked the shopping AI and public support request endpoints with no session security, and retained cookie/bearer authorization for staff support and inventory reads. Documented the admin case action CSRF header and case identifier.
- Updated strict route-coverage regression expectation so the new real endpoints cannot silently disappear from the contract. The registry still throws for any unknown endpoint instead of blindly documenting it.
- Kept browser/storefront and commercial payment boundaries unchanged.

## Verified

- Full backend TypeScript build passed.
- Standalone OpenAPI contract tests passed, including the strict exact-path assertion and the payment/order boundary scans.
- Final isolated cross-module suite passed 61 of 61 tests (checkout/stock depletion/till/rider/dispatch/commerce/tracking).
- Deployed staging OpenAPI returned HTTP 200, 157 paths and expected new paths; both staging services remain active.
- The isolated test database was deleted only after the suite passed; no production migration was triggered.
