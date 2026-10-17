# Dispatch + Rider Authority Design

**Status:** Conversational design approved; written specification pending user review.

**Date:** 2026-10-13

**Repository:** `christianagbotah/vgroceries`

**Working branch:** `feat/dispatch-rider-authority-20261013`

**Base:** `main` at `7be1b0fdfc457763704512bae5a2bba685369279` (`Fulfilment + Stock Handover Authority (#12)`)

## 1. Purpose

Build the production backend authority for delivery dispatch and the rider operating lifecycle after the already-merged Fulfilment + Stock Handover Authority has physically handed a delivery order out of sellable store custody.

This milestone must make assignment, rider ownership, delivery progress, proof of delivery, failed-delivery handling, rescheduling, return-to-store state, and provider-neutral manual fallback durable, auditable, idempotent, concurrency-safe, and API-driven.

It must **not** become a second inventory authority and must **not** quietly absorb COD cash accounting, rider remittance, physical return inspection/restocking, live courier integration, or route/GPS intelligence.

## 2. Authoritative upstream boundary

The Fulfilment Authority is already the only authority that deducts sellable physical stock for a delivery order.

For a delivery order, the upstream sequence is:

`awaiting_confirmation -> confirmed -> picking -> packed -> fulfilment handover -> dispatched`

At fulfilment handover the existing production service:

1. validates payment/COD handover eligibility;
2. validates complete reservation-backed picks;
3. calls Inventory `consumeClaim(...)` exactly once;
4. writes immutable depletion provenance;
5. sets `Order.stockConsumedAt`;
6. sets `Order.fulfilmentStatus = dispatched`.

Dispatch begins **after** that transaction succeeds.

### Non-negotiable consequence

None of the following may ever deduct inventory:

- dispatch assignment;
- rider acceptance;
- rider pickup/custody acknowledgement;
- out-for-delivery;
- successful delivery;
- failed delivery;
- reschedule;
- return-to-store;
- retry of any dispatch/rider operation.

Dispatch must not import or call Inventory stock-depletion services.

## 3. User and operational outcome

The milestone succeeds when:

- staff can see handed-over delivery orders waiting for assignment;
- staff can assign an eligible in-house/contracted rider or a manual external-provider booking;
- one live rider cannot accidentally own conflicting active assignments;
- a rider session can see and mutate only that rider's jobs;
- delivery state transitions are server-authoritative;
- proof of delivery is captured without inventing unsupported storage;
- failed deliveries can be rescheduled or returned to store without phantom inventory changes;
- return-to-store is explicitly awaiting Returns inspection and never auto-restocks;
- COD due amounts may be shown as read-only operational context, while cash collection/remittance remain separate future financial events;
- every mutation is idempotent and auditable;
- API projections expose backend-derived allowed actions and blockers so clients do not reimplement the state machine.

## 4. Scope

### In scope

- production `DispatchModule` in the NestJS API;
- migration `007` for delivery jobs, rider operational profiles, delivery events, proof metadata, and required constraints/indexes;
- dispatch queue/detail projections;
- rider fleet projections;
- rider self/jobs/history projections;
- assignment to rider;
- unassignment before rider custody begins;
- controlled reassignment;
- rider availability/offline state;
- rider accept;
- rider pickup/custody acknowledgement;
- rider out-for-delivery;
- delivered with proof;
- failed-delivery reason;
- admin reschedule;
- admin return-to-store;
- manual external-provider assignment fallback;
- staff-recorded manual-provider delivery milestones, clearly attributed as manual staff records;
- idempotency, row locking, optimistic/version consistency where appropriate;
- audit events, order events, outbox events;
- typed shared contracts and OpenAPI;
- production authorization for admin and rider roles;
- tests for concurrency, ownership, lifecycle, inventory non-mutation, failure paths, privacy, and API drift.

### Explicitly outside this milestone

- COD cash collection ledger;
- rider remittance/reconciliation ledger;
- changing `Order.paymentStatus` because delivery completed;
- cash-at-collection settlement;
- physical Returns Authority and disposition inspection;
- restocking returned delivery goods;
- substitutions;
- POS;
- live courier/provider API calls;
- provider credentials/secrets;
- provider webhooks;
- live GPS tracking;
- route optimization;
- ETA prediction;
- push/SMS notification delivery;
- proof image/blob storage service;
- customer delivery-PIN issuance workflow unless an existing authoritative credential is available;
- broad production-role expansion beyond the current `admin | inventory_manager | customer | rider` backend roles;
- rider user creation/provisioning UI.

## 5. Authority boundaries

### Dispatch owns

- `DeliveryJob` lifecycle;
- assignment target and assignment provenance;
- rider operational availability profile;
- delivery events;
- delivery proof metadata/reference;
- delivery failure/reschedule/return-to-store operational state;
- `Order.deliveryStatus` transitions that correspond to delivery operations;
- `Order.fulfilmentStatus = delivered` when delivery successfully completes;
- delivery-related OrderEvent/AuditEvent/OutboxEvent records.

### Fulfilment owns

- packed state;
- physical handover from sellable store custody;
- `Order.stockConsumedAt`;
- `Order.fulfilmentStatus = dispatched` at delivery handover;
- exact stock depletion.

Dispatch must never rewrite fulfilment pick/depletion records.

### Inventory owns

- lots;
- reservations;
- sellable/physical stock;
- depletion provenance;
- future return-restock mutation.

Dispatch has no write dependency on Inventory.

### Payments owns

- payment attempts;
- payment status projections;
- payment/refund provider state.

Dispatch may read `Order.paymentMethod`, `Order.paymentStatus`, and `Order.totalMinor` for display/policy context, but delivery completion must not manufacture payment success.

### Future COD Authority owns

- cash collected from customer;
- who collected it;
- collected amount;
- shortages/overages;
- rider cash liability;
- remittance;
- reconciliation;
- resulting payment settlement projection.

### Future Returns Authority owns

- inspection of goods physically returned after failed delivery;
- saleable restock vs quarantine vs damaged/unsafe disposition;
- any stock re-entry.

## 6. Delivery job creation and dispatch queue

A delivery order is eligible for Dispatch only when all of the following are true:

- `Order.fulfilment = delivery`;
- `Order.fulfilmentStatus = dispatched`;
- `Order.stockConsumedAt IS NOT NULL`;
- the order is not cancelled;
- the FulfilmentRun has `handedOverAt` and `handoverKind = dispatch`.

The Dispatch queue may project such an order as **awaiting assignment** even before a `DeliveryJob` row exists.

The first successful assignment transaction creates the one-and-only `DeliveryJob` for the order if it does not already exist. This avoids a circular dependency requiring Fulfilment to call Dispatch synchronously merely to seed an empty job.

`Order.deliveryStatus` remains `unassigned` until assignment.

A unique order/job constraint guarantees one delivery job per order.

## 7. Persistence model

### 7.1 `RiderProfile`

One operational profile per backend user with `Role.rider`.

Proposed fields:

- `id String @id @default(uuid())`
- `userId String @unique`
- `phone String`
- `kind String` — `in_house | contracted`
- `vehicle String` — bounded vocabulary initially matching existing contracts
- `availabilityState String` — `available | offline`
- `lastAvailabilityChangedAt DateTime`
- `version Int @default(1)`
- `createdAt DateTime`
- `updatedAt DateTime`

**Busy is not persisted as an independently editable truth.** A rider is operationally busy when an active rider-owned `DeliveryJob` exists. This prevents `isAvailable=true` while an active job still exists.

A rider is assignable only when:

- profile availability is `available`;
- backend user is active;
- no conflicting active rider job exists;
- any future policy blockers returned by the service are absent.

### 7.2 `DeliveryJob`

Proposed fields:

- `id String @id @default(uuid())`
- `orderId String @unique`
- `assignmentKind String` — `rider | manual_provider`
- `riderProfileId String?`
- `providerKey String?`
- `providerNameSnapshot String?`
- `manualProviderReference String?`
- `status String`
- `custodyState String`
- `assignedBy String`
- `assignedAt DateTime`
- `acceptedAt DateTime?`
- `pickedUpAt DateTime?`
- `outForDeliveryAt DateTime?`
- `deliveredAt DateTime?`
- `failedAt DateTime?`
- `failureReasonCode String?`
- `failureNote String?`
- `rescheduledFor DateTime?`
- `returnedToStoreAt DateTime?`
- `version Int @default(1)`
- `createdAt DateTime`
- `updatedAt DateTime`

The order address/customer snapshot remains on the Order/OrderDeliveryAddress authority. DeliveryJob references the order rather than duplicating sensitive address data.

### 7.3 `DeliveryEvent`

Append-only event/provenance row:

- `id String @id @default(uuid())`
- `deliveryJobId String`
- `orderId String`
- `actorKind String` — `staff | rider | system`
- `actorId String?`
- `action String`
- `fromStatus String?`
- `toStatus String?`
- `note String?`
- `safeMetadata Json`
- `requestId String`
- `createdAt DateTime`

Index by `(deliveryJobId, createdAt)` and `(orderId, createdAt)`.

No mutation/deletion in normal application code.

### 7.4 `DeliveryProof`

At most one authoritative successful-delivery proof record per job:

- `id String @id @default(uuid())`
- `deliveryJobId String @unique`
- `method String`
- `reference String?`
- `note String?`
- `recordedByKind String`
- `recordedById String?`
- `recordedAt DateTime`

The database stores metadata/reference only, not image/signature blobs.

Initial accepted proof vocabulary must be aligned to what production can truthfully verify. Existing frontend values (`pin`, `signature`, `photo_note`) may remain in shared contracts only if server policy reports them as available. The backend must not treat an arbitrary browser-entered PIN as cryptographic/customer proof without an authoritative order-bound credential verifier.

Therefore the API response includes `allowedProofMethods`. If no secure customer PIN credential exists, `pin` is not returned as allowed.

## 8. Custody model

Delivery status alone is insufficient to decide safe reassignment. The job therefore carries a small explicit `custodyState`:

- `dispatch` — goods are in Dispatch custody after fulfilment handover, before rider/provider pickup;
- `rider` — assigned rider has acknowledged physical pickup;
- `provider` — manual external provider has been recorded as having physical custody;
- `customer` — delivered;
- `return_pending` — delivery failed/return instructed while goods are not yet recorded back at store;
- `store_returned` — goods physically returned to store but not inspected/restocked.

This custody field does **not** change inventory. Inventory was already depleted at fulfilment handover.

### Reassignment rule

A job may be freely unassigned/reassigned only while `custodyState = dispatch` and the previous rider/provider has not recorded pickup.

After pickup, reassignment requires an explicit custody transition back to `dispatch` or `store_returned` through a controlled return flow; the server must not merely swap `riderProfileId` while goods are still with a different rider.

## 9. State machine

### 9.1 Core statuses

Use the existing public delivery vocabulary:

- `unassigned`
- `assigned`
- `accepted`
- `picked_up`
- `out_for_delivery`
- `delivered`
- `failed`
- `rescheduled`
- `return_to_store`

The absence of a `DeliveryJob` plus an eligible handed-over order projects as `unassigned`.

### 9.2 Rider flow

`unassigned -> assigned -> accepted -> picked_up -> out_for_delivery -> delivered`

Rider-controlled failure is allowed from:

- `accepted -> failed`
- `picked_up -> failed`
- `out_for_delivery -> failed`

Pickup sets `custodyState = rider` and **does not touch inventory**.

Delivery requires proof and sets:

- `DeliveryJob.status = delivered`;
- `custodyState = customer`;
- `Order.deliveryStatus = delivered`;
- `Order.fulfilmentStatus = delivered`;
- proof row/event/audit/outbox.

It does not set `Order.paymentStatus = succeeded` for COD.

### 9.3 Admin exception flow

From `failed`, staff may choose:

- `rescheduled`, with a future or policy-valid retry time/window;
- `return_to_store`, creating a return instruction/state.

`rescheduled` retains the existing assignment only when custody and policy make that safe. If goods are back under dispatch control, staff may reassign.

### 9.4 Return-to-store completion

The public vocabulary contains `return_to_store`, but the operational distinction between “instructed to return” and “physically back” matters. We preserve the public delivery status while using `custodyState` and timestamps/events to distinguish:

1. return instructed: `status = return_to_store`, `custodyState = return_pending`;
2. store physically receives goods: `status = return_to_store`, `custodyState = store_returned`, `returnedToStoreAt` set.

No stock row, reservation, lot, or depletion record is changed.

The projection must say: **Returned to store — awaiting Returns inspection.**

## 10. Assignment kinds

### 10.1 Rider assignment

A rider assignment transaction must lock in deterministic order:

1. Order;
2. existing DeliveryJob if present;
3. RiderProfile;
4. conflicting active jobs for that rider.

Then it validates:

- eligible handed-over delivery order;
- rider profile belongs to an active rider user;
- availabilityState is `available`;
- no active conflicting job;
- job custody is safe for assignment/reassignment.

It then creates/updates the job, writes events/audit/outbox, and updates `Order.deliveryStatus = assigned` atomically.

### 10.2 Manual provider fallback

No live provider API is called in this milestone.

A manual-provider assignment records:

- configured provider key/name if selected;
- operator-supplied booking/reference if available;
- `assignmentKind = manual_provider`;
- event text that explicitly states the milestone was manually recorded.

Provider registry data is configuration/read-model data, not a fake integration. Secrets and live credentials are out of scope.

For manually booked providers, authorized staff may record the equivalent operational milestones (`picked_up`, `out_for_delivery`, `delivered`, `failed`) through dedicated staff commands. Every such event is attributed to the staff actor and source `manual_provider`; it must never masquerade as a provider webhook.

## 11. Rider identity and authorization

### 11.1 Rider session source of truth

Rider APIs derive the acting rider from the authenticated backend session/user.

The browser must never authorize an operation by sending an arbitrary `riderId` that the server trusts.

### 11.2 Rider visibility

A rider may read:

- their own RiderProfile;
- jobs currently assigned to them;
- their own delivery history;
- minimum customer/address/contact information required to perform those assigned deliveries.

A rider may not read another rider's job merely by guessing its ID.

### 11.3 Staff authorization

With the current production role vocabulary, `admin` owns dispatch/rider administrative mutations in this milestone.

`inventory_manager` receives no dispatch mutation rights.

The richer demo/front-end permission matrix remains a UX model until backend role expansion is deliberately designed in a later authority milestone.

## 12. Rider availability

`availabilityState` is a staff/rider-declared intent (`available | offline`).

Effective state returned by the API is derived:

- `busy` if an active rider-owned job exists;
- otherwise declared `available` or `offline`.

Rules:

- a busy rider cannot be assigned another conflicting job;
- setting a busy rider to `available` does not override busy;
- setting a busy rider to `offline` prevents new work after the current job but does not orphan the active job;
- availability changes are idempotent and audited.

## 13. Failure reasons

The API uses a bounded machine-readable reason vocabulary plus optional note. Initial codes:

- `customer_unavailable`
- `customer_refused`
- `address_problem`
- `unable_to_contact`
- `access_or_safety_issue`
- `vehicle_or_operational_issue`
- `other`

The note is required for `other` and may be optional for bounded codes.

Failure never cancels the order, never marks payment successful, and never restores stock.

## 14. Proof of delivery

Delivery completion requires a server-allowed proof method and sufficient reference/detail.

Rules:

- proof is mandatory for `delivered`;
- exactly one authoritative successful-delivery proof row per job;
- retries replay the same result and do not duplicate proof;
- changed proof input under the same idempotency key conflicts;
- proof metadata is included in the delivery timeline where safe;
- raw media blobs are not stored in this schema;
- arbitrary PIN text is not accepted as verified customer proof unless a secure order-bound verifier exists;
- no proof field changes COD financial state.

## 15. COD separation

For `paymentMethod = cash_on_delivery`, Dispatch may project:

- `codDueMinor = Order.totalMinor` or a future payment-authority-derived due amount;
- `paymentStatus` as currently held by Orders/Payments;
- a blocker/message that COD cash authority is separate.

This milestone does **not** persist:

- `cashCollectedAt`;
- rider remittance amount;
- `remittedAt`;
- rider pending cash liability.

Existing frontend/mock contract fields for those concepts are stale for production and should be deprecated or classified as future COD Authority fields.

Successful delivery of a COD order may therefore legitimately result in:

- fulfilment: `delivered`;
- delivery: `delivered`;
- payment: still `unpaid`/the existing non-settled projection;
- future COD cash ledger: not yet recorded.

That separation is intentional.

## 16. Idempotency

Every public mutation requires `Idempotency-Key` and uses the existing `Idempotency` table with actor, operation, key, request hash, and replayed outcome.

Operations include at minimum:

- `dispatch.assign`
- `dispatch.unassign`
- `dispatch.reassign`
- `dispatch.reschedule`
- `dispatch.return_to_store`
- `dispatch.receive_returned_goods`
- `dispatch.manual_provider_transition`
- `rider.set_availability`
- `rider.accept`
- `rider.pickup`
- `rider.out_for_delivery`
- `rider.deliver`
- `rider.fail`
- `rider.note`

Same actor + operation + key + identical body replays the original result.

Same actor + operation + key + changed body returns `IDEMPOTENCY_CONFLICT`.

Idempotency, business mutation, audit event, and outbox event must commit in the same database transaction.

## 17. Concurrency and locking

### Required guarantees

The implementation must prove:

- two staff cannot assign the same unassigned order to two riders;
- two staff cannot assign the same rider to conflicting active jobs;
- accept/pickup/out/deliver retries do not duplicate state/events/proof;
- concurrent deliver/fail yields one valid winner and one deterministic conflict/replay;
- concurrent admin return/reassign cannot transfer ownership while custody is with the old rider;
- a rider cannot act after being safely unassigned before pickup;
- return-to-store never mutates inventory even during retries;
- audit/outbox failure rolls back the corresponding business mutation;
- Dispatch never updates `Order.stockConsumedAt`;
- Dispatch never creates `StockDepletion` or changes `Reservation`/`StockLot` rows.

### Database constraint

Migration should create a PostgreSQL partial unique index preventing more than one conflicting active rider-owned job for the same `rider_profile_id` across active statuses. The exact active-status set must be pinned in the implementation plan and mirrored by service policy tests.

Service-level row locks remain required; the database constraint is the final race safety net.

## 18. Order and event updates

Delivery mutations update the existing Order only for authoritative delivery projections:

- assignment -> `deliveryStatus = assigned`;
- rider accept -> `accepted`;
- pickup -> `picked_up`;
- out -> `out_for_delivery`;
- delivered -> `deliveryStatus = delivered`, `fulfilmentStatus = delivered`;
- failed -> `deliveryStatus = failed`;
- rescheduled -> `deliveryStatus = rescheduled`;
- return-to-store -> `deliveryStatus = return_to_store`.

No Dispatch transaction may clear or rewrite `stockConsumedAt`.

Each meaningful transition writes:

- `DeliveryEvent`;
- `OrderEvent` where customer/order timeline relevance exists;
- `AuditEvent`;
- `OutboxEvent`.

Customer-safe order timeline text must not expose internal operational/security details.

## 19. API design

Exact route count must be pinned against the current 35-path production OpenAPI during implementation planning.

### Admin dispatch

- `GET /api/v1/admin/dispatch`
- `GET /api/v1/admin/dispatch/jobs/:jobId`
- `POST /api/v1/admin/dispatch/orders/:orderId/assign`
- `POST /api/v1/admin/dispatch/jobs/:jobId/unassign`
- `POST /api/v1/admin/dispatch/jobs/:jobId/reassign`
- `POST /api/v1/admin/dispatch/jobs/:jobId/reschedule`
- `POST /api/v1/admin/dispatch/jobs/:jobId/return-to-store`
- `POST /api/v1/admin/dispatch/jobs/:jobId/returned-to-store`
- `POST /api/v1/admin/dispatch/jobs/:jobId/provider-transition`

### Admin rider fleet

- `GET /api/v1/admin/riders`
- `GET /api/v1/admin/riders/:riderProfileId`
- `PUT /api/v1/admin/riders/:riderProfileId/availability`

### Rider self-service

- `GET /api/v1/rider/me`
- `PUT /api/v1/rider/me/availability`
- `GET /api/v1/rider/jobs`
- `GET /api/v1/rider/jobs/:jobId`
- `GET /api/v1/rider/history`
- `POST /api/v1/rider/jobs/:jobId/accept`
- `POST /api/v1/rider/jobs/:jobId/pickup`
- `POST /api/v1/rider/jobs/:jobId/out-for-delivery`
- `POST /api/v1/rider/jobs/:jobId/deliver`
- `POST /api/v1/rider/jobs/:jobId/fail`
- `POST /api/v1/rider/jobs/:jobId/notes`

Every mutation above requires `Idempotency-Key`.

## 20. Backend-derived projections

### Dispatch queue row

Must include only useful operational data such as:

- orderId/reference;
- jobId if one exists;
- customer display/contact fields permitted for staff;
- zone/slot;
- handedOverAt;
- paymentMethod/paymentStatus;
- read-only COD due amount if applicable;
- delivery status;
- assignment target;
- effective rider state;
- failure/reschedule summary;
- allowedActions;
- blockers.

The UI must not infer that a rider can be assigned merely because a local status string says `unassigned`.

### Rider job projection

Must include:

- only the authenticated rider's job;
- order reference;
- current delivery status;
- customer/contact/address fields required for delivery;
- items summary;
- delivery instructions if stored authoritatively;
- COD due context without collection/remittance claims;
- allowedProofMethods;
- allowedActions;
- blockers;
- delivery events safe for the rider;
- failure/reschedule state.

### Rider fleet projection

Returns declared/effective availability separately so `busy` is never confused with manually offline.

## 21. Notes

Rider notes are append-only delivery events with a safe bounded length.

A note:

- does not change delivery status;
- does not alter inventory/payment;
- is idempotent;
- is visible to authorized dispatch staff and the owning rider;
- is not automatically customer-visible.

Offline persistence on a device remains a frontend concern; the server only acknowledges notes that actually reached the API.

## 22. Location and navigation

Live location is deliberately out of scope.

The API must not fabricate:

- latitude/longitude;
- last-seen GPS;
- movement;
- ETA;
- route progress.

Existing GhanaPostGPS/address text may be returned from the order address as stored data. That is not a claim that the backend geocoded it.

## 23. Provider adapter boundary

Define a narrow internal provider-neutral interface for future work, but ship only a no-network/manual implementation in this milestone.

Conceptual future interface:

```ts
interface DeliveryProviderAdapter {
  key: string;
  capabilities: readonly string[];
  quote?(...): Promise<...>;
  book?(...): Promise<...>;
  cancel?(...): Promise<...>;
  status?(...): Promise<...>;
}
```

No production code may claim a capability as live unless it is actually configured and implemented.

The manual path records operator-entered provider references and staff-observed transitions without network calls.

## 24. Errors

Reuse the platform error envelope and existing codes where applicable:

- `VALIDATION_FAILED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `RULE_VIOLATION`
- `IDEMPOTENCY_CONFLICT`

Dispatch-specific blockers should use machine-readable blocker values inside projections rather than proliferating HTTP error codes for normal workflow ineligibility.

Examples:

- `order_not_handed_over`
- `order_cancelled`
- `rider_offline`
- `rider_busy`
- `job_already_assigned`
- `custody_not_safe_for_reassignment`
- `proof_required`
- `proof_method_unavailable`
- `failure_reason_required`
- `return_not_physically_received`

## 25. Migration 007

Proposed migration name:

`202610130007_dispatch_rider_authority`

It follows migrations 001-006.

Migration responsibilities:

- create `RiderProfile`;
- create `DeliveryJob`;
- create `DeliveryEvent`;
- create `DeliveryProof`;
- add FKs/check constraints/indexes;
- unique one job per order;
- unique one profile per rider user;
- partial unique active-job index per rider;
- constraints aligning assignment kind with rider/provider fields;
- status/custody checks;
- proof uniqueness;
- append-only/nondelete protection for `DeliveryEvent` and `DeliveryProof` consistent with existing immutable-ledger conventions where feasible;
- no destructive assumptions about existing orders;
- no retroactive inventory mutation.

Existing already-dispatched orders from earlier milestones are eligible to appear in the queue if their authoritative fulfilment handover provenance exists. A job is created lazily on assignment; migration does not invent historical rider/provider assignments.

## 26. Contract cleanup

Existing shared demo contracts contain stale production assumptions, especially:

- pickup as stock-depletion timing;
- `cashCollectedAt` inside DeliveryJob;
- `remittedAt` inside DeliveryJob;
- rider pending-remittance totals;
- `remit` as a dispatch action;
- browser-supplied `riderId` as if it were authority;
- delivery action directly carrying `cashCollected`.

This milestone must separate production contracts from future COD fields without breaking the mock/demo frontend unnecessarily.

Where backwards compatibility is needed, deprecate stale fields or keep them in demo-only adapter types rather than implementing false production semantics.

## 27. Security and privacy

Required controls:

- rider authentication from session, not request body identity;
- rider job ownership check on every rider job read/mutation;
- minimal customer/address exposure to assigned rider only;
- no broad customer search for rider role;
- no provider secrets in response payloads/logs;
- no proof secret/PIN raw values in audit/outbox;
- failure notes and staff notes length-bounded and treated as untrusted text;
- idempotency hashes computed from normalized validated input;
- request IDs propagated to audit/outbox/delivery events;
- manual provider actions explicitly attributed to staff, never spoofed as provider events.

## 28. Observability and operational truth

At minimum, application logs/metrics should make it possible to distinguish:

- assignment conflicts;
- rider busy/offline blockers;
- invalid lifecycle transition attempts;
- ownership violations;
- idempotency replays/conflicts;
- manual-provider events;
- failed deliveries;
- return-to-store instructions/completions;
- proof failures.

No log should expose sensitive proof values, secrets, or unnecessary customer PII.

## 29. Testing requirements

The implementation plan must include TDD coverage for at least the following:

1. handed-over delivery order appears as awaiting assignment;
2. packed but not handed-over order is not assignable;
3. order without `stockConsumedAt` is not assignable;
4. first assignment lazily creates exactly one job;
5. concurrent assignment of one order yields one winner;
6. unavailable/offline rider is rejected;
7. busy rider is rejected;
8. concurrent assignment of one rider to two jobs cannot succeed twice;
9. admin can unassign before pickup;
10. unsafe reassignment after rider custody is blocked;
11. rider can read own job;
12. rider cannot read another rider's job;
13. rider cannot mutate another rider's job;
14. browser-supplied foreign rider id cannot bypass ownership because rider routes do not trust it;
15. accept transition works;
16. pickup transition works and does not change stock/depletion/reservations;
17. out-for-delivery transition works;
18. delivery without proof is blocked;
19. unavailable proof method is blocked;
20. delivered writes proof exactly once;
21. delivered updates delivery + fulfilment statuses but not COD payment success;
22. COD delivered may remain financially unsettled;
23. fail requires bounded reason/note policy;
24. failed delivery does not cancel order;
25. failed delivery does not restore stock;
26. reschedule is auditable and preserves safe custody/assignment semantics;
27. return-to-store instruction does not restock;
28. physical returned-to-store acknowledgement still does not restock;
29. returned-to-store projection says awaiting Returns inspection;
30. manual provider assignment performs no network call;
31. manual provider milestones are attributed to staff/manual source;
32. idempotent retry does not duplicate job/event/proof;
33. changed body with same idempotency key conflicts;
34. concurrent deliver/fail has one coherent winner;
35. audit/outbox failure rolls back business mutation;
36. Dispatch never changes `stockConsumedAt`;
37. Dispatch never creates StockDepletion rows;
38. Dispatch never changes Reservation/StockLot quantities/states;
39. admin queue derives allowedActions/blockers server-side;
40. rider projection derives allowedActions/blockers server-side;
41. rider effective busy state is derived from active job;
42. OpenAPI is updated with zero contract drift;
43. current root/acceptance/API suites remain green.

## 30. Review focus

Implementation review must pay special attention to:

- accidental reintroduction of pickup-time stock depletion from mock code;
- COD delivery accidentally changing payment state;
- rider identity accepted from request body rather than session;
- missing row locks/partial unique active-rider constraint;
- reassignment while goods are still in prior rider custody;
- return-to-store silently restocking goods;
- fake provider/webhook/ETA/location behavior;
- proof data stored insecurely;
- UI-derived rather than backend-derived action eligibility;
- circular dependency from Dispatch back into Fulfilment/Inventory;
- non-atomic audit/outbox writes;
- stale OpenAPI/shared contracts.

## 31. Rollout and compatibility

- Existing Fulfilment + Stock Handover behavior remains unchanged.
- Existing delivered/returned mock flows are not data-migrated into production rows.
- Production endpoints are additive.
- Frontend adapters may continue mock mode while adding the production HTTP mappings.
- Any stale frontend fields around COD/remittance are documented and deprecated rather than silently implemented in this authority.
- No live external provider is enabled during rollout.

## 32. Acceptance criteria

This milestone is ready for merge only when fresh verification demonstrates all of the following:

- migration 007 applies cleanly after 001-006;
- one job per order is enforced;
- one conflicting active job per rider is enforced at both service and DB levels;
- only authoritative handed-over delivery orders can be assigned;
- rider ownership and privacy are enforced by backend session identity;
- rider pickup performs zero inventory mutation;
- delivery completion requires valid proof;
- COD delivery and COD payment remain separate;
- failed/rescheduled/returned flows are durable and auditable;
- returned goods never become sellable without future Returns Authority;
- manual-provider fallback is honest and network-free;
- every mutation is idempotent;
- audit/outbox participates atomically;
- OpenAPI/shared contracts match the implementation;
- focused, acceptance, API, typecheck/lint/build, and repository-required CI all pass on the exact PR head.

## 33. Next backend milestone

After this authority is merged, the recommended next backend milestone is:

**COD Collection + Rider Remittance Authority**

That milestone will build the separate cash liability/remittance/reconciliation truth required so a delivered COD order can later become financially settled without coupling cash accounting to proof of delivery.
