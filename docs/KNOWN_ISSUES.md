# Known issues, incomplete work & integration limits

This document separates **production backend gaps** from **frontend/demo limitations**. The current repository is no longer only a frontend prototype: the NestJS/PostgreSQL API now owns identity, catalogue/inventory, reservations, checkout/orders, payments, refunds and fulfilment/stock handover.

## 1. Production backend authorities already implemented

The backend currently has durable production authority for:

- web/native identity, sessions, authorization and location grants;
- catalogue/inventory reads, receiving, lots/expiry, reservations and safety-stock-aware availability;
- atomic checkout/orders, delivery slots, ownership, tracking, cancellation and idempotency;
- electronic payment initiation/evidence/reconciliation and late-payment recovery;
- refund obligation/approval/execution/reconciliation;
- administrator fulfilment confirmation, picking, pick correction, packing, queue/detail projections and exactly-once stock handover/collection depletion.

Picking and packing do **not** reduce physical stock. Stock leaves inventory only at the authoritative handover/collection boundary. The production OpenAPI currently contains 35 paths, including seven administrator fulfilment paths.

## 2. Backend authorities still deliberately closed

1. **Dispatch and rider authority is not implemented in the production API.** The frontend has a rich dispatch/rider prototype, but ready-to-dispatch queues, rider assignment/availability, provider booking, pickup, POD, failure/reschedule and retry still need a durable backend authority.
2. **COD collection and rider remittance are not implemented.** COD may authorize an eligible delivery handover where zone policy permits it, but delivery completion, cash collection and rider remittance must become three separate durable events/ledgers in the next dispatch/COD wave.
3. **Physical Returns Authority is not implemented in the production API.** After stock has left the store, inventory must increase only from an actual received return with disposition/provenance. The existing frontend/mock return flows are specifications, not production stock authority.
4. **POS cashier sales are not yet a production API authority.** The future POS service must reuse the same exactly-once inventory-depletion primitive and add cashier/session/payment controls instead of creating a second stock path.
5. **Complete storefront/account cutover is pending.** The backend implements a growing set of public/customer endpoints, but the Next.js application can still run against mock operations. Do not deploy production storefront mode until every required operation for that journey resolves to a real API contract.
6. **Live payment/refund provider activation remains closed.** Provider-neutral payment and refund authority is implemented and tested, but no claim is made that live Hubtel credentials, production webhooks or production money movement are activated.
7. **No live courier provider is connected.** Provider adapters, manual fallback and webhook/POD behavior belong to the dispatch milestone; do not label any courier “integrated” until its real adapter is verified.
8. **No live AI execution authority.** Current AI screens/suggestions remain deterministic or prototype-level. Any future AI action must be evidence-backed and pass through the same permissions and transactional authorities as a human action.
9. **No production SMS/email/push integration.** Notification UX may exist, but no real delivery provider is claimed.
10. **Tax policy is not hardcoded.** Ghana tax treatment remains owner/configuration work; the application must not invent a tax rate.

## 3. Frontend/demo boundaries

11. **Mock transport still exists by design.** `src/services/client.ts` and the HTTP adapter are the swap boundary. The in-process mock remains useful for demos/regressions but must not silently become production authority.
12. **Demo role/login flows remain in the frontend.** Production staff/rider login UX still needs to be connected to the real identity APIs and demo selectors removed from production builds.
13. **The frontend fulfilment mock is less authoritative than the backend.** The production backend now has reservation-derived lot-level picks, exact quantities, shortages, backend-derived `allowedActions`, packing metadata and handover blockers. When live-connected, the UI must render those projections rather than infer transitions from local state.
14. **Returns screens remain prototype-backed until Physical Returns Authority lands.** Demo saleable/quarantine/damaged behavior is valuable acceptance material but is not evidence that the production API currently restocks returns.
15. **Dispatch/rider screens are prototype-backed until Dispatch Authority lands.** Optional location sharing is demo-labelled; there is no live GPS, invented movement or authoritative ETA.
16. **POS and cashier screens are prototype-backed until POS Authority lands.** Current mock acceptance tests demonstrate the intended invariants but are not a production cash ledger.
17. **Account conveniences remain incomplete.** Some customer account/profile/support interactions are demo/read-only because their production write authorities have not yet been prioritized.
18. **Reports and AI are derivative.** They should read authoritative ledgers after the transactional authorities land; no report or AI screen may become a hidden writer of stock, payment, refund, return or dispatch truth.

## 4. Smaller UX / operational follow-ups

19. Remaining dense admin tables mostly use responsive column hiding plus contained horizontal scroll; orders, inventory and payments already have dedicated mobile-card alternatives.
20. Rider status badge contrast should receive another direct-sunlight/accessibility pass when the real rider application/theme is finalized.
21. Cross-session realtime updates are not implemented across all frontend screens. Mutation invalidation and race protection exist, but production push/realtime refresh should be added only after the underlying live APIs are connected.
22. Catalogue/cart convenience state may persist in the browser; it is never stock authority. Checkout/POS must always revalidate against the backend.
23. Provider credentials, raw webhook evidence and other execution secrets must remain server-only. Existing customer/staff projections intentionally omit them.

## 5. Current verified checkpoint

Before this documentation refresh, implementation SHA `f07f86c098460285e9b73a8963d3fad5204b99c6` on `feat/fulfilment-handover-20261012` passed both GitHub Actions workflows associated with PR #12. PostgreSQL 17 applied migrations 001–006; the API suite passed 267/267; production OpenAPI generated twice at 35 paths with zero drift; and root CI passed lint, typecheck, production build, 50 Bun regressions, 24 handoff assertions, 32 contract checks, 24 acceptance checks and a 58/58 route sweep.

See `docs/HANDOFF.md` for the next implementation sequence and `docs/VERIFICATION.md` for the evidence record.
