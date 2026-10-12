# ZAI Frontend Audit — Continuation Wave (2026-10-12)

Baseline: `origin/main` @ `94d480a` (includes backend authorities: reservation, checkout/orders, payments, refunds).
Branch: `feat/zai-frontend-continuation-20261012`.

Method: every route swept at 1440×900 and 390×844 (HTTP + DOM overflow + nav-state + pointer-cursor checks),
key flows walked in a real browser (add-to-cart → checkout, staff login → admin, rider login → job),
screenshots reviewed with a vision model, and page/component source audited against the wave brief.
Baseline health before this wave: `tsc --noEmit` clean, ESLint clean, 56/56 routes HTTP 200,
24/24 acceptance checks, 35/35 bun tests, no horizontal overflow on key routes at 390px.

Status legend: **A** polished · **B** functional but visually weak · **C** missing workflow behaviour ·
**D** broken/incomplete · **E** placeholder · **F** duplicate/inconsistent.

## Storefront

| Route | Status | Key problems | Planned fix | Post-wave |
|---|---|---|---|---|
| `/` | A− | No shopping-assistant entry point on the page (brief §5). Category tiles are text-only. | Assistant band + link into assistant experience | ✅ done |
| `/shop` | A− | Grid/filter/sort solid; two-column mobile OK. No assistant shortcut. | Assistant entry in filter rail | ✅ done |
| `/categories` | **D** | Route 404 — no browse-all-categories index page. | New page listing all categories with counts | ✅ done |
| `/categories/[slug]` | A | Clear category page with product grid | — | A |
| `/products/[slug]` | A | Variant/unit/qty/availability/unavailable state all present; alternatives present | Minor: alternatives heading polish | A |
| `/cart` | A | Line/variant/qty/price/availability separation good; summary sticky | — | A |
| `/checkout` | A | 4-step guided flow (contact → fulfilment → payment → review) + summary | — | A |
| `/checkout/status/[id]` | A | Polling, provider roleplay, duplicate-safe | — | A |
| `/track` | A | Reference + code | — | A |
| `/account` (+ subroutes) | B | Overview/orders/addresses/lists/returns all work; returns create flow solid; **no shopping assistant surface** (budget basket lives buried in `/account/lists`) | Assistant experience surfaced + linked | ✅ done |
| `/help`, `/delivery`, `/returns-policy`, `/privacy`, `/terms` | A | Consistent info-page shell | — | A |

## Admin shell

| Item | Status | Problem | Planned fix | Post-wave |
|---|---|---|---|---|
| Sidebar active state | **D** | `/admin/inventory/receiving` marks BOTH “Stock overview” and “Goods receiving” active (prefix match); top-bar title shows the parent label (“Stock overview”) while on the child route | Most-specific-match active logic; title = active item | ✅ done |
| Sidebar on short screens | B | Long nav scrolls (usable) but no affordance; `pb-24` padding creates dead space | Tighten, keep scroll | ✅ done |
| Mobile admin nav | A | Sheet drawer works, closes on navigate | — | A |
| Page titles/action areas | A− | Consistent `h1` + actions pattern on all pages | — | A− |

## Staff back office

| Route | Status | Key problems | Planned fix | Post-wave |
|---|---|---|---|---|
| `/admin` (dashboard) | B | “Needs attention” + “Recent orders” is actionable but sparse; no queue counts for picking backlog/packed-awaiting-dispatch/refund approvals | Extend dashboard summary with actionable tiles | ✅ done |
| `/admin/orders` | B | Filters work; table lacks mobile card view; no queue-state summary | Mobile card list + count chips | ✅ done |
| `/admin/orders/[id]` | A | Full timeline, actions, substitutions, refunds, reservations | — | A |
| `/admin/fulfilment` | **C** | THE PRIORITY GAP. Queue model mixes “confirmed” and “picking” in the *pick* queue while *pack* duplicates “picking”. No “Picking in progress” queue, no “Exceptions/shortages” queue, no picker/progress/allocated-vs-ordered on line rows, no packing checklist, no handover distinction (packed vs handed-over vs collected), no allowed-actions readiness for the backend authority. | Rebuild queues + picking/packing/handover workspaces | ✅ done |
| `/admin/pos` | A− | Real two-area workspace, holds, receipts, lookup, change calc. Empty cart state wastes the product area; no quick-add keys. | Quick-add tiles + density polish | ✅ done |
| `/admin/cashier-sessions` | A | Open/close/variance/movements | — | A |
| `/admin/products`, `/products/[id]` | A | Price audit history present | — | A |
| `/admin/categories` | A | Works | — | A |
| `/admin/inventory` | B | Core columns good (sellable/reserved/safety/available); no stock-state summary strip (physical vs quarantined vs damaged vs expired); table unusable on phones | Summary strip + mobile cards | ✅ done |
| `/admin/inventory/receiving` | A | Supplier/PO/lot/conversion/expiry/review all present | — | A |
| `/admin/inventory/adjustments` | A | Reason/approval present | — | A |
| `/admin/inventory/stocktakes` | A | Expected/counted/variance/reason/approval present | — | A |
| `/admin/inventory/expiry` | A | Near-expiry/expired/quarantined/damaged sections | — | A |
| `/admin/suppliers`, `/purchases` | A | With replenishment-suggestion integration | — | A |
| `/admin/dispatch` | **C** | Functional tabs (ready/jobs/riders/history) but NOT the brief’s control-centre: no side panel of rider availability/load while working the queue; ready cards lack slot/line/priority context density; assignment dialog decent | Two-zone control centre (main queue + rider sideboard) | ✅ done |
| `/admin/riders`, `/providers` | A | Availability, remittance, not-connected honesty | — | A |
| `/admin/returns`, `/returns/[id]` | A | RETURN (goods) vs REFUND (money) distinction explicit — approval ≠ money moved | — | A |
| `/admin/refunds` | A | Approval/execution/outcome/history with limits | — | A |
| `/admin/customers`, `/payments`, `/reports` | A− | Payments/reports dense tables; no mobile card view on payments | Mobile cards where tables collapse | ✅ done (payments) |
| `/admin/ai` | B | Suggestion cards good (why/evidence/period/action + approve/reject), but page reads flat; no queue framing of review work; assistant QA box exists | Section framing + review queue emphasis | ✅ done |
| `/admin/team`, `/audit`, `/settings`, `/demo` | A | Matrix, trail, settings, demo reset | — | A |

## Rider workspace

| Route | Status | Problems | Planned fix | Post-wave |
|---|---|---|---|---|
| `/rider/login` | A | Honest demo rider picker | — | A |
| `/rider` (today) | A | Job cards, auto-refresh, offline-pending honesty | — | A |
| `/rider/jobs/[id]` | A | Full field-app job card: contact, address, landmark, GPS, COD, instructions, POD, failure report. VLM review: “highly functional, context-aware”. | Minor: status badge contrast | ✅ done |
| `/rider/history` | A | Outcomes + remittance | — | A |

## Cross-cutting findings

1. **Admin nav double-active on nested inventory routes** (fix in shell).
2. **Fulfilment queue semantics** — see above; contract extensions are *optional fields* only, documented for the backend team (no invented states; the mock keeps the existing `confirmed → picking → packed → dispatched/ready_for_collection` machine).
3. **No customer shopping-assistant surface** despite `ai.assistant` / `ai.budget-basket` operations existing — build storefront assistant page + homepage entry.
4. **Dense tables on phones** — several staff tables rely on `table-scroll` with many columns; add mobile card/list alternates where tables collapse.
5. **POS empty state** — quick-add tiles for frequent grocery items to fill the product area and speed keyboard/touch flow.
6. **Evidence hygiene** — the dark “N” badge in screenshots is the dev-only Next.js dev-tools indicator; it does not exist in production builds (verified in the standalone build).
7. `/categories` index missing (404).

## API/data dependencies (unchanged boundaries)

All pages already consume `apiOps` typed service interfaces; no page imports the mock store.
The mock adapter remains the demo transport; the production REST adapter + OpenAPI contract live in
`packages/contracts` + `src/services/adapters/http.ts`. Contract extensions proposed by this wave are
optional fields (see `docs/ZAI_FRONTEND_HANDOFF.md` § backend dependencies).
