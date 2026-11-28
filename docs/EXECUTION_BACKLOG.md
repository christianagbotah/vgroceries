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
- [x] INC-09j #227 exact-head CI [passed](https://github.com/christianagbotah/vgroceries/actions/runs/45923685322) and [API passed](https://github.com/christianagbotah/vgroceries/actions/runs/45923685328); reviewed and squash merged 04196493229b58b8b83b9936f24ea724cf7ee29e on 27 Nov. Live HTTPS recovery and staff sign-in pages returned 200; configured root-owned, non-group/world-writable adapter matches exact GitHub blob; strict sandbox and NoNewPrivileges retained. No reset token requested or password changed in this check.
- [ ] INC-09k Owner requests recovery link via supported page, confirms mailbox receipt, privately chooses password, verifies live sign-in and order search. Preserve throttles; actual reset and sign-in acceptance outstanding.
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
- [x] UX-04a Owner-requested admin Orders placed timestamp format DD-MM-YYYY HH:MM:SS in Africa/Accra, both desktop and mobile, no wrapping on desktop; [PR #229](https://github.com/christianagbotah/vgroceries/pull/229), head 289a904a7370304aad2cd69208c4572da9ccf045. Lint and type check passed; full [CI](https://github.com/christianagbotah/vgroceries/actions/runs/45970021185) and [API](https://github.com/christianagbotah/vgroceries/actions/runs/45970021409) in progress.
- [ ] UX-04b Merge #229 after green exact-head CI, include in verified compatible release preserving current recovery/payment feature gates, verify live admin Orders layout and timestamp rendering. No production change yet.
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

### 2026-11-27 — owner order-notification and preview incident checkpoint
- [x] Live read-only incident inspection: guest order paid and SMS consent recorded; order and payment events committed. SMS staging/dispatch and guest proof flags were disabled; email consent not recorded because checkout email UI disabled. No retrospective consent or payment mutation.
- [x] Activated consent-bound SMS staging/dispatch and guest phone verification on current runtime; bounded staging scanned 7 and queued 2, dispatch deferred both awaiting guest proof, serialized two-minute systemd worker active, API readiness 200. Existing encryption key preserved. No claim of handset delivery.
- [x] Configured independent email proof key and existing approved sender/loopback transport, consent/staging/dispatch backend flags and serialized two-minute worker. Worker exit 0 and API readiness 200; no existing email consent, no external email sent. Actual mailbox delivery and storefront opt-in build still outstanding.
- [x] [#230](https://github.com/christianagbotah/vgroceries/pull/230): checkout confirmation, tracking and customer order detail thumbnail projection with published catalogue image fallback; frontend CI passed, API CI pending at head 0be6003ab102eb46295a5dd366025330e56c054d.
- [x] [#228](https://github.com/christianagbotah/vgroceries/pull/228): bounded itemized branded HTML/plain-text email rendering with tracking link; frontend CI passed, API CI pending at head c6ed31bcf02a7819ecbdd5fa7761f7e8d48f652f.
- [x] [#231](https://github.com/christianagbotah/vgroceries/pull/231): preparation, collection-ready, collected and reconciled refund SMS/email rules with targeted tests; both CI workflows pending at head 3975f1197428b8e1b0e7e515b471a54348a60ac4. Refund truth independently revalidated; no actual refund performed. Resolve overlap with #228 email dispatcher before merge.
- [ ] Next: review exact-head CI #228/#230/#231, correct failures/conflicts, merge green source, verify exact main, package checksum-verified RC8 with existing payment/recovery/SMS and email checkout gates preserved, deploy runtime-only and verify API/web/worker compatibility and rollback. #229 merged at 8f540d84cecb1ace44b3c3036baa8f340f20bd69 and exact-main CI passed; date UI awaiting release. Customer must verify existing guest phone to release queued SMS; email proof and inbox receipt require consented checkout. Reconcile remaining lifecycle evidence, failed/pending payment and delivery exception event coverage without claiming unverified delivery.

### 2026-11-27 — RC8 production deployment checkpoint
- [x] #229/#230/#231/#228 merged; exact main 24c9ce3c74028e50c8accc8c6f6422e59559c12a passed CI 45996636465 and API 45996636910. [RC8 build](https://github.com/christianagbotah/vgroceries/actions/runs/45998299538) succeeded. Draft GitHub release archive SHA-256 1e57733ae2f533bc79c15be3308509ce5269a7fd6f104da8b28471b07caeb90b independently verified with source/version and safe archive validation.
- [x] Fresh local database backup 13:21 UTC SHA-256 verified, all 60 migration files identical to RC7; no live migration required. No recent pending payment or active refund at switch. Installed RC8 API and standalone storefront at canonical runtime paths using shared deployment lock, preserved RC7 rollback and existing recovery/payment/SMS/email configuration. Both live release markers verified. All public route/health smoke checks HTTP 200; both scheduled notification workers exit 0 on new runtime; all seven backend notification flags true. Payment counts unchanged (3 succeeded, 1 previously pending), 60 applied migrations and zero unfinished. New modules present. No customer password, payment or refund manually changed.
- [ ] Acceptance: customer verifies existing guest phone; two SMS remain deferred pending proof. Confirm handset receipt, new checkout email opt-in and verification, actual inbox receipt, product thumbnail and admin date visual rendering. No new live payment or actual email receipt tested. Independent offsite backup not verified; older pending payment remains separate reconciliation task. Audit and retire older inactive runtime copies only after verification; keep RC7 rollback. Continue event coverage for payment failures/pending and delivery exceptions.

### 2026-11-27 — RC9 admin confirmation incident
- [x] Owner screenshot and read-only production inspection: paid order awaiting confirmation; original stock hold expired. Legacy staff action transport routes confirm to strict financial/refund endpoint, producing validation error. No production order/payment/stock mutation performed.
- [x] [PR #232](https://github.com/christianagbotah/vgroceries/pull/232) corrects live fulfilment command routing and strict header-only replay keys, shares catalogue thumbnail in admin detail, formats history/placed/notes/reservation/consumption timestamps in Ghana time, and adds guarded fully expired paid-order stock reacquisition under order lock. Regression coverage includes no capture and stock shortage. Latest head 854938d71524e3be32060ebba2daa3c9f50c589f pending exact CI/API. RC8 remains installed.
- [ ] Verify exact-head tests, merge, verify exact-main CI/API, build RC9 through GitHub and deploy verified runtime with recovery/SMS/email/Hubtel gates preserved. Retest confirmation of owner paid order without charging again; stock availability still authoritative. Remaining production staff workflow gaps: verified fulfilment queue shape, explicit reservation pick entry, legacy notes/substitution/cancellation/review actions. Never simulate packing or handover without recorded picks and financial evidence.

### 2026-11-27 — RC9 production deployment checkpoint
- [x] PR #232 exact-head CI/API passed; merged source `974ae3a423aee9727990cacede83d0f6e895c4fb`. Exact-main CI `46014521156`, API `46014521191`, GitHub release `46016544211` all successful. Draft `v1.0.0-rc.9`, archive SHA256 `8437c6e3560186ab20b97ef63906e44d62d1f67d91ae191c6c816ea344f77172`, 162453925 compressed bytes, 569205293 expanded bytes, 31610 entries. Verifier, runtime imports and identical migration files passed.
- [x] Fresh local backup checksum passed, no recent pending payment/active refund/unfinished migration at pre-switch. Initial switch aborted before moving files due to multi-unit systemctl output blank-line formatting; corrected per-unit check and retry succeeded at approximately 14:36 UTC. Both canonical API/storefront markers RC9; RC8 retained as rollback. Public storefront, portal home, checkout, track, forgot-password, staff login, catalog categories and health/live and health/ready HTTP 200. Both order notification timers active and worker service exits successful. No migration or live order confirmation forced. Offsite backup not independently verified.
- [ ] Live authenticated staff acceptance: owner refreshes order details, verifies item thumbnail and DD-MM-YYYY HH:MM:SS, confirms already paid order through normal workflow. Verify resulting state, stock hold, no duplicate capture/depletion. Next unblocked development: verified fulfilment queue shape and explicit per-reservation pick entry; then dedicated legacy staff actions and customer notification acceptance. Retire only verified inactive older runtime copies after recovery evidence; retain RC8 rollback.

### 2026-11-27 — RC10 customer notification checkpoint
- [x] PR #233 merged `6c2eb1bdcabdc33ba2c228fd562c9f96e395b25e`; exact main frontend `46023511265`, API `46023511249`, release `46025399541` all green. Draft `v1.0.0-rc.10` archive SHA256 `79f798cc90642b2ddd754ef88ef88b8949bdddd5df329ccd2b89c0e7a373b627`; 162466395 bytes compressed, 569210332 expanded. Runtime verifier, imports, identical migrations and fresh backup checksum passed; pre-switch no recent pending attempts/active refunds/unfinished migration. Deployed both components, retained RC9 rollback, all nine public/portal health routes HTTP 200. Both notification workers executed successfully, timers active with 30s polling. Actual deployed email renderer generated 31/31 thumbnail URLs from published catalogue, rendered fixture receipt image, item and total successfully. Earlier browser proxy fetches 31/31 success. No external customer delivery claimed. Two SMS pending guest proof, no order email receipt evidence; 60 applied migrations, 0 unfinished. Offsite backup not independently verified.
- [ ] PR #234 `0ff4e10e5e15cd0f9f5ce2c5c4302fd5bfb7141f`: pending/failed/expired/review payment + delivery failure notifications, exact verification pending; merge/build RC11 only after green. Actual SMS/email consent-bound receipt and client image display acceptance remain. Preserve no duplicate or forced customer sends. Next fulfilment queue/picking and older runtime retirement per prior checkpoint.

### 2026-11-27 — RC11–RC13 execution checkpoint
- [x] RC11 source `df00fc613c743e73e2dc5d2704f58e55fa2a4cac`, exact main tests 46026670880 / 46026670882, release 46032829607: deployed and health checked. PR #234 notification exception coverage.
- [x] RC12 source `52c9298487384718be08640dc7b7652a266c6d74`, exact main tests 46032893025 / 46032893063, release 46034623658: deployed, nine HTTP checks passed, notification workers exited successfully, unauthenticated fulfilment API rejected access. PR #235 live queue, reservation picks and handover. No live order mutated during verification.
- [x] RC13 PR #236 merged `d9f3cff889fb488d9439cda07aec5f8e516b3df7`, exact main tests 46035334239 / 46035334357, release 46037243965 successful. SHA256 `bd8538eb7dce8f1bc2b5cd8f326ba7341d5dc0e6b1a9bea2f3c97a741887cb62`. Runtime staged and verified, imports and migration compatibility passed.
- [x] RC13 installed after owner-approved temporary local backup retention increase 14→28; existing 14 retained, fresh checksum-verified backup created at 17:00 UTC (15 recovery points). No migration changes, pending payment/refund/migration counts zero at cutover; both release markers match verified source and digest. Ten HTTP health/route checks passed after transient startup errors, both notification workers exit 0, timers active, unauthenticated fulfilment API 401. RC12 rollback retained.
- [ ] Configure independently stored encrypted backups and verified recovery, review temporary local retention before reaching 28; no backup pruning until approved independent recovery. Authenticated staff fulfilment acceptance and real recipient SMS/email delivery remain unverified. Next: verify live staff order flow with authorized test order and customer message proof, then advance remaining backlog.

### 2026-11-27 — RC14 production checkpoint
- [x] PR #237 pick replay identity scoped to detail/order/reservation/payload across row refreshes; exact PR CI 46039695875 / 46039695984 passed; merged `3fa555dfd210b77c398c469076e70bf75a6565cd`; exact main checks 46042033905 / 46042033786 passed.
- [x] PR #238 POS report authorization-failure cleanup and request serialization; private fulfilment no-store GET headers and HTTP tests. PR CI 46042409257 / 46042409292 passed, merged `34a180d98e09e1a41aabf95cdf75c8cf92760e77`; exact main CI 46044241768 / 46044241740 passed.
- [x] RC14 release 46045388040 exact source `34a180d98e09e1a41aabf95cdf75c8cf92760e77`, archive SHA256 `9c6e39b60ff8d7723c0655c4b87d6c479e869a0d52bfd3b3160fbb6cbb79a8e8`, 162470978 compressed bytes, 569278154 expanded, 31610 entries. Built with administrator-only read-only POS cash history and till reconciliation flags on, existing recovery/SMS/email/payment refresh flags retained. Verified archive, imports, identical migrations, fresh backup checksum, zero recent pending payment/active refund/unfinished migration at pre-switch. Both live release markers RC14, RC13 rollback retained. Eleven portal routes plus public site HTTP 200 after transient startup errors; fulfilment/history/tills unauthenticated 401; both notification workers and backup service exit 0, timers active. No live cash/order data mutated during smoke test.
- [ ] Authenticated POS cash history/receipt and till reconciliation/CSV browser UAT; authenticated order lifecycle and actual consent-bound SMS/email delivery. Report activation does not imply verified cashier transaction or settlement authority. Independent offsite backup remains outstanding.
- [x] PR #239 preference read retry/recovery, no automatic OTP or payment changes. PR checks 46044384716 / 46044384720 passed; merged `eafe35ab6b3374f79a50345250069dd64cde74fb` after RC14 pinned. Not deployed.
- [ ] Next exact-main verification 46045466162 / 46045466163 for PR #239; build RC15 only after both pass; continue critical POS and inventory verification without bypassing authority.

### 2026-11-27 — urgent storage consolidation checkpoint
- [x] Audited project runtime and historical source locations; identified active service and database dependencies, historical rollback copies, and source worktrees with local changes. Three clean linked worktrees removed with Git's worktree command after exact remote branch reachability, empty status/ignored files, stash and active-reference checks. Preserved commits: `ed5994d94d48901270ebc5576ec655eda9a67024`, `7dd43b681108c4be6b87f5c7c622a8dff8055eea`, `98ee9ee69bfe1eb5c9b0c850332c8f4585110a68`. Public and portal/admin routes and database readiness returned HTTP 200 after removal; detailed host-local evidence retained. No database, credentials, uploads or backups removed.
- [x] RC17 active release markers verified; prior RC16 local rollback passed entrypoint and API imports and migration comparison. GitHub release metadata contains matching archive SHA-256 records. Backup units report successful executions; independent offsite restore remains unverified.
- [ ] P0: acquire the shared deployment/maintenance lock without bypass; rehearse checksum-verified GitHub recovery of retained rollback and superseded runtime packages, compare local runtime contents and exclude active references/persistent data, remove complete verified obsolete release directories, then verify public/portal/API/worker readiness. Record actual filesystem delta separately from allocated directory sizes.
- [ ] P0: review dirty/ignored source files and local-only branches in each common Git repository; preserve only secret-reviewed legitimate work in appropriate GitHub branches or secure recovery storage, then retire complete inactive worktrees/checkouts. Preserve active staging dependencies until safely relocated and verified; never delete staging databases.
- [ ] P0: implement/test a release-retention gate under the same deployment lock, keeping active plus one compatible verified rollback and recording removals; integrate after successful GitHub artifact deployment/health checks. No production build worktrees. Retain existing repository visibility; keep sensitive host evidence out of public source.
- [ ] Verify authenticated staff/customer flows, payment integration without a real charge, worker schedules and independent backup recovery; report any existing regression separately. Full consolidation not yet certified.

### 2026-11-27 — verified runtime retention retry
- [x] Shared deployment lock acquired without bypass. Active RC17 retained; RC16 rollback artifact independently downloaded from GitHub, verified against recorded SHA-256 and safe archive rules; local rollback migration files identical to active and runtime imports previously passed. No live rollback or database mutation.
- [x] Complete RC15 and RC14 superseded runtime snapshots removed after independent release download, checksum/safe archive verification, byte comparison with zero mismatches and zero unrecognized extras, mount/service/process reference checks and successful health gates before/after each removal. Allocated bytes removed: 1,333,194,752; measured filesystem free-space increases during removals: 1,328,726,016 bytes. Preserved GitHub sources RC15 `807c2636b661c2dd09fe90730bc2c66068588740` and RC14 `34a180d98e09e1a41aabf95cdf75c8cf92760e77`. No credentials, uploads, backups or database data removed.
- [x] Host-local retention command implemented and exercised in apply mode with exclusive shared lock, default non-destructive mode, exact active/rollback marker checks, checksum-verified recovery, byte comparison, reference/mount exclusions, per-removal health and audit evidence.
- [ ] Finish remaining independently verified obsolete snapshots, staged candidates and legacy source preservation; add reusable retention integration and tests to GitHub-controlled deployment workflow. Host-local command alone is not complete automated post-deployment retention. Full consolidation remains open.

### 2026-11-27 — retention retry second batch
- [x] Independently recovered RC13 and RC12 GitHub artifacts, validated their archive digests and safe archive structures, and compared all local runtime files against their packages. Zero mismatches and zero unrecognized extras. Removed both complete superseded snapshots under shared lock with service/mount/process reference checks and successful post-removal public, portal, admin and database readiness checks. Source commits: `d9f3cff889fb488d9439cda07aec5f8e516b3df7`, `52c9298487384718be08640dc7b7652a266c6d74`.
- [x] Retry total: 4 obsolete release snapshots removed; 2,666,340,352 allocated bytes removed; measured per-removal filesystem free-space increases total 2,661,867,520 bytes. RC17 live and RC16 rollback retained, no data or backups removed.
- [ ] Remaining superseded snapshots, staging candidates and legacy directories still require independent review. Continue the host retention command using the shared lock and record evidence; complete automated GitHub-controlled post-deployment retention integration.

### 2026-11-27 — third verified retention batch
- [x] Removed three additional superseded complete runtime snapshots (RC9, RC10, RC11), after GitHub archive recovery, checksum validation, exact local file comparison, reference checks and public/portal/admin/API health checks. Allocated bytes: 1999847424; measured filesystem free-space increases: 1999872000. Source commits: `df00fc613c743e73e2dc5d2704f58e55fa2a4cac`, `6c2eb1bdcabdc33ba2c228fd562c9f96e395b25e`, `974ae3a423aee9727990cacede83d0f6e895c4fb`.
- [x] Opened [PR #248](https://github.com/christianagbotah/vgroceries/pull/248) with configurable retention command, safety regression tests and operating documentation. Frontend CI including new guard tests passed; API CI pending at checkpoint.
- [ ] Two legacy snapshots held because older marker formats or component identities differ; compare individual components against verified GitHub archives before deletion, preserving historical exception evidence in protected host storage. Stage candidates and dirty source workspaces still open. Active RC17 and compatible RC16 rollback retained.

### 2026-11-27 — canonical rollback consolidation and further worktree cleanup
- [x] Verified legacy RC8 and RC4 runtime components against independently downloaded GitHub release archives; both components had zero mismatches/extras. Resolved conflicting RC4 historical marker metadata by comparing actual runtime bytes, preserved small historical markers/exception evidence in protected host storage. Removed both complete obsolete rollback directories: allocated bytes 1333506048, measured filesystem free-space increase 1333481472. RC17 active, RC16 sole canonical rollback. No database or backups removed.
- [x] Removed three additional complete clean linked source worktrees after exact remote branch proof, status/stash verification, review of ignored dependency links/generated declaration, service/process reference checks and Git worktree removal. Allocated bytes 36491264, filesystem free-space increase 36855808. Remote sources: `ee3cb305b761841e159365363955601d32732a3b`, `65dad1e23e8e9b10f5681345ee80cb517f8b0d10`, `1f3c3c91f5f6b7b16db485a972bf153270aa87c9`. All post-removal health checks passed.
- [ ] Retire remaining stage/candidate directories only after archive and local-content verification; preserve unique historical evidence securely. Continue review of other historical worktrees/releases and active legacy staging dependencies. PR #248 full API CI pending at checkpoint. Automated deployment integration and offsite restore remain open.

### 2026-11-27 — canonical runtime and stage consolidation completed
- [x] Retired all three obsolete canonical stage/candidate directories after independently verifying RC6/RC7 packages and RC1 API/RC2 storefront rollback components. For RC6, preserved the small generated cache and confirmed the extra schema engine byte-identical to the single protected copy from RC7 before removing the redundant files; retained historical verification evidence in protected host storage. Full component rechecks had zero mismatches/extras. Stage allocated bytes 1712369664, measured removal-window filesystem free-space increases 1712078848. No sensitive evidence uploaded.
- [x] Canonical directory now contains only active RC17 API/storefront, release markers and the compatible RC16 rollback. Across the canonical retention passes, nine obsolete rollback snapshots and three stage/candidate directories removed; measured canonical removal-window free-space increase 7707299840 bytes. This execution also removed three clean linked worktrees; all post-removal site/admin/database readiness checks passed.
- [x] [PR #248](https://github.com/christianagbotah/vgroceries/pull/248) exact head frontend and API CI passed; merged `774648d040bc665d5cfffea2650faa930664cdf8`. Installed GitHub-reviewed exact script blob and verifier, host-only config, shared-lock systemd oneshot and daily bounded timer. First live oneshot exit 0; timer enabled/active. Exact merged-main CI was still running at last check. The timer uses default safety gates and checks active/rollback/health; post-deployment explicit invocation remains a documented operational requirement.
- [x] Final public, portal/admin and API readiness HTTP 200; canonical API and portal, media worker and notification timers active; both backup and notification-worker last results successful. Shared VPS filesystem at 88% at final verification.
- [ ] Remaining: audit/preserve other legacy release/source roots and active staging dependencies outside the canonical directory; consolidate permanent application entry path only after service migration/verification. Independent offsite recovery, authenticated transaction acceptance and live payment integration checks remain open. Do not remove protected databases, uploads, backups or configuration.

### 2026-11-27 — expanded VPS and nested worktree audit
- [x] Re-audited root, application and legacy release locations, deployment roots, runner workspaces, temporary directories and nested worktrees. No Variety Groceries-named directories found in the top-level shared worktree or deployment roots, archive, QA or runner workspace inventory at the inspected depth.
- [x] Removed 14 additional complete linked development worktrees with Git worktree removal, including ten nested worktrees. Verified remote branch ancestry, clean tracked/untracked state and stash state, reviewed generated files, protected local evidence, checked service and dependency references, serialized against deployment, and verified health after removal. Allocated directory bytes: 748089344; measured removal-window filesystem free-space increase: 749809664 bytes. All 14 paths confirmed absent. Seven nested worktrees remain for unique-change/history review.
- [x] Final public, portal, admin and API readiness HTTP 200; both backup and notification service results successful. Shared filesystem utilization 86%, available bytes 48801800192. Canonical runtime and rollback unchanged.
- [ ] Review remaining historical root checkout and generated deployment packages, preserving unique Git history and recovery evidence without publishing secrets. Review 31 legacy releases separately; some still support running services, dependency links or configuration. Do not remove active production/staging dependencies.
- [ ] Review remaining dirty source workspaces, nested worktrees and temporary checkouts against GitHub; preserve legitimate differences and protected operational data before complete directory retirement. Database directories and service-private temporary paths must remain protected. Complete single-entry-path migration and independent backup/transaction verification only after safe acceptance.

### 2026-11-27 — further retired development workspaces
- [x] Retired six further complete linked worktrees (checkout/order core, commerce reservation, read-only POS, OpenAPI repair, POS cash history and refund guard). Four previously uncertain source revisions verified as ancestors of current GitHub branches through GitHub compare. Clean status/stash, generated files, protected small planning evidence, service/dependency references and shared deployment lock checked before Git worktree removal. All six paths confirmed absent. Allocated bytes removed 1246654464; measured per-removal filesystem free-space increase 247611392 bytes.
- [x] Public, portal, admin and database readiness endpoints returned HTTP 200; both backup units reported success. Shared filesystem utilization 85%, available 50513367040 bytes. Canonical active/rollback unchanged.
- [ ] Legacy releases remain pending independently verified artifact recovery and safe migration of active legacy services. Seven nested worktrees require unique source/history preservation. Root historical repository object recovery and temporary dirty checkouts remain open; preserve all protected configuration, database directories and backup infrastructure.

### 2026-11-27 — deeper filesystem audit and nested retirement
- [x] Removed two additional complete nested account-wishlist hotfix worktrees after GitHub compare proved their merged revision is an ancestor of current main, local worktrees were clean, generated declarations were preserved, active references were excluded and deployment locking/health checks passed. Allocated bytes 26484736; observed removal-window filesystem free-space increases 26677248 bytes. Five nested worktrees remain.
- [x] Expanded filesystem name audit identified additional mail, backup, Nginx and temporary locations. Protected service, configuration, logs, databases and mail; filesystem-wide exhaustive attribution not certified. Five old root archives have no matching artifact listed for their source revisions in inspected successful GitHub Actions runs. Older legacy API runtime differs from the active legacy API despite similar source metadata. No deletion of these unverified packages.
- [x] Verified active canonical RC17 and sole RC16 rollback, retention timer active, legacy and staging services still active, and public/portal/admin/API readiness HTTP 200; backup services successful. VPS utilization 85%.
- [ ] Remaining: preserve unique historical Git objects and dirty worktrees, establish exact artifact recovery for inactive legacy deployments, migrate still-running legacy services only with acceptance checks. Do not delete or modify persistent data, mail, configuration or required backups. No indiscriminate filesystem cleanup.

### 2026-11-28 — root consolidation and development continuation
- [x] Retired original historical root repository, two standalone historical source repositories and one temporary readiness checkout after remote branch reachability verification, worktree/reference checks, generated dependency inspection and protected exact Git metadata recovery. All four archived Git object inventories and refs matched extracted recoveries, fsck passed, SHA-256 recorded. The temporary untracked lockfile was preserved securely. Allocated bytes removed 3422314496; measured filesystem free-space increases 1070000512 bytes. No sensitive archives uploaded to public GitHub. Local recovery archive does not constitute independent offsite recovery.
- [x] Cleared remaining root project-specific historical items by moving five checksum-verified deployment archives, one configuration-backup directory and three recovery/configuration files into restricted consolidated recovery storage; verified source paths absent and byte digests unchanged. Relocation is not disk-space reclamation. Exact GitHub artifact recovery still unverified, therefore preserved rather than discarded.
- [x] Final public/portal/admin/API readiness HTTP 200; both backup units successful; VPS 83%, 59711475712 bytes available. Canonical RC17/RC16 retained.
- [x] Resumed development: reviewed and merged [PR #247](https://github.com/christianagbotah/vgroceries/pull/247) at checked head `32c774b27b3e0814565ec36bb1637ee4b686165e`; frontend and API CI passed, merged commit `bb821a773db17c8f045c68c15a87acbea261827e`. Checkout SMS verification prominence, independent tracking forms and order-reference binding improved without automatic OTP or payment blocking. New runtime release/deployment and actual recipient receipt are not yet verified.
- [ ] Remaining: 31 legacy release directories (some active dependencies), five nested worktrees and other dirty source checkouts require safe recovery/preservation and service migration before deletion. Continue GitHub-first verified release packaging and acceptance checks; never bypass persistent data or backup protections.
