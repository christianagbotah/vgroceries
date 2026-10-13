# ZAI Dispatch + Rider Frontend Production-Readiness — Handoff (2026-10-13)

Wave: **DISPATCH + RIDER FRONTEND PRODUCTION-READINESS**
Repository: https://github.com/christianagbotah/vgroceries

## 1. Branch / PR / SHA

| Item | Value |
|---|---|
| Branch | `feat/zai-dispatch-rider-readiness-20261013` |
| Base | `main` @ `7be1b0f` (Fulfilment + Stock Handover Authority #12) |
| Pull request | **#13** — https://github.com/christianagbotah/vgroceries/pull/13 (open, NOT merged by design) |
| Final SHA | `564046050ff0120fbd1e1a65c65bca4c2fafc41e` (2 commits, 62 changed files; +1 docs commit recording this PR) |

The PR is intentionally left open for the backend architect's review. Nothing
was merged into `main` by this wave.

## 2. Changed routes / components

**Routes (7 reworked):**

| Route | Change |
|---|---|
| `/admin/dispatch` | Full control-centre rework: 4 sections (Awaiting assignment / Active deliveries / Exceptions / Completed), allowedActions-driven actions, assignment modal with unavailable-rider reasons, unassign/reassign/reschedule/return-to-store manage dialog, honest COD context |
| `/admin/riders` | Busy vs available vs off-duty distinction, active-job reference link, completed-job counts, confirm-before-off-duty dialog, mobile card views, `unavailableReason` |
| `/rider` | Next-action hints per job card, read-only COD context (`codCash`), honest boundary copy |
| `/rider/jobs/[id]` | Sticky primary action bar, ownership-scoped reads, structured failure reasons (7 friendly choices + note), rescheduled and return-to-store states, POD dialog without cash record, honest external Maps link, photo-POD honesty |
| `/rider/history` | COD-due context without collection state, returned-to-store outcome |
| `/rider/login` | Unchanged structurally; honest demo framing retained |
| `/admin/fulfilment` | Handover tab now performs the authoritative stock-consuming handover (confirmation dialog) instead of only deep-linking to dispatch |

**Also touched:** `/admin` dashboard (tiles split: Packed — handover /
Awaiting assignment / Delivery exceptions), `/track` + `/admin/orders/[id]`
(honest COD display), `/delivery` + `/terms` (customer copy no longer claims
collection/remittance recording).

**Core modules:**

- `src/services/mock/engine/delivery.ts` — rewritten domain rules (see §3)
- `src/services/mock/engine/orders.ts` — `markDispatched` = single depletion event
- `src/services/mock/router.ts` — ready-queue semantics, allowedActions/blockers,
  ownership scoping, unassign/reassign actions, honest COD projections
- `src/services/mock/seed-ops.ts`, `seed-catalog.ts`, `store.ts` — seeds +
  seed-isolation fix
- `src/services/client.ts` — `riderJob(jobId, riderId?)` ownership param
- `packages/contracts/src/{dispatch,rider,domain,checkout,staff,validation}.ts`
  — contract cleanup (see §5)
- `scripts/dispatch-rider-regressions.test.ts` (new, 21 tests),
  `scripts/responsive-sweep-dispatch-rider.mjs` (new),
  `scripts/capture-dispatch-rider-evidence.sh` (new),
  `scripts/acceptance-checks.sh` (rider COD section updated)

## 3. Domain corrections implemented (the wave's core mandate)

1. **Rider pickup never consumes stock.** `riderPickup` is a custody
   acknowledgement. `consumeOrderStock` was removed from the rider lifecycle.
   UI text: “Inventory handover completed before this dispatch job. Rider
   actions do not alter sellable stock.”
2. **Dispatch assignment is not the fulfilment handover.** `assignJob` requires
   `fulfilmentStatus === "dispatched" && stockConsumedAt` and never mutates
   fulfilment status. The ready queue is “Handed-over delivery orders waiting
   for assignment”, never “packed orders waiting for handover”.
3. **The fulfilment handover is the single depletion event.** Mock
   `markDispatched` consumes stock exactly once (idempotent on repeats),
   mirroring backend `handover`/`depletionId`/`stockConsumedAt`. The
   fulfilment UI performs it behind an explicit confirmation dialog.
4. **Delivery completion and COD payment are separate.** `riderDeliver` never
   touches `paymentStatus`; the `cashCollected` flag is removed everywhere.
   COD surfaces are read-only: “₵X due on delivery · cash ledger not connected /
   collection authority pending”.
5. **Return-to-store never restocks.** Terminal state text: “Returned to
   store — awaiting Returns inspection”; sellable stock is never re-added.
6. **Remittance authority removed.** `remitCash`, the `"remit"` job action and
   all `cashCollectedAt`/`remittedAt`/`pendingRemittance*` projections were
   deleted from contracts, engine, router and every UI surface.
7. **No fake ETA/GPS/tracking.** Regression-tested: no `eta/lat/lng/…` keys in
   any projection; provider rows honestly “Not connected”; location labels are
   consent-based demo values with timestamps.

## 4. UX changes summary

- **Assignment modal** — only eligible riders are selectable; busy/off riders
  are explained inline (“N riders on an active delivery · M off duty — not
  selectable”); manual provider booking labelled “not integrated”; choices are
  preserved across recoverable errors; double-submit disabled while busy; a
  stock-boundary notice states inventory was already consumed.
- **Manage-job dialog** — unassign / reassign / reschedule / return-to-store
  are distinct actions, each gated by server `allowedActions` (options
  disabled with reasons when not permitted).
- **Exceptions section** — visually distinct (warning border) without page
  noise; failure reason + rescheduled window + prior reason in context.
- **Rider job page** — one primary action per state at 56px height, sticky
  bottom action bar, sending state indicator, structured failure reasons,
  offline-pending notes retained on screen, POD required.
- **Riders admin** — BUSY (on a job) is distinct from off-duty; availability
  toggle asks for confirmation when taking a rider off the assignment pool;
  active job shows the order reference; mobile card view.
- **Fulfilment handover** — explicit “Hand over — consume stock once”
  confirmation with what happens next.

## 5. Contract changes

Removed (frontend-owned projections of a non-existent financial authority):
`DeliveryJob.cashCollectedAt/remittedAt` (domain), `cashCollectedAt/remittedAt`
(dispatch + rider + checkout job views), `pendingRemittanceMinor/Label`
(dispatch riders + admin riders), `RiderJobsResponse.remittance`,
`RiderActionRequest.cashCollected`, `RiderHistoryRow.cashCollected/remitted`,
`DispatchJobActionRequest "remit"` + `amountMinor`.

Added (additive, backwards-safe): `DispatchJobAllowedAction`;
`DispatchReadyRow.handedOverAt/stockConsumedAt/blockers/allowedActions`;
`DispatchJobRow.riderId/blockers/allowedActions`;
`DispatchRiderRow.unavailableReason/completedJobs`;
`AdminRiderRow.activeJobReference`; `DispatchJobActionRequest` actions
`"unassign"`/`"reassign"`; `RiderCodContext` + `codCash`;
`DashboardActionable.awaitingAssignment/deliveryExceptions`.

Every recommendation for the backend (including suggested REST paths) is
classified in **`docs/ZAI_DISPATCH_RIDER_CONTRACT_GAPS.md`** (frontend-only fix /
backend contract required / future COD Authority / future Returns Authority /
future provider integration).

## 6. Tests executed (exact results)

| Command | Result |
|---|---|
| `bun test scripts/` | **71 pass / 0 fail — 690 assertions** (50 prior + 21 new dispatch/rider) |
| `bunx tsc --noEmit` | **0 diagnostics** (strict mode; `ignoreBuildErrors` never used) |
| `bun run lint` | **0 errors, 0 warnings** |
| `bun run build` | **PASS** — 48/48 static pages generated |
| `node scripts/route-sweep.mjs` (production server) | **58/58 routes HTTP 200** |
| `bash scripts/acceptance-checks.sh` | **25/25** (rider COD section now also asserts remittance absence) |
| `node scripts/responsive-sweep-dispatch-rider.mjs` | **40 route × viewport combinations — 0 horizontal overflow** |

**New regression coverage** (`scripts/dispatch-rider-regressions.test.ts`,
all 14 mandated cases): rider pickup does not mutate stock; assignment does
not mutate stock (and rejects pre-handover orders); the handover is the single
consumption event; COD delivery never marks payment succeeded; return-to-store
never restores stock; busy riders are not assignable (and stay busy);
ownership scoping on reads/actions/notes; proof required; failure reason
required; reschedule state data + allowedActions; no ETA/GPS keys in any
projection; rejected actions leave safe state; double-submit idempotency
(identical retry no-op / different proof CONFLICT / double assign rejected);
allowedActions drives visibility (incl. payment-blocked ready rows). Responsive
usability is covered by the sweep script + DOM evidence.

**Incidental real bug fixed:** `seedRiders`/`seedProviders` were shared by
reference into the store — engine mutations permanently poisoned the seeds so
`demo.reset()` could not restore rider busy states. Seeds are now deep-copied
(store.ts).

## 7. Screenshot evidence

`docs/qa/evidence/zai-dispatch-rider-readiness-20261013/` — **26 PNGs**,
captured against the production build (`bun run start`, standalone output):

- `desktop/` — dispatch control centre, riders, fulfilment handover, dashboard,
  rider workspace (1440px)
- `mobile/` — dispatch, riders, dashboard, login, assigned job,
  out-for-delivery job, rescheduled job, returned-to-store job, POD dialog,
  failed-delivery dialog, history (390px)
- `w360/`, `tablet/` (768), `laptop/` (1024) — overflow-check captures
- `extra/` — assignment modal (verified open), active deliveries, exceptions,
  returned-to-store completed section, fulfilment handover tab + confirmation
  dialog

Dialog states were verified in the accessibility tree at capture time
(e.g. `dialog "Assign VG-7G3K9J"`, `dialog "Confirm delivery"`,
`button "Hand over — consume stock once"`).

## 8. Known issues / backend dependencies

See `docs/KNOWN_ISSUES.md` §24–29 and the gaps doc. Highlights:

1. **Rider identity** must come from the session in production; the explicit
   `riderId` parameter is demo parity only.
2. **No REST mapping for dispatch/rider ops yet** — the HTTP adapter honestly
   rejects them until the Dispatch/Rider authority defines paths.
3. **allowedActions/blockers are mock-derived** until the backend supplies
   them; the UI already prefers server values.
4. **COD cash collection + remittance** await the future COD Authority (all
   surfaces intentionally show “collection authority pending”).
5. **Return-to-store disposition** awaits the future Returns Authority.
6. **Providers** are manually booked only; no live courier integration.
7. **Structured failure reasons** are UI affordances over a free-string
   contract; backend vocabulary stays authoritative.

## 9. Deliberately not implemented

- No production backend authority of any kind (no dispatch/rider endpoints,
  no COD ledger, no remittance accounting, no provider adapters).
- No live GPS/ETA/tracking; no geocoding of GhanaPostGPS codes.
- No rider media upload (photo POD honestly labelled as not connected).
- No auth/role hardening — demo selectors remain (backend identity wave).
- No redesign of unrelated modules; the storefront/POS/inventory surfaces
  beyond the COD-adjacent copy were untouched.
- The PR is **not merged** — awaiting backend architect review.
