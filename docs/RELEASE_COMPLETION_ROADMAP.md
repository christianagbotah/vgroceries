# Variety Groceries — remaining production completion programme

**Reviewed 9 November 2026** against the owner-supplied 9 October 2026
build brief/master prompt and the repository's implemented backend authorities.
This is a living engineering backlog, **not** a claim that unverified screens,
provider integrations or operations are already production-ready.

## Release baseline

- Customer storefront, accounts, cart/checkout, staff management, logistics,
  dispatch and rider screens exist. The source frontend was originally
  requested as a stateful prototype, not as production-grade backend authority.
- Durable APIs currently cover customer identity/RBAC, inventory receiving and
  reservations, checkout/orders, provider-neutral electronic payments/refunds,
  picking/packing/handover, dispatch/rider lifecycle, product-media review,
  configurable routes and movement evidence, customer tracking, customer in-app
  inbox and remote pickup with staff verification plus pickup appointments.
- Deployments must preserve the public Coming Soon/brand website unless
  the owner explicitly accepts the cutover. Remote shipment execution and
  customer pickup remain **OFF** in UAT until real operating conditions pass.
- The October owner build brief names **varietygrocery.com** (singular);
  current project deployments use **varietygroceries.com** (plural). Domain
  ownership, canonical SEO and DNS redirect choice require owner confirmation;
  do not change verified live domains based on a document alone.
- Product availability must derive from sellable stock minus reservations and
  safety stock. Fulfilment, returns and courier movements must never deduct
  stock a second time; refunds and COD must not be inferred from delivery.
- Amounts shown to Ghana users use **₵** with two decimals. Currency storage
  is integer minor units; tax and commercial rates are explicit settings.

## Workstreams, prerequisites and exit gates

### 1. Remote-pickup operational acceptance [implementation in progress]
- [x] Server-owned route selection, booking price and frozen pickup-centre snapshot.
- [x] Staff collection code/ID proof and immutable receipt, paid/refund checks.
- [x] Customer appointment scheduling with centre hours, lead time, capacity
  locks, rescheduling, cancellation and physical handover completion.
- [ ] Per-centre holidays and one-off closure management, protected from
  silently displacing existing bookings. **First new implementation slice.**
- [ ] Staff missed-appointment and late-arrival recording, customer-rebooking
  workflow, exception reason codes and retention; no automatic order refunds.
- [ ] Order-owned pickup readiness/appointment reminders in the in-app inbox;
  suppress duplicates; no pretend external SMS provider.
- [ ] Real centre/zone staffing configuration, operating hours, test parcels,
  payment-provider proof and accessibility/phone-only acceptance.
- [ ] Gradual on-site enablement, UAT signoff, rollback and evidence capture.

### 2. Physical Returns Authority [P0: cash and stock integrity]
- [ ] Durable physical-return authorization with order-line quantity balance,
  traceable receipt and lot/condition evidence.
- [ ] Inspection/disposition: quarantined/damaged/unsellable/restockable, with
  explicit staff grant and audit requirements.
- [ ] Exactly-once stock restoration **only after approved inspection**, not
  dispatch return, refund or shipment custody changes.
- [ ] Refund integration through the existing Refund Authority; prevent duplicate
  credits and returns beyond delivered quantity.
- [ ] Admin and customer return detail pages with photos/proof as authorized.
- [ ] Concurrency, repeat webhook, partial return, damaged item and payment
  reconciliation tests. Rollout behind a dedicated flag.

### 3. Point of Sale & cashier sessions [P0]
- [ ] Authenticated cashier opening float, till identity/location and shifts.
- [ ] Walk-in selling through the same stock/price/tax policy and reservation
  authority as online checkout; server-authoritative idempotent handover.
- [ ] Cash/card/MoMo tender types and validated splits; avoid labeling an
  electronic payment as paid without provider evidence.
- [ ] Receipts, refunds/exchanges, suspended sales, till cash-in/out,
  settlement/discrepancy and supervisor approval.
- [ ] Offline policy: queue **non-authoritative drafts only** while disconnected;
  never fabricate confirmed payment or sell the same stock twice.
- [ ] Concurrent online/POS stock, shift reconciliation and rollback UAT.

### 4. Cash on delivery and rider remittance [P0]
- [ ] Separate cash collection proof, rider liability ledger, handoff,
  remittance, staff verification and reconciliation.
- [ ] Refund, payment, delivery and cash state remain independent.
- [ ] Part-payments and shortage/overage policy require business approval.
- [ ] Audit, reversal controls, idempotent settlement and exception reports.

### 5. Provider cutovers & notification delivery [P1]
- [ ] Credentialed Ghana payment-provider configuration, callbacks, signature
  checks, reconciliation, refunds and real-money end-to-end UAT before activation.
- [ ] Provider-neutral courier adapters, authenticated webhook events,
  provider booking IDs and resilient manual fallback; never invent GPS or ETA.
- [ ] Email/SMS/WhatsApp delivery ledger, consent/preference/suppression,
  template approval, idempotent retry, receipts and cost/rate controls.
- [ ] Delivery-proof binary storage, private access and retention rules.
- [ ] Live Product Media provider/object storage cutover, reviewed approvals,
  alt text and rights/brand-source verification.

### 6. Customer, catalogue and AI production readiness [P1]
- [ ] Verified grocery packshot catalogue, variants, prices, imagery,
  published SEO and availability filtering for all customer screens.
- [ ] Ingredients, allergens, nutrition, expiry and regulatory fields are
  entered from verified product-source data, not AI hallucinations.
- [ ] Final CMS policy/terms/help/returns text, Ghana delivery zones,
  fees, holidays, commercial schedules and mobile accessibility.
- [ ] Human-reviewable AI assistance grounded in catalogue and business truth;
  no AI stock/payment/refund writers or fabricated health/product claims.
- [ ] Domain redirect/canonical configuration and storefront cutover acceptance.

### 7. Cross-cutting operations, reporting and security [P0/P1]
- [ ] Reconciliation reports: captured vs refunded money, reserved/physical
  inventory, POS till, COD liability, riders, overdue returns and disputes.
- [ ] Traceable support tooling, operational exception queues and audit exports.
- [ ] Per-role authorization/integration contract tests, CSRF/Origin,
  rate limits, webhook signatures, guest ownership and replay protection.
- [ ] Database backups plus restore drills, migrations on restored UAT copies,
  monitoring, alerts, load testing, performance budgets, mobile layout QA,
  accessibility and privacy retention.
- [ ] Accept/reject release checklist for each feature; ship default OFF for
  any authority that cannot yet safely operate.

## Execution order

Do not enable blocked payment, COD, POS, inventory, external provider, AI or
customer-pickup authority as a shortcut to make a UI appear functional.
For each slice: design invariant → migration and strict contracts → API
authorization and replay → user interface → isolated PostgreSQL/contract
tests → fresh GitHub CI → restored-UAT migration rehearsal → protected release
with rollback → on-site acceptance before flag activation.

**Owner-supplied prerequisites:** approved real-centre opening and exception
policies, return/refund policy, tax/accounting handling, courier contracts,
actual provider credentials/costs, current inventory/catalogue data, brand
assets and canonical domain decision. Source code can be built without
claiming those operational authorizations or real-money integrations exist.

**Scope distinction:** the 9 October frontend prototype brief explicitly
excluded native apps, subscriptions, marketplace and full accounting. These
are not silently added to the active production scope. Financial
reconciliation needed for online/POS/COD remains in scope.

## GitHub execution queues

- [#61 Physical Returns Authority](https://github.com/christianagbotah/vgroceries/issues/61)
- [#62 POS and cashier sessions](https://github.com/christianagbotah/vgroceries/issues/62)
- [#63 COD and rider cash reconciliation](https://github.com/christianagbotah/vgroceries/issues/63)
- [#64 Pickup exceptions and reminders](https://github.com/christianagbotah/vgroceries/issues/64)
- [#65 Live payment and courier integrations](https://github.com/christianagbotah/vgroceries/issues/65)
- [#66 Notification channels and delivery ledger](https://github.com/christianagbotah/vgroceries/issues/66)
- [#67 Storefront, catalogue, AI and launch readiness](https://github.com/christianagbotah/vgroceries/issues/67)

## Release tracking

Use small independent branches/PRs and the GitHub Actions verification checks
as gates. When a feature ships, record the merge SHA, migration count,
flags, UAT version, tests and remaining limitations in docs/HANDOFF.md.
An open checklist entry is not completed work.
