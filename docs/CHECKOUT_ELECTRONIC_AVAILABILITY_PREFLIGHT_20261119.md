# Checkout payment availability — no premature electronic order creation
19 November 2026. Source-only. No charge, provider API call, refund, production deployment, credential modification or restart.

## Observed production problem
A shopper at `https://portal.varietygroceries.com/checkout` could select **Electronic payment** and click **Place order**, receive the error “Electronic payments are not configured”, then be sent back to the cart. Hubtel merchant Sales API and collection account credentials exist in protected VPS configuration, but the production API still runs an older release, and the electronic provider/refund bundle is not active.

## Correction
- New public `GET /api/v1/checkout/payment-availability`: an explicitly non-cacheable, read-only and sanitized boolean indicating whether the server has configured a payment method with a compatible refund adapter. No merchant IDs, URLs, credentials or individual gateway diagnostic failures are returned; it does not call Hubtel or create a customer session. An unavailable/unconfigured provider is reported as `electronicAvailable:false`. This is a display hint, not proof of actual Hubtel Transaction Status authorization or money settlement.
- The storefront queries this endpoint before allowing **Electronic payment**; it starts in a fail-closed checking state. On a negative reply or network error, the electronic option and order-submit button are disabled, with an explanatory message. An explicit “Check again” reissues the read-only GET. Cash at collection or cash on delivery remain selectable only where the order's verified fulfilment rules already offer them.
- A second on-click preflight prevents a programmatic order request when electronic checkout is unavailable. The existing backend retains full authority to reject payment or order submission at the final moment.
- The development/mock adapter explicitly labels its electronic payment availability `mode:"demo"`. Neither this UI nor the route reports payment initiation, a successful charge, verified settlement or bank deposit.
- Extend official OpenAPI, API route inventory, isolated PostgreSQL integration tests (GET creates zero order/payment/reservation records and no session cookie), and focused storefront safety regressions.

## Still blocked
The actual authenticated Hubtel Transaction Status API returned **HTTP 403** (merchant-scope / outbound-IP allowlisting), as documented in issue #90. Hubtel Online Checkout can present card and mobile-money rails, but the active refund adapter only covers mobile money; the existing back-end **launch readiness gate must not be bypassed**. Source passing CI does not authorize deploying active payment flags or collecting funds. The currently running portal and API must be upgraded through a separate staged, rollback-ready release and verified once provider authorization and refund coverage are complete.
