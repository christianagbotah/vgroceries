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
  - [x] VG-A07b #209 exact-head [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45802231142) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45802231249) passed; merged a7c6066e9cf07fbe4a18296db6bd75556e39c484.
  - [x] VG-A07c Submit #219 bounded cash-sale history, private admin route, receipt review, UI and regression tests, selectively ported from #175 to current main; head 11b9558a099e3d83a499eb9ff48e4e65514298b4.
  - [x] VG-A07d #219 exact-head [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45878802833) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45878802913) passed; merged a6b1c4b96213c112d1cc53b2e550259b9c52cbcc. Live read-only admin UAT remains outstanding.
- [x] VG-A07e Submit #222 explicit independent default-off POS cash history and till reconciliation release build gates, regression tests and rollout documentation (head c9f9496192cd43e7a5f83aa63d46a100c9ffba7b).
- [x] VG-A07f #222 exact-head [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45882744277) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45882744143) passed; merged 798a85fe36d6f5d0759c04711285c49549d5b814. Compatible release and live administrator UAT outstanding.
- [ ] VG-A08 Establish one compatible web/API release lineage, compare current runtime provenance privately. Component release markers match RC4; current main directly descends from that source. Verify artifacts rather than relying solely on markers; root-level historical markers are stale. Preserve rollback and verify migrated DB, correct worker runtime, and live POS/storefront route parity.
- Next action: INC-03/INC-04 and INC-06c–09 take priority over VG-A07d; continue independent POS work while payment/notification gates run. #207 ([CI](https://github.com/christianagbotah/vgroceries/actions/runs/45799999170), [API](https://github.com/christianagbotah/vgroceries/actions/runs/45799999150)) and #208 ([CI](https://github.com/christianagbotah/vgroceries/actions/runs/45800003211), [API](https://github.com/christianagbotah/vgroceries/actions/runs/45800003177)) passed and merged. #209 exact-head CI passed and merged; reconciliation uses existing GET endpoints, independent default-off UI flag, no new routes on API, no migrations or financial writes. Preserve prior release roadmap. No deployment.

## P0 — storefront customer payment and notification acceptance (priority override)
- [x] INC-01 Verify existing hosted-checkout recovery against independent provider evidence and existing reconciliation service; restricted operational evidence retained outside public repo.
- [x] INC-02 Submit #210 bounded default-off hosted reconciliation worker and checkout refresh UX; exact-head [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45803866842) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45803866870) passed; merged as 0d3f4c139e61a77f9c1283ccb88ba70d2262e96f.
- [ ] INC-03 Verify integrated release and worker selection/cooldown/concurrent callback cases, verify canonical web/API lineage, deploy verified artifacts and activate only on approved runtime. #210 exact-head CI passed and merged; activation remains outstanding.
- [x] INC-03d Submit #220 least-recently-checked hosted recovery queue and shared customer/worker lookup cooldown with durable pre-lookup claims; PostgreSQL fairness and concurrent-claim regressions. Head 8c9d05e280a22e120b2c1c4df6ef74db6091f76f; no migration or real provider calls. Not in RC6.
- [x] INC-03e #220 exact-head [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45879267706) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45879267722) passed; merged da3cfa5e386ab400e3d95c1356abfb08d39c4d6f. Release integration and live provider acceptance remain outstanding.
- [ ] INC-04 Verify hosted callback delivery and ingress against approved provider configuration; demonstrate automatic recovery when callback is absent, without new charge.
- [x] INC-04a Cross-check Shiloh reference implementation: browser polling actively checks provider and callback/poll share finalization; notifications originate from order creation and confirmed payment. Submit #213 owner-scoped provider refresh with durable per-order cooldown and existing payment authority (head 1941a0ad16a5d48879384b7bde10f6ab37d2e0a3).
- [x] INC-04b #213 corrected head c245d644276a2a1673f110c291456dc80406a9cf passed [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45814712911) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45814712751), merged as 695c15cd4c2803179dfcc8a7fd9e86ee8915424c. Production activation and callback/poll convergence UAT remain open in INC-03b/INC-09.
- [x] INC-04c Read-only check of current callback ingress against published Hubtel Online Checkout callback reference; documented source is allowed. No callback in inspected project logs, so cause of missed delivery is not established. No ingress relaxation. Reference: https://code.hubtel.com/docs/callbacks and https://code.hubtel.com/docs/guides/reconciliation.
- [x] INC-03a Prepare #214 versioned-release checkout build gates and mandatory compiled worker checks (head efb8b17e95d972a004fbcba7cf030a7ba3e0e4f5). [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45813575943) and [API CI](https://github.com/christianagbotah/vgroceries/actions/runs/45813576034) passed; merged 17b4d2745314ed2611494b247ddd870ad87d468a.
- [x] INC-03b Exact-main a6ac5eabedb5ff25a51b80b704f401fbc72f0511 passed [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45822077989) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45822078134); [RC6 GitHub release](https://github.com/christianagbotah/vgroceries/releases/tag/v1.0.0-rc.6) created by [workflow](https://github.com/christianagbotah/vgroceries/actions/runs/45823806598) with both checkout build gates enabled. Runtime archive identity, checksum, safe extraction, imports and worker entrypoints verified. Fresh local database backup checksum verified and restored in a disposable PostgreSQL instance; candidate migration deploy succeeded (55 migrations). No live migration, service switch or worker activation.
- [ ] INC-03c HOLD: independent encrypted offsite backup and recovery destination not configured/authorized; retain RC6 staged and RC4 active; no approved remote destination found during recheck. After satisfying the existing backup gate, verify current preflight, apply additive migration, switch compatible API/storefront with rollback, activate bounded workers and complete live UAT. Never send production data to GitHub.
- [x] INC-05 Submit #211 gated explicit order-only SMS consent UX; exact-head [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45804023965) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45804023499) passed; merged as 426363c56b03737f80d91ffc3c799dbd4eac4918.
- [x] INC-05a Authorized single-message Hubtel SMS transport UAT: gateway acceptance and recipient-confirmed handset receipt on 2026-11-26. No personal identifiers or provider references recorded here. Automated order-event dispatch remains unverified.
- [x] INC-06a Port #200 on current main, integrate bounded default-off staging and dispatch runner, add guest proof and checkout verification; #212 head f0ed84824bd9ff0d64fbdb1b559f5fbf8c6e7ab8 ([CI](https://github.com/christianagbotah/vgroceries/actions/runs/45811002167), [API](https://github.com/christianagbotah/vgroceries/actions/runs/45811002165)), both passed and merged.
- [x] INC-06b #212 exact-head CI and API workflows passed and merged as a0a3454e2c9a9d5018bb3f115dc8bee7d1aefd1e; deployment remains gated.
- [ ] INC-06c Verify production migration/client parity, scheduler serialization, revocation, bounded costs, receipt reconciliation before activation. Read-only preflight confirmed no failed migrations and existing SMS stage migration still pending. Current notification worker needs canonical runtime and authorized environment parity; do not repurpose older worker blindly. Preserve encryption key locally, never generate a replacement for existing encrypted destinations.
- [x] INC-06d Submit #221 customer/guest owner-only SMS consent status and revocation, no-store API, order-first lock, audit, customer UI, and deferred guest queue while proof disabled (head 47e08f2e6c9aa20a1c92227bf028ef8f46f3d4b2). Tests submitted; no real SMS sent.
- [x] INC-06e #221 exact-head [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45880520741) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45880520755) passed; merged 4631a17996f801fb5b66c8ad80fe1e4702e8da3b. Release integration and actual SMS revocation/delivery UAT remain outstanding.
- [ ] INC-07 Verify guest checkout phone ownership and order-specific consent; #212 adds order-bound consumed OTP proof, deferred queue until proof, optional checkout UI and guest dispatch regression. Registered recipient proof retained. Actual automatic delivery, revocation and lifecycle UAT outstanding; no retrospective opt-in.
- [x] INC-08a Safe email transport-only #215 passed [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45822372326) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45822372264), merged 06d115cc582cd15905042adc795abde6193d587f after RC6 was pinned. Not in RC6; no real email sent.
- [x] INC-08b Submit #216 independent email consent/staging schema, migration, encrypted queue and default-off one-attempt dispatch worker with policy and database regression tests (head 5c3b7ad37b34a8eb36cc71abc0333c5a56e5b13b). [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45827203123) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45827202743) passed; merged dc0725bd4e3b2123e1c2988091b6445b46b1bf50. Not part of RC6.
- [x] INC-08c1 Submit #217 order-scoped checkout email consent, schema/OpenAPI, idempotency compatibility and default-off frontend/API gates (head 7f59574b72604fc7e8bd459cdfe6d94ea6fe1971). [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45873415087) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45873414936) passed; merged 75e967b77a61080f106dbf2996d8ccf414b03fec. No production activation.
- [x] INC-08c2 Submit #218 owner-scoped mailbox proof, independent revocation, GET/POST API and checkout status UI, with offline fake-mailer tests (head 76c5eed6a01056ecd0d0049ef0239c7e027c6a8a); corrected head passed and merged in INC-08c3. No real email sent.
- [x] INC-08c3 #218 corrected head 89d1eeb248cd345c209ef958599765cebb49f3ae passed [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45876392147) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45876392068); merged 3851c5ed9cd3bb63679fb3f3caf07787c9692479. Added forward-only email OTP purpose constraint and independent default-off release flag. No production activation.
- [ ] INC-08c4 Prove sender configuration and real mailbox delivery, verify scheduler and revocation/dispatch concurrency, then activate on approved runtime. No email flags enabled until acceptance.
- [x] INC-09a Read-only incident investigation confirmed a reconciled online order remains present and is returned by both live backend list services, including reference and paid filters. The browser order list lacked an external-event refresh path. #225 adds no-store, 15-second foreground refresh, manual refresh, last-success timestamp and clear/search behavior (head a3e221e2c9ea6401566ec784c69d83ea721a6ab5). CI and authenticated browser UAT pending; actual browser root cause not established. No customer identifiers or production changes.
- [x] INC-09b Screenshot-confirmed demo session caused missing live order. #225 additionally implements persistent demo warning and live sign-in escape, clears stale demo marker before real authentication, debounced search and historical product/variant matching with PostgreSQL regression. No production identifiers included.
- [x] INC-09c #225 corrected head d6849dfd59fa6bdca4fed459bb6d51197e411699 passed [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45915856673) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45915856833); merged e6ac7ec695e083bb6bd96a5404c169895333e5ea. Live authenticated browser UAT remains outstanding.
- [x] INC-09d Submit #226 independent password recovery release gate (head ef4a1a0c598e1488001c0853972800f91666cdd1); existing recovery UI and backend remain disabled on live runtime. Mail transport configuration inspected; owner confirms access to account email. No reset secret, recipient details, credential changes or email dispatch in public evidence.
- [x] INC-09e #226 exact-head [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45917262596) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45917262648) passed; merged 4ff2dc00c83d36481c02b2e19eadda92cfd42424. Exact-main [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45918813573) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45918813572) passed. Dispatched [RC7](https://github.com/christianagbotah/vgroceries/actions/runs/45919669096) with password recovery, SMS and hosted payment refresh build gates enabled; email and POS review flags disabled. Runtime activation remains separate. No live changes.
- [x] INC-09f RC7 [release build](https://github.com/christianagbotah/vgroceries/actions/runs/45919669096) and [draft release](https://github.com/christianagbotah/vgroceries/releases/tag/v1.0.0-rc.7) completed. All five assets present. Independently verified archive SHA-256 1e183c1a96bdd258978ff051d8915267a26adaf328bd5b886ffc55aa1af0d818, exact source and version, safe runtime archive structure under shared capacity/maintenance gate; temporary verification copy removed. Five additional additive migration files versus RC6 require a fresh restore rehearsal. No runtime changes.
- [x] INC-09g Fresh consolidated local backup completed and SHA-256 verified. RC7 runtime entry points/imports checked; isolated PostgreSQL 18 scratch restore succeeded; all 54 historical migration checksums matched; all six pending migrations applied (54→60), existing order count preserved. Scratch server and rehearsal files cleaned on exit. No live migrations or runtime switch.
- [x] INC-09h Owner explicitly approved RC7 deployment using verified fresh local backups with temporary offsite backup deferral. First attempt failed before migrations due to Prisma platform engine copy permissions; RC4 restored, DB remained at 54 migrations. Verified pinned platform engine against vendor SHA-256 and retried with explicit migration-only engine. All six live migrations applied (54→60), RC7 API/storefront activated, canonical and legacy health verified, live recovery form available, demo login disabled, existing orders preserved. Prior RC4 runtime retained for rollback. Recovery enabled; new SMS/email dispatch, internal transfer writes and hosted worker remain disabled; customer payment refresh enabled. No recovery email sent or password changed by deployment.
- [x] INC-09i Diagnosed recovery transport failure in hardened API; root-owned bounded loopback SMTP adapter from PR #227 exact source passed three mock tests and sandbox delivery test. Live API configured and healthy with NoNewPrivileges and ProtectSystem unchanged; no reset token exposed. GitHub CI pending.
- [ ] INC-09j Verify #227 exact-head CI and merge; owner requests recovery link via supported page, verifies delivery, chooses private password, verifies live sign-in and order search. Preserve rate limits; complete independent offsite backup.
- [ ] INC-09j Restore independent encrypted offsite backup coverage and verify recovery; review obsolete staged releases only after safety gates. Record actual runtime compatibility and post-deploy acceptance.
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
- [ ] POS-06 Paginated read-only cash-sale history, original receipts and scoped query tests: #219 passed CI/API and merged. #222 adds release gate; live admin history/receipt UAT outstanding. Preserve admin-only access.
- [ ] POS-07 Till cash-in/out, closing count, reconciliation, variance and approval: #209 read-only reconciliation and authenticated CSV passed CI/API and merged. #222 adds release gate; live reconciliation and mutation authority UAT outstanding.
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
  - [x] XFER-01a Port #204 current-main candidate as #223 (head d36ac6f009b92e49955c383bdb0b0262d9c10e64) preserving notification/POS schema and contracts, add independent default-off API authority and private GETs; fresh [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45889130957) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45889130950) passed; merged 1bb04acc9da72ca776f85cebdd573caf3f0602af.
  - [ ] XFER-01b #223 CI/API passed and merged; complete OpenAPI, independent release flag and live migration/permission acceptance remain outstanding. No live transfer activation.
  - [x] XFER-01c Submit #224 destination receipt ledger and independently default-off write API, original lot stock movement, cumulative exact carrying value and idempotent retries; head a8d0dedb1538afb783d45c8a6066c0b8a22a3968. Fresh CI pending.
  - [ ] XFER-01d Verify #224 CI and review; complete receipt status/remaining stock projection, reconciliation/close transitions, quarantine and discrepancy authority, complete OpenAPI and staff receipt UI. No activation until stock conservation and accounting boundary UAT pass.
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

## P0 — customer communication and phone-only account recovery (owner expansion)
- [ ] COM-01 Complete notification event inventory; verified order creation, payment pending/succeeded/failed, fulfilment, rider assignment, out-for-delivery, delivered, delivery failure/reschedule, cancellation, refund outcomes. Extend in-app and approved transactional external templates only from committed authoritative evidence. Never announce payment or refund before settlement.
- [x] COM-02 Submit #228 itemized branded HTML + plain-text order email using historical line prices, quantities and totals, approved public featured product images only, no private/draft media, escaped text, bounded rendering. No external dispatch or deployment; exact-head CI, rendering acceptance and sender proof still needed.
- [ ] COM-03 Complete email worker and transport alignment with verified loopback SMTP, explicit sender/proof, default-off flags, bounded message sizes and accurate delivery history; verify branded image fallback on Gmail/mobile, customer consent, duplicate prevention and no unauthorized customer data. Enable only after actual UAT.
- [ ] COM-04 Complete SMS and in-app worker acceptance, canonical runtime scheduler, consent/revocation, per-event proof, duplicate prevention, cost ceilings, current read/unread counter, foreground auto-refresh, customer-owned clickthrough, staff alerts and later native push. No unapproved external notifications.
- [ ] REC-PHONE-01 Audit phone-only customer registration and canonical number uniqueness. Require active customer, unique verified registered Ghana number; no reset via an unverified or ambiguous destination. Provide authenticated verification at signup and support verified recovery for legacy unverified accounts; never bind a new number during unauthenticated recovery.
- [ ] REC-PHONE-02 Add independently default-off anonymous phone recovery request and completion contracts, trusted origin, generic non-enumerating request response, purpose-specific challenge and HMAC key, canonical destination/IP rate limits and abuse budgets, six-digit OTP via existing Hubtel adapter, five-minute database-clock expiry, max five attempts, 60-second resend cooldown and hourly limits. Store only digest/encrypted destination; no OTP logging; never reuse login, order or phone verification OTPs.
- [ ] REC-PHONE-03 Atomically consume correct recovery challenge, verify unchanged active customer/verified phone, update scrypt password and revoke all web/native sessions plus outstanding recovery challenges/tokens in one transaction. Wrong attempts must commit without password changes; expired, replayed, cross-purpose and concurrent requests must fail. Staff/admin recovery remains email-only. No manual throttle bypass.
- [ ] REC-PHONE-04 Build responsive forgot-password Email/Mobile tabs, Ghana number normalization, request/code/new password/confirm screens, accessible resend timer and accurate errors, optional OTP autofill, clear success/sign-in path. Add API/OpenAPI, browser and database integration tests including phone-only accounts, unknown/duplicate/unverified numbers, provider rejection, rate limit, replay, concurrent verification, session revocation and no account enumeration. GitHub build/release and verified real SMS UAT before activation.
