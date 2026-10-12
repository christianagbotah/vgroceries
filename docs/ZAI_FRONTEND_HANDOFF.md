# ZAI Frontend Handoff — Continuation & Completion Wave

**Wave**: frontend product quality, UX/UI, workflow completeness, responsiveness, API-readiness
**Base**: `origin/main` @ `94d480a` (backend reservation / checkout-orders / payments / refunds authorities merged)
**Scope rule honoured**: frontend work only — no backend business rules were changed; every mock
engine mutation this wave is view-shaping (queue composition, card fields, summary totals), never
a new state transition or a changed invariant.

## 1. Branch

`feat/zai-frontend-continuation-20261012` (pushed; PR into `main` — **not merged** by the frontend wave)

## 2. Final commit SHA

See `git log` on the branch — final commit is the responsive-overflow fix + documentation commit
(`fix(responsive): checkout grid children min-w-0 …`). Run `git rev-parse HEAD` on the branch for
the exact SHA at review time (9 wave commits total).

## 3. Routes changed

| Route | Change |
|---|---|
| `/` | Shopping-assistant entry band (compact, honest demo label) |
| `/categories` | **NEW** browse-all index (fixes the previous 404) |
| `/assistant` | **NEW** customer shopping assistant: catalogue-grounded Q&A with evidence + suggestions, budget basket, add-to-cart |
| `/checkout` | 360px horizontal overflow fixed (grid children `min-w-0`) |
| `/admin` | Queue-aligned actionable tiles (ready-to-pick / picking / refunds-to-approve added) |
| `/admin/orders` | Mobile card list alternate (md and below) |
| `/admin/fulfilment` | **Rebuilt as the priority workspace** — queues: awaiting-confirmation / ready-to-pick / picking / exceptions / packed-handover / collection (+ conditional ready-to-pack when the backend exposes a picked state); picker, started-at, progress, allocated-vs-ordered, shortage, substitution badges, FEFO lots with expiry, packing checklist, note dialog with line attachment, handover boundary notice (“packing has not deducted stock”), event trails, backend-driven `allowedActions` |
| `/admin/dispatch` | **Rebuilt as a control centre** — main queue (ready-to-dispatch with slot/phone/COD, active jobs, completed) + fleet sideboard (rider availability/load/remittance, providers with honest “Not connected”); reassignment for failed/rescheduled jobs; `?order=<id>` deep link opens the assignment dialog (used by fulfilment handover) |
| `/admin/pos` | Quick-add tiles (8 frequent items with live availability) shown while search is empty |
| `/admin/inventory` | Stock-state summary strip (sellable / reserved / safety / available / quarantined / damaged-expired) + mobile card list |
| `/admin/payments` | Mobile card list |
| `/admin/ai` | Human-in-the-loop boundary notice; every suggestion card renders the explicit **Proposed next action** |
| Admin shell (all admin routes) | Exact-match active nav — nested inventory routes light up exactly one item; top-bar title always matches the active route; sidebar short-screen padding tightened |

## 4. Components added

- `src/features/staff/fulfilment-views.tsx` — `PickerLineTable`, `PickingMeta`, `PackingChecklist`,
  `QueueCardHeader`, `HandoverNotice`, `NoteDialog`, `WorkflowStrip`, `EventTrail`, `allows()`
- `src/app/(storefront)/assistant/page.tsx` — customer assistant experience
- `src/app/(storefront)/categories/page.tsx` — categories index
- `scripts/responsive-sweep.mjs`, `scripts/audit-sweep.mjs` — QA tooling
- `scripts/frontend-continuation-regressions.test.ts` — regression suite

## 5. UX issues fixed

1. Admin nav double-active state on nested routes + wrong top-bar title (exact-match logic).
2. Fulfilment queue semantics mixed confirmed+picking in one queue while duplicating picking in
   another; no exceptions/shortage queue; no picker/progress/allocated/shortage data.
3. No handover semantics: packed orders are now explicitly “not yet handed over”, with the stock
   boundary stated on the screen.
4. Dispatch was tabs-in-sequence, not a control centre; no rider sideboard while working the
   queue; no reassignment path.
5. `/categories` 404.
6. No customer shopping-assistant surface or homepage entry.
7. POS empty state wasted the product area; no quick-add.
8. Dashboard tiles didn't map 1:1 to the fulfilment queues and missed refunds-approvals.
9. Checkout 360px horizontal overflow (grid `min-width:auto`).
10. Dense staff tables unusable on phones (orders / inventory / payments now have card alternates).
11. AI suggestions lacked an explicit proposed next action; boundary against auto-execution now
    stated on the page.
12. Sidebar dead-space padding on short screens.

## 6. Tests added

`scripts/frontend-continuation-regressions.test.ts` — 15 tests / 127 assertions:

- fulfilment queue split (confirm/pick/picking; pack empty by design), seeded shortage order in
  exceptions with line-level `shortageQty`, no shortage reported before picking starts
- card contract: picker, started-at, progress, `allowedActions` mirroring the state machine, events
- packing never consumes stock; packed order lands in the handover queue with packedBy/packedAt/slot
- dashboard actionable: queue-aligned counts + `refundsAttention`
- inventory summary strip totals consistent with row model; quarantined/damaged-expired present
- AI: every suggestion (generated **and** seeded) carries `proposedAction` + evidence + period
- assistant contract: answer/evidence/purchasable suggestions; budget basket never exceeds budget
- dispatch queue shape; assigning an already-active job is rejected
- categories index data quality

## 7. Verification commands + exact results (all executed)

| Command | Result |
|---|---|
| `bun run lint` | 0 errors, 0 warnings |
| `bunx tsc --noEmit` | 0 diagnostics (strict, `ignoreBuildErrors` never reintroduced) |
| `bun run build` | PASS — strict TypeScript; static prerender clean (`/checkout`, `/cart`, `/assistant`, `/account/returns`) |
| `node scripts/route-sweep.mjs` (production server) | **58/58** routes HTTP 200 |
| `bash scripts/acceptance-checks.sh` | **24/24** |
| `bun test scripts/` | **50 tests / 460 assertions, 0 fail** (35 prior + 15 new) |
| `node scripts/responsive-sweep.mjs` | **19 routes × 5 viewports (360/390/768/1024/1440) — 0 horizontal overflow** (found + fixed checkout at 360px) |
| Browser DOM audit | pointer-cursor on all interactive elements; 16px body text; single active nav item on nested routes |
| VLM visual review | fulfilment picking workspace “production-ready”; POS “solid, context-aware”; rider job “highly functional, context-aware” |

## 8. Screenshot evidence

`docs/qa/evidence/zai-frontend-continuation-20261012/` — `desktop/` (21), `mobile/` (16),
`tablet/` (9), captured **against the production build** (Next.js dev-tools badge verified absent).
Extra working-state shots: `admin-fulfilment-picking.png`, `admin-fulfilment-exceptions.png`.

## 9. Remaining frontend gaps

1. “Ready to pack” queue intentionally empty until the backend defines a picked state (tab renders
   only when the service returns rows).
2. Per-line pick confirmation (scan-by-scan) not in the mock; progress = fully-allocated lines.
3. Mobile card alternates cover the three densest tables only; other tables rely on column hiding
   + in-table scroll.
4. Rider status-badge contrast borderline in direct sunlight (design pass with the real app theme).
5. No real auth/roles yet — demo role selectors remain (backend duty).
6. Fulfilment keyboard-flow polish (barcode-driven pick confirmation) awaits the backend
   handover authority contract.
7. See `docs/KNOWN_ISSUES.md` §26–31 for the complete list.

## 10. Backend API dependencies still waiting for real APIs

Contract extensions proposed by this wave (all **optional, backward-compatible** fields — mock
adapter already serves them; adopt, alter, or negotiate when the fulfilment/refund authorities land):

| Contract | Fields proposed |
|---|---|
| `FulfilmentLineCard` | `allocatedQty?`, `shortageQty?`, `isSubstitution?` |
| `FulfilmentOrderCard` | `pickerName?`, `pickingStartedAt(Label)?`, `linesAllocated?`, `linesTotal?`, `hasExceptions?`, `packedByName?`, `packedAtLabel?`, `allowedActions?`, `events?` |
| `FulfilmentQueues` | `picking` + `exceptions` queues; `pack` reserved for the future picked state; dispatch/collection rows gained `slotLabel/customerName/packedAtLabel/packedByName` |
| `DashboardActionable` | `readyToPick`, `picking`, `refundsAttention` (replacing `toPick`/`toPack`) |
| `AISuggestion` | `proposedAction?` |
| `InventoryOverviewResponse` | `summary?` (stock-state totals) |

Hard dependencies (unchanged from the master handoff): real auth/permissions, catalogue/inventory
read API, reservation + depletion transactions, payments with server-side verification, dispatch
provider adapters, returns/refunds ledger, then reports/AI grounding. The UI renders only what the
service permits via `allowedActions`; nothing invents a transition or a success.

**AI boundary**: `ai.assistant`, `ai.budget-basket`, `admin.ai.*` remain deterministic demo rules —
no live model, no auto-execution of refunds/stock/price/promotions/substitutions/supplier payments;
every suggestion carries evidence, data period and a proposed next action that requires a human.
