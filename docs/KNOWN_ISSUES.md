# Known issues, incomplete work & integration limits

This document separates **production backend gaps** from **frontend/demo limitations**. The NestJS/PostgreSQL API now owns identity, catalogue/inventory, reservations, checkout/orders, payments, refunds, fulfilment/stock handover, dispatch and rider operations.

## 1. Production backend authorities already implemented

The backend currently has durable production authority for:

- web/native identity, sessions, authorization and location grants;
- catalogue/inventory reads, receiving, lots/expiry, reservations and safety-stock-aware availability;
- atomic checkout/orders, delivery slots, ownership, tracking, cancellation and idempotency;
- electronic payment initiation/evidence/reconciliation and late-payment recovery;
- refund obligation/approval/execution/reconciliation;
- administrator fulfilment confirmation, picking, pick correction, packing, queue/detail projections and exactly-once stock handover/collection depletion;
- post-handover dispatch queue, rider profiles/availability, durable delivery jobs/events, assignment/reassignment, manual-provider fallback, rider lifecycle, proof metadata, delivery failure/reschedule and return-to-store custody tracking.

Picking and packing do **not** reduce physical stock. Delivery stock leaves inventory only at Fulfilment handover; rider pickup never performs a second depletion. The production OpenAPI contains **57 paths**, including **22 Dispatch/Rider paths**.

## 2. Backend authorities still deliberately closed

1. **COD cash collection and rider remittance are not implemented.** COD delivery completion remains independent from payment success. The next backend milestone must add customer cash collection, rider liability and remittance as separate durable/auditable authorities.
2. **Physical Returns Authority is not implemented in the production API.** Returned-to-store delivery custody does not restore inventory. Saleable stock may increase only after an actual received return is inspected and dispositioned with provenance.
3. **POS cashier sales are not yet a production API authority.** The future POS service must reuse the same exactly-once inventory-depletion primitive and add cashier/session/payment controls instead of creating a second stock path.
4. **Complete storefront/account cutover is pending.** The backend implements a growing set of public/customer/staff/rider endpoints, but the Next.js application can still run against mock operations. Do not deploy production storefront mode until every required journey resolves to a real API contract.
5. **Live payment/refund provider activation remains closed.** Provider-neutral payment/refund authority is implemented and tested, but no claim is made that production Hubtel credentials, webhooks or live money movement are activated.
6. **No live courier provider is connected.** Dispatch supports explicit manual-provider evidence only. No network booking/webhook flow may be labelled integrated until a real provider adapter is implemented and verified.
7. **No production GPS/ETA authority exists.** Rider location/ETA must not be fabricated from UI state; live location requires its own consent, freshness and provider/device design.
8. **Proof-media storage is not implemented.** Dispatch stores proof method/reference/note metadata only. Binary photo/signature storage needs a dedicated secure media boundary.
9. **No live AI execution authority.** Current AI screens/suggestions remain deterministic or prototype-level. Any future AI action must pass through the same permissions and transactional authorities as a human action.
10. **No production SMS/email/push integration.** Notification UX may exist, but no real delivery provider is claimed.
11. **Tax policy is not hardcoded.** Ghana tax treatment remains owner/configuration work; the application must not invent a tax rate.

## 3. Frontend/demo boundaries

12. **Mock transport still exists by design.** `src/services/client.ts` and the HTTP adapter are the swap boundary. The in-process mock remains useful for demos/regressions but must not silently become production authority.
13. **Demo role/login flows remain in the frontend.** Production staff/rider login UX still needs to be connected fully to real identity APIs and demo selectors removed from production builds.
14. **Fulfilment frontend must render backend truth.** Reservation-derived lot picks, shortages, `allowedActions`, packing metadata and handover blockers come from the backend; the UI must not infer them independently.
15. **Dispatch/rider production backend exists, but frontend cutover is still a separate integration task.** The z.ai readiness wave must remove stale pickup-stock and COD-paid semantics and bind the screens to the 22 production routes/projections before the UI can be described as live.
16. **Returns screens remain prototype-backed until Physical Returns Authority lands.** Demo saleable/quarantine/damaged behavior is acceptance material, not production restocking evidence.
17. **POS and cashier screens are prototype-backed until POS Authority lands.** Current mock acceptance tests demonstrate intended invariants but are not a production cash ledger.
18. **Account conveniences remain incomplete.** Some customer account/profile/support interactions are demo/read-only because their production write authorities have not yet been prioritized.
19. **Reports and AI are derivative.** No report or AI screen may become a hidden writer of stock, payment, refund, return or dispatch truth.

## 4. Smaller UX / operational follow-ups

20. Remaining dense admin tables mostly use responsive column hiding plus contained horizontal scroll; orders, inventory and payments already have dedicated mobile-card alternatives.
21. Rider status badge contrast should receive another direct-sunlight/accessibility pass when the real rider application/theme is finalized.
22. Cross-session realtime updates are not implemented across all frontend screens. Mutation invalidation/race protection exist, but push/realtime refresh should be added only after underlying live APIs are connected.
23. Catalogue/cart convenience state may persist in the browser; it is never stock authority. Checkout/POS must always revalidate against the backend.
24. Provider credentials, raw webhook evidence and execution secrets must remain server-only. Existing customer/staff/rider projections intentionally omit them.

## 5. Current verified checkpoint

Reviewed implementation checkpoint before this documentation commit is `40ff740ea5a01ef4b3792f49955362884e57d966` on `feat/dispatch-rider-authority-20261013`. A fresh local clean-room run applied migrations **001–007** on PostgreSQL 18.1 and passed **318/318** API tests; production OpenAPI generated twice at **57 paths** with zero drift; root lint/typecheck/build passed with **48/48** static pages; handoff assertions passed **24/24**; Bun regressions **50/50** with **460** expectations; shared contracts **32/32**; acceptance **24/24**; route sweep **58/58**. The final PostgreSQL-17 proof remains the GitHub API workflow on the draft PR and must be green before merge readiness is claimed.

See `docs/HANDOFF.md` for the implementation sequence and `docs/VERIFICATION.md` for the evidence record.
