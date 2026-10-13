# Dispatch + Rider — Contract Gap Audit (frontend wave 2026-10-13)

Branch: `feat/zai-dispatch-rider-readiness-20261013`
Baseline: main @ `7be1b0f` (Fulfilment + Stock Handover Authority #12)

This documents every stale field, stale semantic and missing backend capability
found while aligning the Dispatch/Rider frontend with the merged Fulfilment
Authority. Each finding is classified exactly as requested:

- **frontend-only fix** — done in this wave, no backend change needed
- **backend contract required** — needed when the Dispatch/Rider authority lands
- **future COD Authority** — the next backend milestone after Dispatch/Rider
- **future Returns Authority** — physical returns disposition
- **future provider integration** — courier adapter boundary

---

## 1. Stock depletion semantics (CRITICAL — corrected)

| Finding | Classification | Status |
|---|---|---|
| `riderPickup` called `consumeOrderStock` (stock consumed at rider pickup) | frontend-only fix | **FIXED** — pickup is a custody acknowledgement; stock text now says “consumed at handover” |
| `assignJob` allowed `packed` orders and set `fulfilmentStatus = "dispatched"` on assignment | frontend-only fix | **FIXED** — assignment requires `dispatched` + `stockConsumedAt` (already handed over) and never mutates fulfilment status |
| Dispatch ready queue was “packed orders waiting for handover” | frontend-only fix | **FIXED** — queue is “handed-over delivery orders waiting for assignment” (`fulfilmentStatus === "dispatched" && stockConsumedAt`) |
| Rider UI text “Stock was consumed once at pickup” | frontend-only fix | **FIXED** — replaced with “Inventory handover completed before this dispatch job. Rider actions do not alter sellable stock.” |
| Mock `markDispatched` (order action `dispatch`) did not consume stock | frontend-only fix | **FIXED** — the fulfilment handover now consumes stock exactly once (mirrors backend `handover` + `depletionId` + `stockConsumedAt`) |
| Return-to-store language implied restock | frontend-only fix | **FIXED** — “Returned to store — awaiting Returns inspection”; sellable stock never re-added |

**Backend dependency (backend contract required):** the production dispatch
endpoints must reject any assignment attempt for an order whose
`Order.stockConsumedAt` is unset, exactly as the backend Fulfilment Authority
already guards `handoverAllowed` / blocking reason `already_handed_over`.

## 2. COD payment separation (CRITICAL — corrected)

| Finding | Classification | Status |
|---|---|---|
| `riderDeliver` set `order.paymentStatus = "succeeded"` when `cashCollected` was flagged | frontend-only fix | **FIXED** — delivery completion records a delivery event only; COD orders stay `unpaid` |
| `RiderActionRequest.cashCollected` combined “Mark delivered” + “Cash collected” into one transaction | frontend-only fix | **REMOVED** from the contract and every UI surface |
| `DeliveryJob.cashCollectedAt` / `remittedAt` on the domain + dispatch + rider + checkout contracts | future COD Authority | **REMOVED** from the frontend contracts; recommendation: do not reintroduce until the COD ledger exists. When it lands, model collection + remittance as separate first-class events with their own authority, not flags on the delivery job |
| `DispatchRiderRow.pendingRemittanceMinor` / `pendingRemittanceLabel` (remittance projections) | future COD Authority | **REMOVED**; replaced with read-only `codCash` context (`jobsWithCash`, `totalDueLabel`, note “cash ledger not yet connected”) |
| `DispatchJobActionRequest.action "remit"` + `amountMinor` | future COD Authority | **REMOVED** from the contract and the mock engine (`remitCash` deleted) |
| Admin/rider remittance UI (banner + “Unremitted” column + history states) | frontend-only fix | **FIXED** — all surfaces now show “COD — collection authority pending / cash ledger not yet connected” with no collection state |

**Backend dependency (future COD Authority):** cash collection at delivery and
rider remittance must be separate recorded events with an approval trail. The
UI is already prepared to render them read-only; no financial event may be
implied by `deliveryStatus === "delivered"`.

## 3. Dispatch/rider action authority

| Finding | Classification | Status |
|---|---|---|
| UI reconstructed action availability from local status (`REASSIGNABLE` list) | frontend-only fix | **FIXED** — actions render from server-derived `allowedActions` (+ `blockers`) when supplied; the status fallback exists only for demo parity |
| No `unassign` action (reassign silently released the rider) | frontend-only fix | **ADDED** — `unassign` / `reassign` / `reschedule` / `return_to_store` are distinct actions; mock engine implements each explicitly |
| Assignment did not explain why a rider is unavailable | frontend-only fix | **FIXED** — `DispatchRiderRow.unavailableReason` (“On an active delivery” vs “Off duty / unavailable”); assignment modal shows only eligible riders and explains the rest |
| Ready rows lacked handover provenance | backend contract required | **ADDED (frontend contract)** `DispatchReadyRow.handedOverAt?`, `stockConsumedAt?`, `blockers?`, `allowedActions?`; backend should supply the same fields from the fulfilment authority when the dispatch queue is served |

## 4. Rider workspace boundaries

| Finding | Classification | Status |
|---|---|---|
| `rider.job` had no ownership check — any job id was readable | frontend-only fix | **FIXED (demo parity)** — `riderJob(jobId, riderId)` scopes reads and the engine FORBIDs actions for non-owners. **Production must derive rider identity from the session; the explicit `riderId` parameter is a demo/test affordance only and must never be an authorization grant** |
| `RiderJobsResponse.remittance` projection | future COD Authority | **REPLACED** with `codCash: { jobsWithCash, totalDueLabel, note }` (read-only) |
| `RiderHistoryRow.cashCollected` / `remitted` | future COD Authority | **REMOVED**; history shows “cash due on delivery — collection authority pending” |
| Failure reason was a free-text textarea | frontend-only fix | **FIXED** — structured friendly choices (customer unavailable / refused / address problem / unable to contact / access-safety / vehicle / other) + optional note. **The backend contract keeps `reason` a free string — its vocabulary stays authoritative; the UI maps onto it** |
| “Navigate” button actually shared a demo location label (mislabeled) | frontend-only fix | **FIXED** — honest external Maps app link built from the recorded address/GhanaPostGPS (no geocoding claim); location sharing is a separate, explicitly demo-labelled consent action |
| Photo POD implies upload | frontend-only fix | **FIXED** — honestly labelled “No photo upload is connected — describe the delivery evidence” |

## 5. Provider integration honesty

| Finding | Classification | Status |
|---|---|---|
| Provider rows mixed “configured” and “not connected” without behaviour | frontend-only fix | **FIXED** — every non-in-house provider renders as “Not connected — manual booking only”; no booking reference, quote, courier status, webhook or POD is invented |
| `manual: true` booking recorded as if authoritative | frontend-only fix | **CLARIFIED** — manual booking records the dispatch-custody handover; staff update status themselves (dialog copy is explicit) |

**Backend dependency (future provider integration):** when the provider adapter
boundary lands, provider rows should carry `status: "not_connected" |
"configured" | "live"` from authoritative data, plus real booking references.
Until then the UI must not render any live-provider affordance.

## 6. Location / tracking honesty

| Finding | Classification | Status |
|---|---|---|
| `Rider.lastLocationLabel` demo values presented without framing | frontend-only fix | **FIXED** — every surface labels them “demo label, not GPS” with the last update time; nothing claims live tracking |
| No ETA / GPS fields anywhere | — | **VERIFIED** — regression test asserts no `eta/lat/lng/latitude/longitude/speed/heading` keys appear in any dispatch/rider projection |

**Backend dependency (backend contract required):** if live tracking is ever
introduced it needs a consented telemetry endpoint; the frontend will render
only authoritative timestamps, never interpolated movement.

## 7. Contract fields removed (summary)

From `packages/contracts/src/`:

- `domain.ts` — `DeliveryJob.cashCollectedAt`, `DeliveryJob.remittedAt`
- `dispatch.ts` — `DispatchJobRow.cashCollectedAt/remittedAt`,
  `DispatchRiderRow.pendingRemittanceMinor/pendingRemittanceLabel`,
  `AdminRiderRow.pendingRemittanceLabel`, `DispatchJobActionRequest` action
  `"remit"` + `amountMinor`
- `rider.ts` — `RiderJobView.cashCollectedAt/remittedAt`,
  `RiderJobsResponse.remittance`, `RiderActionRequest.cashCollected`,
  `RiderHistoryRow.cashCollected/remitted`
- `checkout.ts` — `OrderJobView.cashCollectedAt/remittedAt`

All removals are frontend-owned projections of a future financial authority
that does not exist yet — keeping them would have kept teaching users wrong
production rules. No production backend endpoint consumed these fields.

## 8. Contract fields added (additive, backwards-safe)

- `dispatch.ts` — `DispatchJobAllowedAction` type; `DispatchReadyRow.handedOverAt/stockConsumedAt/blockers/allowedActions`; `DispatchJobRow.riderId/blockers/allowedActions`; `DispatchRiderRow.unavailableReason/completedJobs`; `AdminRiderRow.activeJobReference`; `DispatchJobActionRequest` actions `"unassign"` and `"reassign"`
- `rider.ts` — `RiderCodContext` + `RiderJobsResponse.codCash`
- `staff.ts` / `validation.ts` — `DashboardActionable.awaitingAssignment`, `DashboardActionable.deliveryExceptions`

## 9. REST endpoints still to be defined (backend contract required)

`src/services/contracts/endpoints.ts` maps no REST path for any
`admin.dispatch.*`, `admin.riders.*`, `rider.*` operation — the HTTP adapter
correctly rejects them as unknown operations rather than inventing URLs. When
the Dispatch/Rider authority lands, define (suggested):

- `GET /api/v1/dispatch/queue` (ready + jobs + riders + providers, with allowedActions/blockers)
- `POST /api/v1/dispatch/assign`
- `POST /api/v1/dispatch/jobs/{jobId}/actions` (unassign | reassign | reschedule | return_to_store)
- `GET /api/v1/rider/jobs`, `GET /api/v1/rider/jobs/{jobId}` (session-scoped)
- `POST /api/v1/rider/jobs/{jobId}/actions` (accept | pickup | out | deliver | fail | note)
- `GET /api/v1/rider/history`
- `PATCH /api/v1/riders/{riderId}/availability`

The mock adapter already serves all of these operation names behind
`src/services/client.ts`; only the REST mapping is outstanding.
