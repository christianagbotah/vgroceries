# Variety Groceries — execution backlog

Updated 2026-11-26. Owner-approved public repository. This is the public-safe engineering checkpoint; do not commit credentials, customer records, private operational evidence, infrastructure details or raw provider responses.

## Operating rules
P0 = release-critical; P1 = operational completeness; P2 = enhancements. Each checkbox is an acceptance task, not a claim of missing code. Audit existing implementation before changing it. Only mark verified with exact commit, test/run link and, where applicable, release and UAT evidence. Use independent PRs, merge only reviewed green changes, build/package through GitHub Actions, deploy verified runtime artifacts only, verify health and rollback. Do not build on the VPS. Continue next unblocked task in each active session; record checkpoint before ending. Never enable money, stock or logistics capabilities solely because UI exists.

## Checkpoint
- [x] VG-A01 Initial repository/documentation and existing roadmap audit.
- [x] VG-A02 Review open PRs and historical CI evidence.
- [x] VG-A03 Compare divergent checkout/POS release branches.
- [x] VG-A04 Inspect checkout retry and packaging source.
- [x] VG-A05 Owner confirmed public-repository exception.
- [x] VG-A06a Publish focused checkout and packaging PRs: #207 and #208 (26 Nov 2026).
- [x] VG-A06b Verify exact-head CI, inspect patches, and merge #207 and #208. Both CI/API pairs passed. Squash merges: 001247a4137d0ad86339ad6deca92c32b8949802 and 7bc1a1c6e7e2b2a81cb73adad17d2f2e3a4d6f84. Integrated release verification remains open.
- [ ] VG-A07 Reconcile POS cash history and receipt work on current baseline.
  - [x] VG-A07a Submit isolated till-reconciliation UI, no-store headers and tests in #209 (head 2e88d8fde5ff0e7c4de81f62a38689f3df307287).
  - [ ] VG-A07b Verify #209 CI and merge; integrate separately paginated history and receipt UI, preserve admin access boundary.
- [ ] VG-A08 Establish one compatible web/API release lineage, compare current runtime provenance privately.
- Next action: INC-03/INC-04 and INC-06–09 take priority over VG-A07b; continue independent POS work while payment/notification gates run. #207 ([CI](https://github.com/christianagbotah/vgroceries/actions/runs/45799999170), [API](https://github.com/christianagbotah/vgroceries/actions/runs/45799999150)) and #208 ([CI](https://github.com/christianagbotah/vgroceries/actions/runs/45800003211), [API](https://github.com/christianagbotah/vgroceries/actions/runs/45800003177)) passed and merged. #209 exact-head CI pending; reconciliation uses existing GET endpoints, independent default-off UI flag, no new routes on API, no migrations or financial writes. Preserve prior release roadmap. No deployment.

## P0 — storefront customer payment and notification acceptance (priority override)
- [x] INC-01 Verify existing hosted-checkout recovery against independent provider evidence and existing reconciliation service; restricted operational evidence retained outside public repo.
- [x] INC-02 Submit #210 bounded default-off hosted reconciliation worker and checkout refresh UX; exact-head CI/API in progress.
- [ ] INC-03 Verify #210 CI, review worker selection/cooldown/concurrent callback cases, verify canonical web/API lineage, deploy verified artifacts and activate only on approved runtime.
- [ ] INC-04 Verify hosted callback delivery and ingress against approved provider configuration; demonstrate automatic recovery when callback is absent, without new charge.
- [x] INC-05 Submit #211 gated explicit order-only SMS consent UX; exact-head CI/API pending.
- [ ] INC-06 Reconcile #200 (historical CI/API passed) staging/dispatch migration and runner; preserve order-scoped consent, verified recipient, durable attempt claim and ambiguous-response safety.
- [ ] INC-07 Verify guest checkout phone ownership and order-specific consent; send order-created/payment-confirmed/fulfilment messages after committed evidence; no duplicate or retrospective opt-in.
- [ ] INC-08 Configure approved email transport and verified recipient policy, receipt/deduplication queue and delivery failure handling; test email and SMS separately.
- [ ] INC-09 Authorized end-to-end UAT: order created, payment pending, provider success, automatic confirmation, receipt/notifications, fulfilment and delivery; record only public-safe outcomes.

## P0 — identity and security
- [ ] AUTH-01 Inventory customer/staff/rider authentication routes and remove production demo entry points.
- [ ] AUTH-02 Verify session expiry, logout, CSRF and guest isolation across web and API.
- [ ] AUTH-03 Verify OTP and password reset issuance, replay, throttling and failure UX.
- [ ] AUTH-04 Verify server RBAC and resource ownership for owner, ops, inventory, cashier, picker, dispatcher, finance and rider.
- [ ] AUTH-05 Test location-scoped permissions, negative cases and audit actor attribution.
- [ ] AUTH-06 Review dependency advisories, secret scanning, headers, privacy retention and abuse controls.
- [ ] AUTH-07 Document permissions, run full security regression and role UAT.

## P0 — stock and catalogue authority
- [ ] INV-01 Audit PostgreSQL SKU/variant/location/lot schema, constraints and migrations.
- [ ] INV-02 Verify exact decimal unit conversions, eligibility, safety stock and availability calculations.
- [ ] INV-03 Verify atomic multi-line reservations and expiry/cancellation recovery.
- [ ] INV-04 Test concurrent last-unit online/POS purchases and idempotent stock depletion.
- [ ] INV-05 Verify receiving, supplier references, FEFO allocation, adjustment approvals and immutable ledger.
- [ ] INV-06 Verify stocktake variance review, damage/wastage, expiry and quarantine.
- [ ] INV-07 Verify API validation, role gates, inventory UI, filtering and exports.
- [ ] INV-08 Verify availability invalidation across storefront, POS, search, offers and AI.
- [ ] INV-09 Reconcile stock ledger and physical count; isolated DB tests, staff UAT, docs.

## P0 — storefront checkout and customer accounts
- [ ] WEB-01 Audit public storefront, shop, categories, product details, cart and all account routes.
- [ ] WEB-02 Verify server pricing, discounts, fees and stale cart/price/stock rejection.
- [ ] WEB-03 Verify guest and account checkout, Ghana address/phone, collection/delivery and slots.
- [ ] WEB-04 Verify persistent retry identity, definite rejection recovery and ambiguous retry handling (#174; focused current-main port #207 submitted; fresh CI passed and merged; integrated release verification pending).
- [ ] WEB-05 Verify payment availability preflight and truthful pending/failure/review status.
- [ ] WEB-06 Verify secure guest tracking, customer-owned history, saved addresses/lists and returns.
- [ ] WEB-07 Verify empty/error/loading states, browser navigation and mobile checkout end-to-end.
- [ ] WEB-08 Verify public launch policy, canonical domain and owner-approved content.

## P0 — payments and refunds
- [ ] PAY-01 Reconcile hosted checkout adapter, contracts and payment readiness; retain stronger current safeguards.
- [ ] PAY-02 Verify provider reference/amount/currency checks, callback authentication and independent status confirmation.
- [ ] PAY-03 Test duplicate callbacks, unknown outcomes, late success, expiry, failure and reconciliation.
- [ ] PAY-04 Verify redirect allowlist, idempotent initiation and no client-supplied payment truth.
- [ ] PAY-05 Verify collection capability independent of optional automated refunds.
- [ ] PAY-06 Verify separate refund request/approval/execution/reconciliation, manual evidence and cumulative amount caps.
- [ ] PAY-07 Validate finance exception views, ledger totals, settlement and audit exports.
- [ ] PAY-08 Run credentialed provider UAT only with authorized test configuration and approved financial boundaries.
- [ ] PAY-09 Record payment/refund readiness and independent rollout gates.

## P0 — POS and cashier
- [ ] POS-01 Audit integrated POS versus main, migration compatibility and shared stock authority.
- [ ] POS-02 Verify cashier/location/till permissions, opening float and session locking.
- [ ] POS-03 Verify barcode search, customer/walk-in selection, variants, quantities and price quotes.
- [ ] POS-04 Verify cash tender/change, electronic tender evidence, discounts and suspended drafts.
- [ ] POS-05 Verify exactly-once handover, retry and concurrent inventory conflict.
- [ ] POS-06 Integrate paginated read-only cash-sale history, original receipts and scoped query tests (#175). Current main already has admin-only list/detail/immutable receipt print; the draft adds keyset paging and contracts. Older draft CI passed, but merge conflict and current-baseline tests remain. GitHub comparison identified 40 branch files, of which 21 overlap main changes; integrate the non-overlapping read paths first and reconcile API registry, OpenAPI and route-count assertions without replacing current contracts. Verify full route and permission parity before release. Preserve admin-only authorization until separate scoped cashier access is verified.
- [ ] POS-07 Verify till cash-in/out, closing count, reconciliation, variance and approval. #209 adds separately gated read-only reconciliation, validated cash arithmetic and authenticated CSV; CI and actual UAT pending.
- [ ] POS-08 Verify POS returns/exchanges, receipt print, transaction lookup and reversal reporting.
- [ ] POS-09 Offline drafts only until authoritative stock/payment can be verified.
- [ ] POS-10 Run browser, keyboard/touch, printer and concurrent online/POS UAT; document release.

## P0 — fulfilment and dispatch
- [ ] ORD-01 Verify separate order/payment/fulfilment/delivery states and allowed transitions.
- [ ] ORD-02 Verify confirmation, pick/pack, lot allocation, shortages and substitution consent.
- [ ] ORD-03 Verify cancellation before/after handover and single stock depletion event.
- [ ] ORD-04 Verify staff queues, search, detail, history, notes and role permissions.
- [ ] ORD-05 Verify dispatch assignment, rider acceptance/pickup/delivery and exception recovery.
- [ ] ORD-06 Test retries, concurrency and order/customer timeline parity.
- [ ] ORD-07 Run end-to-end online-to-fulfilment UAT and document evidence.

## P0 — COD and returns
- [ ] COD-01 Audit separate cash collection, liability, rider remittance and delivery states.
- [ ] COD-02 Verify amount validation, handoff, counting, staff confirmation and reconciliation.
- [ ] COD-03 Verify shortage/overage approval, reversals, retries and finance reporting.
- [ ] COD-04 Test cash collection without falsely marking electronic payment or restocking.
- [ ] RET-01 Verify customer-owned original order claims and remaining quantity cap.
- [ ] RET-02 Verify approval/rejection, physical receipt, inspection and custody.
- [ ] RET-03 Verify quarantined/damaged/expired goods cannot become saleable.
- [ ] RET-04 Verify independently approved eligible restock, provenance and exactly-once movements.
- [ ] RET-05 Verify refund preview against original paid lines and approved policy, cumulative limits.
- [ ] RET-06 Verify exchange as linked return and new sale, not history overwrite.
- [ ] RET-07 Verify staff/customer UI, evidence access, concurrency and finance UAT.
- [ ] RET-08 Keep unapproved food resale and financial activation gated.

## P1 — procurement, catalogue and transfers
- [ ] CAT-01 Verify product/category/variant CRUD, publication, pricing and barcodes.
- [ ] CAT-02 Verify approved image media, rights, alt text, real product data and fallback.
- [ ] CAT-03 Verify ingredient/allergen/nutrition fields only from verified sources.
- [ ] CAT-04 Verify search/filter/sort/pagination, SEO and cache invalidation.
- [ ] BUY-01 Verify supplier records, PO drafts/approval and receiving match.
- [ ] BUY-02 Verify partial receipt, costs, discrepancy and supplier return.
- [ ] XFER-01 Audit transfer authorization and location grants (#204).
- [ ] XFER-02 Verify exact cost/quantity valuation and immutable movement links.
- [ ] XFER-03 Verify dispatch/receipt/in-transit quantities, partial receipt and discrepancies.
- [ ] XFER-04 Test concurrency, cross-location denial, reconciliation and staff UI.
- [ ] XFER-05 Roll out only after accounting policy and operational acceptance.

## P1 — logistics and rider workspace
- [ ] LOG-01 Verify delivery zones, fees, minimum, cutoffs, hours and capacity configuration.
- [ ] LOG-02 Verify route snapshots, movement history, reroute and direct/multi-hop sequences.
- [ ] LOG-03 Verify pickup centre booking, closures, capacity, rebooking and collection proof.
- [ ] LOG-04 Verify rider assigned-only job data and mobile status actions.
- [ ] LOG-05 Verify delivery evidence upload/access/retention and offline pending retries.
- [ ] LOG-06 Verify failed delivery, reschedule, return-to-store and no phantom stock.
- [ ] LOG-07 Verify manual courier workflow; implement provider-neutral adapters only for approved partners.
- [ ] LOG-08 Verify consent-based location and no fabricated GPS/ETA.
- [ ] LOG-09 Run direct/multi-hop/pickup/rider UAT before activation.

## P1 — notifications, reporting, AI and settings
- [ ] NOT-01 Verify in-app inbox projection, recipient ownership, pagination and deduplication.
- [ ] NOT-02 Verify transactional SMS consent, suppression, retry, receipts and cost gates (#200).
- [ ] NOT-03 Add approved email/push channels only where authorized; keep external delivery truthful.
- [ ] REP-01 Reconcile sales, stock, refunds, payments, till, COD, delivery and returns reports.
- [ ] REP-02 Verify date/location filters, pagination and filtered exports; access control and audit.
- [ ] SET-01 Verify staff/team, business policies, currency, tax settings and CMS draft/publish.
- [ ] SET-02 Confirm commercial tax/fee/return rules with owner; never invent rates.
- [ ] AI-01 Verify catalogue-grounded shopping, budget baskets and alternatives.
- [ ] AI-02 Verify replenishment, expiry, dispatch and exception suggestions with evidence.
- [ ] AI-03 Verify human approvals, provider boundaries, privacy and cost controls; no autonomous financial/stock writes.
- [ ] AI-04 Verify missing-data behavior, grounded answers, availability and permission tests.

## P1 — UI, device and accessibility
- [ ] UX-01 Apply official VG branding consistently; remove obsolete placeholder marks.
- [ ] UX-02 Audit all navigation, sidebar active states, responsive filters and table overflow.
- [ ] UX-03 Verify 360/768/1440px layouts, touch targets, keyboard focus and contrast.
- [ ] UX-04 Verify loading/empty/error/retry states, readable currency and consistent forms.
- [ ] UX-05 Run route sweep and browser journeys for customer, staff, dispatch and rider.
- [ ] UX-06 Validate accessibility, performance, image loading and mobile rider usability.
- [ ] APP-01 Mobile-first web/PWA: assess installability and safe offline drafts; no fabricated offline sales.
- [ ] APP-02 Native Android/iOS and desktop: scope separately, not a mandatory original frontend deliverable.
- [ ] APP-03 If approved, define shared contracts, auth, device security, packaging, update and store release tests.

## P0 — GitHub-first releases and operations
- [ ] REL-01 Audit divergent branches and exact-head CI; avoid wholesale stale branch merge.
- [ ] REL-02 Verify standalone runtime asset copy and packaging without redundant nesting (#208 submitted; actual CI copy-block regression added; fresh CI pending).
- [ ] REL-03 Verify checksum, source SHA, archive safety, dependency tracing and extracted runtime smoke.
- [ ] REL-04 Package compatible API/web runtime pair from immutable GitHub source with migration manifest.
- [ ] REL-05 Verify GitHub CI lint/type/build, unit, integration, isolated PostgreSQL migration, OpenAPI and browser checks.
- [ ] REL-06 Verify release provenance, rollback, backup/restore drill, migration rehearsal and health.
- [ ] REL-07 Deploy verified runtime only; no development dependencies or source builds on VPS.
- [ ] REL-08 Verify live route/role parity, payment readiness without real charges, logs and monitoring.
- [ ] REL-09 Consolidate obsolete releases only after active-path/rollback proof and preservation.
- [ ] REL-10 Record release SHA, test links, feature gates, UAT acceptance and rollback evidence.

## P1 — documentation and launch
- [ ] DOC-01 Reconcile README, routes, API contracts, OpenAPI, permissions and architecture with actual code.
- [ ] DOC-02 Maintain operator manuals for storefront, POS, inventory, fulfilment, delivery, returns and finance.
- [ ] DOC-03 Maintain verification, known issues, handoff and recovery procedures with public-safe evidence.
- [ ] DOC-04 Final owner acceptance of catalogue, policies, domain, delivery coverage and launch.
- [ ] DOC-05 Certify production readiness only after all release-critical gates are verified.

Reference: [existing release roadmap](RELEASE_COMPLETION_ROADMAP.md). Preserve historical evidence; update this checkpoint after every completed slice.
