# Variety Groceries — full build execution tracker

**Owner instruction:** Continue building the complete platform on the existing private staging portal without stopping for routine per-feature approval. Ensure every release passes backend tests, frontend build, permissions and real authenticated UAT before treating it as complete.

**Canonical staging:** https://portal.varietygroceries.com
**Production root:** https://varietygroceries.com — intentionally still Coming Soon while commercial launch requirements remain outstanding.

The 9 October 2026 starter brief specified a coherent frontend prototype and expressly **did not** represent live payments, couriers, production AI or database as finished. Subsequent development has expanded to NestJS/PostgreSQL and real cashier, inventory, support and selected commerce flows. A working-looking demo screen is not evidence that its backend is ready.

## Verified staged capabilities

- One original staging database `lightworld_variety_uat` with live original catalogue and product media, protected by a private HTTPS staging portal. Old extra UAT hostnames redirect here.
- Real authenticated administrator and cashier invitation/access workflows, cash-only POS UAT foundation and shared stock-reservation/depletion mechanisms.
- Customer-facing grounded product assistant and budget basket using current catalogue. External model wording is optional/off unless specifically configured.
- Durable customer callback/support cases and restricted administrator case inbox.
- Inventory overview, recorded lot ledger, expiry exception queues, live direct goods receiving, complete receipt-history quantities and real branch permission gates. Targeted tests, browser UAT and cloned transaction tests passed.

## Remaining implementation and acceptance work

1. **Stock governance:** audited adjustment requests and approvals, recounts, quarantines, waste/disposal, return-to-stock maker/checker decisions, FEFO selection, duplicate-lot checks, unit conversions and inventory accounting reconciliation. Do not enable unverified stock write buttons.
2. **Staff and security:** real persistent operational roles (operations manager, finance reviewer, picker/packer, dispatcher), scoped branch permissions, individual one-time invitations and account recovery, audit trails, revocation, unauthorized-access UAT and mobile menu parity. Demo role selectors are not valid backend authority.
3. **Checkout and finance:** real order lifecycle, atomic reservation and payment reconciliation, Hubtel MoMo/card/cash provider adapters after verified merchant configuration, idempotent webhooks, COD cash remittance, full/partial refunds, reversal ledgers, tax settings without invented tax rates and accountant reports. No unverified payment may mark an order paid.
4. **Fulfilment and logistics:** picker/packer roles and exception paths, in-house contracted rider assignments, driver proof-of-delivery, collection handling, delivery zones/fees/capacity configured by the business, safe customer contact and external dispatch adapters only with real provider credentials.
5. **Customer experience:** refined storefront, responsive imagery/media controls, order verification and tracking, customer history, delivery/return policies, accessible mobile flows, meaningful error states, notifications with consent, and first-party support/callback.
6. **AI-assisted operations:** verifiable catalogue answers, human-reviewed inventory and dispatch recommendations, privacy and observability protections; no stock modification, refunds or customer contact from unreviewed model output.
7. **Launch readiness:** backup restore drills, secrets/certificate renewal, full typecheck/test suites, realistic end-to-end concurrent UAT, performance and accessibility checks, provider production activation, logs/alerts, data-retention rules and cutover/rollback runbook. The root production domain remains unchanged until these prerequisites have been verified.

## Engineering rules

- Avoid fake completion percentages. Each deliverable is tracked as source implemented, tests passed, staged, real-role UAT passed, and production-ready separately.
- Make staging changes without per-step confirmations, preserving original business records and taking backups ahead of migrations. Keep temporary fixtures isolated and never commit credentials or untracked local UAT scripts.
- Production money movements, public launch and data-destructive changes must follow verified operational safeguards and required provider/business configuration; blanket authorization to keep coding is not evidence of a ready merchant integration.
- Prefer free/open-source self-hosted components and existing infrastructure where appropriate; avoid unnecessary recurring paid dependencies.

## 14 November 2026: wider regression and API contract repair

- The isolated `variety_foundation_test` regression database was created on a dedicated temporary PostgreSQL cluster (port 55439) and all migrations were applied there. Destructive test fixtures never touched the original UAT database.
- Nine suites spanning allocation, cashier invitations and tills, checkout, commerce boundary, rider and dispatch concurrency, customer tracking and stock depletion passed **61/61** on the disposable cluster.
- The generated OpenAPI endpoint initially returned 500 because the new public catalogue AI, support-case and inventory exception/lot/receipt routes were missing from the documentation authority registry. This was an actual contract defect, not a commerce regression.
- Added schemas, security declarations and documented request/response paths for `/ai/assistant`, `/ai/budget-basket`, `/support/requests`, `/admin/support`, `/admin/support/{caseId}/actions`, `/inventory/lots`, `/inventory/receipts` and `/inventory/expiry`. Updated the strict OpenAPI expected-path test.
- New staging `GET /api/v1/openapi.json` returns HTTP 200 with **157 documented paths**; `GET /api/v1/health/ready` also returns 200.
- Final staged root still shows the Coming Soon page, all canonical UAT web/API systemd services active, and the dedicated regression PostgreSQL cluster has been stopped and removed.

Next slices remain inventory governance/adjustment approval, full operational staff roles, supplier PO lifecycle, payment/refund reconciliation and rider delivery orchestration. Do not represent them as live production-ready without independent verification.

## 14 November 2026: live maker/checker inventory quantity corrections

- Replaced the demo adjustment workflow with real branch-limited adjustment lists, idempotent proposal creation, independent administrator approval/rejection, protected lot updates, immutable movements, audit and outbox events. Permission names are `inventory.adjust.request` and `inventory.adjust.approve`.
- The original staging database now contains the `StockAdjustment` ledger with PostgreSQL status and quantity invariants. Its 32 original products, 32 original positive stock lots and 32 original receipts were preserved; no synthetic adjustment proposals were created on staging.
- A private mode-600 database backup was created ahead of migration: `original-portal-before-adjustment-20261114.dump` in the existing restricted backup directory.
- Real PostgreSQL transaction tests passed in a disposable restored clone: same-key exactly-once request and conflicting replay, requester vs checker separation, self-approval prohibition, approval replay/no extra movement, rejection without stock change, stale count refusal, existing stock reservation protection, quarantine blocking, branch access and historical goods receipt integrity.
- The permanent API stock/permission suite passed 17/17; OpenAPI contract passed 3/3. The regenerated API now documents 160 paths and denies anonymous adjustment requests.
- Original staging HTTPS browser UAT at mobile 375 px passed administrator login, the approval workflow, real zero pending requests and all 32 original lots. Optimized Next.js/TypeScript build passed. The admin header has been corrected to `varietygroceries.com operations`.
- The wider cross-module isolated PostgreSQL regression suite passed 61/61, covering checkout and reservations, tills, invitations, inventory depletion, order/payment authority, dispatch/rider races, customer tracking and strict API route coverage.
- Remaining stock governance: multi-lot stocktakes with recounts, evidence uploads, quarantined stock release, controlled damaged/expired disposal and finance inventory journal reconciliation. Those workflows remain disabled as live operations until tested.

## 14 November 2026: replace browser Basic gate with real portal login

- Removed the Nginx `auth_basic` pop-up on the canonical staging hostname only, after backing up the original configuration; retained HTTPS, no-index and cache protection. The production root was not touched.
- Added a private-staging-only Next.js 16 native session entrance that redirects anonymous page navigation to `/staff/login` while leaving login, invitation activation and static assets available. The existing API continues to enforce role, branch and resource permissions.
- Rewrote the HttpOnly staging login cookie path to `/` at Nginx so server-side session verification works on page visits. Staging's passwordless `UAT_DEMO_LOGIN` shortcut is disabled.
- Added a safe account chooser with one synthetic active UAT administrator account and a manual email option for other staff. It requires the actual app password and does not publicly enumerate real staff/customer accounts.
- Verified Nginx syntax/reload; anonymous `/`, `/shop` and `/admin` redirect to native login without WWW-Authenticate; login page 200. Authenticated 375px Chrome completed staff login, protected operations/shop views, logout and correct renewed login challenge. Staging and production health unchanged.
- Full details and rollback: `docs/CANONICAL_STAGING_NATIVE_LOGIN_20261114.md`.
