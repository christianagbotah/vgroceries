# Customer consent evaluation at dispatch time — 2026-11-21

The pure delivery eligibility gate now accepts an optional `evaluatedAt` timestamp. A customer who revokes consent after an order event but before a delayed delivery is not eligible when the worker evaluates the message at dispatch time. Invalid or pre-event evaluation timestamps fail closed. Existing event-time callers retain prior behavior until dispatch wiring supplies a verified evaluation time.

Verification: `npm --prefix apps/api run build` (TypeScript), `node --test apps/api/dist/test/customer-delivery-eligibility.spec.js` (5 passed), and `git diff --check` (passed). This does not enable dispatch: the staging worker remains blocked pending persisted channel-specific consent evidence and opt-out enforcement at send time. No live services, credentials, payment flags, database or branding changed.
