# Variety Groceries — Configurable Logistics Routing, Order Tracking & Notification Authority

**Date:** 2026-10-17  
**Status:** written specification self-reviewed and ready for user review  
**Design branch:** `design/configurable-logistics-tracking-notifications-20261017`  
**Base:** `main` at `b82dc55d4c17ad11268b65c8c1001b317924abe8`  
**Supersedes:** the historical fixed Wave A tracking design/plan in the 2026-10-13 production tracking expansion. Product Media and external-provider work outside tracking are not superseded.

## 1. Purpose

Variety Groceries must support businesses whose delivery network is more complex than `warehouse -> rider -> customer`. An order may leave a head office, pass through regional, district and zonal facilities, reach a pickup centre, and only then be collected by the customer or picked up by a final-mile rider.

This authority makes that journey configurable without allowing configurable labels to become financial, inventory or custody truth. The business owner may configure the customer-facing workflow, facility network, route rules, stage labels, SLA targets and notification policies; protected backend authorities continue to decide when stock is depleted, cash is settled, custody changes, proof is accepted, or an order is delivered.

The same architecture must work for a simple business with one warehouse and one rider as well as a nationwide network with many transfer points.

## 2. User intent and success criteria

The required customer experience is a truthful journey such as:

`Order confirmed -> Picking at Accra Head Office -> Packed -> Departed Head Office -> Arrived Ashanti Regional Hub -> Departed Regional Hub -> Arrived Kumasi District Hub -> Arrived Ahinsan Pickup Centre -> Rider assigned -> Rider picked up -> Out for delivery -> Delivered`.

That exact hierarchy is only an example. The system must not hard-code `regional`, `district`, `zonal`, `outlet`, or a fixed number of steps.

Success means:

1. the owner can configure logistics nodes and delivery workflows without code changes;
2. each order receives an immutable route/workflow snapshot so later configuration edits do not rewrite history;
3. customer tracking shows actual persisted movement, not inferred or fabricated movement;
4. final pickup may be customer collection or doorstep delivery;
5. Email, SMS, WhatsApp and in-app notifications can be attached to customer-visible workflow events;
6. notification failures never roll back a valid logistics transaction;
7. delivery exceptions, reroutes and delays are first-class states;
8. the architecture remains compatible with Fulfilment, Dispatch/Rider, COD, future courier providers and future mobile apps;
9. current one-shipment-per-order behavior is supported while persistence is shaped for later split shipments.

## 3. Architecture decision

### 3.1 Chosen approach

Use a **configurable logistics network + versioned workflow templates + per-order route snapshots + append-only shipment events + event-driven notification delivery**.

This separates five concerns:

- network configuration answers *where can parcels move?*;
- workflow configuration answers *which canonical events matter and how should customers see them?*;
- route planning answers *which nodes will this order traverse?*;
- shipment execution answers *what actually happened?*;
- notification authority answers *which approved message should be attempted on which channel?*.

### 3.2 Rejected: hard-coded Ghana hierarchy

A fixed `head_office -> regional -> district -> zonal -> pickup_point` state machine is rejected because many businesses do not have those levels, some have additional cross-docks, and a business may reorganize later.

### 3.3 Rejected: arbitrary owner-defined statuses as authority

A free-form status builder is rejected as the source of operational truth. An owner must not be able to create a label called `Paid`, `Delivered`, `Stock returned`, or `Cash remitted` and thereby mutate protected state.

Custom names are presentation/configuration. Canonical event kinds and authority transitions remain server-controlled.

### 3.4 Rejected: notification logic inside domain transactions

Sending Email, SMS or WhatsApp synchronously from fulfilment/dispatch commands is rejected. Provider latency or outage must not roll back physical movement that already occurred.

## 4. Non-negotiable authority invariants

- Inventory is depleted exactly once at the authoritative Fulfilment handover from sellable inventory.
- Moving an already-allocated customer parcel through transit hubs does not put it back into sellable inventory.
- A logistics arrival/departure event cannot mark electronic payment succeeded.
- Delivery completion cannot settle COD unless COD Collection Authority separately records valid customer cash collection.
- COD customer cash collection and rider remittance remain separate financial events.
- Final-mile rider actions remain session-owned Dispatch/Rider operations.
- Customer-visible custom stage labels do not mutate `Order.paymentStatus`, stock, refunds, COD ledgers or proof-of-delivery records.
- A notification provider response never establishes shipment truth.
- AI may recommend routes or predict risk but may never manufacture `departed`, `arrived`, `picked_up` or `delivered` events.
- Historical shipment events are append-only. Corrections use explicit exception/correction/reroute events.

## 5. Authority boundaries

### 5.1 Orders owns

- customer/order identity;
- delivery vs collection intent;
- order total/payment projection;
- cancellation state;
- delivery zone/address snapshot.

### 5.2 Fulfilment owns

- confirmation;
- picking and packing;
- source inventory location;
- exactly-once stock depletion;
- first handover of the packed customer parcel out of sellable stock.

### 5.3 Logistics Authority owns

- logistics nodes and lanes;
- versioned workflow configuration;
- route rules and route snapshots;
- shipment/leg execution after fulfilment handover;
- inter-node custody and movement evidence;
- reroutes and logistics exceptions;
- logistics portion of customer tracking.

### 5.4 Dispatch/Rider owns

- final-mile rider profile/assignment;
- rider accept/pickup/out-for-delivery/fail/deliver lifecycle;
- final-mile proof metadata;
- final-mile custody transitions.

The Logistics Authority references those events in tracking and must synchronize the final-mile handoff boundary, but it does not duplicate rider identity or proof authority.

### 5.5 Notification Authority owns

- event-to-notification rules;
- channel/template versions;
- consent/preference checks;
- durable message queue and attempt history;
- in-app inbox state;
- provider delivery receipts and retries.

### 5.6 COD / Payments / Returns own their existing boundaries

Logistics tracking may display safe payment or return summaries, but it never performs provider settlement, COD remittance, refund execution, return inspection or stock restock.

## 6. Logistics network model

### 6.1 `LogisticsNode`

A node is a physical business-controlled or partner-controlled point through which a customer parcel may pass.

Proposed fields:

- `id UUID`;
- `code TEXT UNIQUE`;
- `name TEXT` — internal name;
- `publicName TEXT` — customer-safe display name;
- `kind TEXT` in `head_office | warehouse | fulfilment_center | hub | outlet | pickup_point | cross_dock | partner_facility | other`;
- optional `kindLabel TEXT` so the business may call a generic hub `Regional Office`, `District Office`, `Zonal Depot`, etc.;
- optional `parentNodeId` for organizational grouping, not route enforcement;
- optional `inventoryLocationId` referencing the existing Inventory `Location` when the node also holds stock;
- structured address/locality/region metadata;
- optional GhanaPost GPS/public directions text;
- `customerVisible BOOLEAN`;
- `active BOOLEAN`;
- `createdAt`, `updatedAt`.

`kindLabel` is presentation only. Routing does not assume a hierarchy from the label.

A node can exist without an Inventory `Location`. This is required for transfer hubs that only handle already-allocated customer parcels.

### 6.2 `LogisticsLane`

A lane describes a valid movement between two nodes.

Fields:

- `id`;
- `originNodeId`;
- `destinationNodeId`;
- `mode` in `internal_transfer | linehaul | third_party | customer_pickup | last_mile`;
- optional `providerKey` for future configured provider authority;
- `typicalMinutes`;
- optional service days/cutoff metadata;
- `priority`;
- `active`;
- `createdAt`, `updatedAt`.

Constraints:

- origin and destination differ;
- only active nodes may receive a new active lane;
- duplicate active lane/mode/provider combinations are refused;
- lane configuration never means a shipment traversed that lane.

## 7. Versioned delivery workflow configuration

### 7.1 `DeliveryWorkflowTemplate`

The owner creates reusable workflows such as:

- `Accra same-day doorstep`;
- `Nationwide hub + doorstep`;
- `Nationwide customer pickup`;
- `Direct warehouse collection`.

The template itself is a stable identity with `name`, `description`, `active`, and a pointer to the current published version.

### 7.2 `DeliveryWorkflowVersion`

Published versions are immutable. Editing a published workflow creates a draft new version and publication switches only future shipments to it.

Fields include:

- `id`;
- `templateId`;
- `versionNumber`;
- `status` in `draft | published | retired`;
- optional default SLA policy;
- `createdBy`, `createdAt`, `publishedBy`, `publishedAt`.

No order/shipment may point at a mutable draft once execution starts.

### 7.3 `WorkflowStageDefinition`

A stage definition controls how a canonical event appears to staff/customers.

Fields include:

- stable stage key within the workflow version;
- canonical `eventKind`;
- `customerTitleTemplate`;
- optional `customerDetailTemplate`;
- admin label/help text;
- `customerVisible`;
- `showPlannedWhenPending`;
- optional SLA minutes;
- sort/display grouping;
- exception severity behavior;
- whether notifications may be configured for this stage.

Canonical event kinds include:

- `order_placed`;
- `order_confirmed`;
- `picking_started`;
- `packed`;
- `fulfilment_handed_over`;
- `shipment_departed`;
- `shipment_arrived`;
- `shipment_handover`;
- `shipment_rerouted`;
- `shipment_delayed`;
- `ready_for_pickup`;
- `customer_collected`;
- `rider_assigned`;
- `rider_accepted`;
- `rider_picked_up`;
- `out_for_delivery`;
- `delivery_failed`;
- `delivery_rescheduled`;
- `delivered`;
- `returned_toward_store`;
- `custom_checkpoint`.

`custom_checkpoint` is an informational logistics event only. It cannot satisfy protected prerequisites for payment, stock, COD, proof or delivery.

### 7.4 Safe customization rule

Owners may change labels such as `Arrived at your district office` or `Reached the community pickup centre`, but every stage is still mapped to one canonical server event kind.

The API refuses reserved/misleading customer labels where necessary for safety, particularly labels that claim financial settlement or successful delivery for a non-financial/non-delivery event.

## 8. Route rules and route snapshots

### 8.1 Route selection

`DeliveryRouteRule` chooses a workflow and concrete node path for future orders based on server-known facts such as:

- origin fulfilment location/node;
- delivery zone;
- region/locality;
- fulfilment mode (`delivery | collection`);
- final pickup node when explicitly selected;
- service level;
- rule priority/effective dates.

A route rule never trusts browser-supplied route authority. Checkout may present choices, but the server resolves them against active configuration. For a new delivery order, the selected workflow version and route snapshot are created atomically with order completion from server-known origin, zone/address and fulfilment facts. This freezes the customer journey before later configuration changes can affect it.

If zero valid rules match, delivery checkout is refused with an explicit service/configuration error. If multiple equally authoritative rules match, checkout fails closed instead of choosing unpredictably. An administrator must fix route-rule priority/configuration and the customer may retry; the browser cannot choose an arbitrary hidden rule.

### 8.2 One shipment now, split-shipment-ready persistence

Introduce `Shipment` with:

- `id UUID`;
- `orderId`;
- `sequence INT`;
- `workflowVersionId`;
- `status`;
- `originNodeId`;
- final destination type/node/address snapshot;
- `currentNodeId` when physically at a facility;
- `currentLegId` while in transit;
- current custody projection;
- timestamps/version fields.

Use `UNIQUE(orderId, sequence)` rather than `UNIQUE(orderId)` so later split shipments can add sequence 2+ without replacing the model. This milestone creates exactly sequence `1` for a delivery order and refuses a second shipment through service policy.

### 8.3 `ShipmentStop`

Each order receives a normalized route snapshot:

- `shipmentId`;
- `position`;
- `nodeId`;
- snapshot `nodeCode`, `nodePublicName`, `nodeKind`, `kindLabel`;
- planned arrival/departure/SLA timestamps where available;
- terminal role (`transit | customer_pickup | final_mile_dispatch`).

The snapshot protects history from later node renames/deactivation. Live node identity remains referenceable for admin context.

### 8.4 `ShipmentLeg`

Each adjacent stop pair becomes a leg containing:

- `position`;
- origin/destination stop IDs;
- selected lane snapshot;
- mode/provider snapshot;
- status in `planned | ready | in_transit | arrived | exception | superseded`;
- actual depart/arrive timestamps;
- current SLA deadline;
- version.

A reroute never deletes completed legs. It supersedes only unstarted future legs and appends a new route revision for the remainder.

## 9. Shipment lifecycle and execution

### 9.1 Pre-handover

Before Fulfilment handover, customer tracking can show order/fulfilment stages (`order_placed`, `confirmed`, `picking_started`, `packed`) using persisted Orders/Fulfilment evidence and the selected workflow version.

The shipment route is normally planned and snapshotted at delivery-order completion, but it is not physically active before handover and no departure/arrival event is fabricated. Legacy/admin-created orders without a snapshot must receive one through an explicit validated route-planning command before handover.

### 9.2 Activation at Fulfilment handover

The existing irreversible Fulfilment handover remains the stock-depletion boundary. Fulfilment calls Logistics activation inside the **same PostgreSQL transaction**. If shipment activation/revalidation fails, the handover transaction rolls back rather than leaving stock depleted without a logistics root. In that transaction:

1. Inventory consumes the order reservation exactly once;
2. Fulfilment records handover;
3. the shipment becomes active at its source node;
4. logistics custody begins for the already-allocated customer parcel;
5. outbox events are emitted for tracking/notification processing.

If no intermediate node exists and the source is also the final-mile dispatch node, the shipment becomes immediately eligible for final-mile assignment under the configured workflow.

### 9.3 Depart a leg

A departure command requires:

- active shipment;
- caller authorized for the current node/operation;
- shipment physically at the leg origin;
- leg is the next unsuperseded route leg;
- no conflicting active leg;
- required handover/custody evidence supplied;
- idempotency key.

It atomically appends `shipment_departed`, marks the leg `in_transit`, clears `currentNodeId`, sets `currentLegId`, updates custody, audits, and writes outbox evidence.

### 9.4 Arrive at a node

Arrival requires the matching active leg and destination. It appends `shipment_arrived`, marks the leg `arrived`, clears `currentLegId`, sets `currentNodeId`, updates custody, and advances the next leg to `ready` where allowed.

Arrival at an Inventory-backed node does **not** create sellable stock for the customer parcel.

### 9.5 Final pickup centre behavior

At a terminal pickup point, the workflow may resolve into either:

- **customer pickup:** record `ready_for_pickup`, then authenticated/verified staff records `customer_collected` under the collection authority rules; or
- **doorstep delivery:** mark the shipment final-mile-ready and expose it to Dispatch for rider/provider assignment.

The same physical node may support both routes through different workflow versions/rules. A remote pickup-point order is still `fulfilment=delivery` while Variety transports it through the network; the existing `fulfilment=collection` mode remains direct customer collection from the source fulfilment location and does not silently become a multi-hop shipment.

### 9.6 Final-mile Dispatch integration

The current Dispatch queue is based on Fulfilment handover. This architecture changes the eligibility predicate for routed shipments:

- direct workflows remain eligible immediately after source handover;
- multi-hop workflows become eligible only when the shipment reaches the configured `final_mile_dispatch` stop and is not already assigned/completed/exception-blocked.

`DeliveryJob` remains the final-mile job. It does not represent linehaul legs between business nodes.

Rider `pickup` atomically records the Dispatch/Rider custody change and emits the corresponding logistics/tracking event. Rider `out_for_delivery`, `fail`, `reschedule` and `deliver` continue to be owned by Dispatch/Rider and are projected into the unified customer journey.

## 10. Shipment event ledger and custody

### 10.1 `ShipmentEvent`

Every movement/correction is append-only:

- `id`;
- `shipmentId`;
- optional `legId`/`nodeId`;
- canonical `eventKind`;
- `actorKind` and internal actor ID;
- prior/new custody projection where relevant;
- customer-safe title/detail snapshot when visible;
- safe metadata;
- request ID;
- occurred/created timestamps.

Internal notes and unsafe metadata are never copied into the customer projection.

### 10.2 Custody projection

Shipment custody is a server-derived projection such as:

- `source_staff`;
- `node_staff`;
- `linehaul_internal`;
- `provider`;
- `rider`;
- `customer`;
- `return_transit`.

Custom workflow labels cannot set custody directly.

### 10.3 Reroute and correction

A reroute requires administrator authority, reason, row locks and an idempotency key. Completed route history is retained. The event ledger records old and new remaining-route revisions.

A mistaken informational checkpoint is corrected with a linked correction event; movement facts are not destructively edited.

## 11. Unified customer tracking projection

Create one `OrderTrackingQueryService` as the server authority for public guest, authenticated customer and admin operational tracking.

The projection contains:

- order reference and fulfilment mode;
- separate `shipmentStatus` for inter-node movement so `Order.deliveryStatus` may truthfully remain `unassigned` during linehaul before final-mile assignment;
- payment, fulfilment and delivery statuses as separate dimensions;
- shipment summary and route revision;
- ordered customer-safe milestones;
- current public location/state;
- planned next visible milestone when safe;
- route stops with `complete | current | pending | exception | superseded` state;
- SLA/estimated window only from configured/server evidence;
- final-mile assignment summary when customer-safe;
- pickup instructions when applicable;
- delay/reroute/failure/reschedule messaging;
- last meaningful update timestamp;
- server-derived allowed customer actions.

Milestones are derived from persisted Order/Fulfilment/Shipment/Dispatch evidence. A later status label cannot backfill missing arrival/departure facts.

Public/account tracking never exposes internal staff IDs, private rider phone numbers, raw GPS traces, stock-lot data, provider secrets, internal notes or private routing metadata.

## 12. Notification authority

### 12.1 Event-driven delivery

Every customer-notifiable domain transition writes a durable Outbox event in the same database transaction as the authoritative change. A notification worker consumes those events after commit.

The worker:

1. resolves the shipment/workflow version active for that order;
2. finds matching notification rules;
3. evaluates audience, channel, consent and suppression policy;
4. renders only allow-listed template variables;
5. persists an immutable message snapshot;
6. queues channel-specific delivery attempts;
7. records provider acknowledgements, delivery receipts, failures and retry decisions.

No provider call occurs inside the logistics/fulfilment/dispatch transaction.

### 12.2 `NotificationRule`

Rules are versioned configuration tied to a workflow version or a global order event.

Fields include:

- `eventKind`;
- audience (`customer` in this milestone; staff escalation may be a separate rule class);
- enabled channels (`in_app`, `email`, `sms`, `whatsapp`);
- template version per channel;
- optional delay/debounce window;
- priority/criticality;
- whether customer preference may suppress the channel;
- whether the rule is enabled.

The same event/channel combination is deduplicated by durable keys so retries or webhook redelivery never create duplicate customer messages.

### 12.3 `NotificationTemplate` and versions

A stable template identity owns immutable published versions.

Channel-specific requirements:

- **Email:** subject + sanitized HTML/text body;
- **SMS:** bounded text with length preview;
- **WhatsApp:** approved provider template key/version and parameter mapping where the provider requires pre-approved templates;
- **In-app:** title, short body, severity and deep-link target.

Allowed variables include safe values such as:

- order reference;
- public node name;
- next public destination;
- pickup point/public directions;
- rider-safe display name;
- expected delivery/pickup window;
- secure tracking deep link;
- business support contact.

Templates cannot access internal actor IDs, staff notes, payment provider references, stock lots, credentials or raw provider data.

### 12.4 `NotificationMessage`

One rendered customer message snapshot:

- `id`;
- `orderId`;
- optional `shipmentId`, `shipmentEventId`;
- `eventKind`;
- `channel`;
- destination snapshot in protected form;
- template/version identity;
- rendered subject/title/body snapshot;
- `state` in `queued | sending | sent | delivered | failed | suppressed`;
- suppression/failure code;
- created/sent/delivered timestamps;
- durable dedupe key.

Rendered content is retained for audit; secrets are not.

### 12.5 `NotificationAttempt`

Every provider attempt is append-only and records:

- message ID;
- adapter/provider key;
- attempt number;
- provider-safe message reference;
- outcome category;
- retryability;
- safe error code/message;
- attempted/acknowledged timestamps.

Raw credentials/signature material is never stored.

### 12.6 In-app notification inbox

Authenticated customers receive durable in-app notifications with unread/read state. The inbox supports:

- pagination;
- unread count;
- mark-one/mark-all-read;
- safe deep links to order tracking;
- retention policy without losing the underlying order/shipment audit trail.

Guests do not receive an authenticated in-app inbox unless they later claim/link the order to an account; Email/SMS/WhatsApp can still operate under checkout consent and verified destinations.

## 13. Channel adapters and provider truth

Introduce a `NotificationChannelAdapter` interface with capability discovery and provider-specific implementations.

Production configuration must explicitly report each channel as `configured`, `disabled` or `unavailable`. The UI must not imply that WhatsApp, SMS or Email is live when credentials/provider capability are absent.

Likely adapters may include an SMTP/email service, Hubtel or another SMS provider, and Meta WhatsApp Cloud API or an approved BSP. The design does not choose or claim a production provider until credentials/commercial/API capability are verified.

Provider delivery receipt webhooks are authenticated, idempotent and mapped only to `NotificationMessage/Attempt` state. They do not mutate order/shipment truth.

## 14. Customer consent and preferences

Transactional order messages and marketing are separate concerns. This authority covers transactional order/logistics notifications only.

Persist customer notification preferences with channel-level settings and timestamps. Checkout captures guest/customer channel consent where required. Provider/legal requirements override owner configuration.

Rules:

- in-app transactional notifications are available to authenticated customers;
- Email/SMS/WhatsApp delivery respects verified contact destination and applicable consent/policy;
- an owner cannot force a prohibited channel by configuration;
- opt-out/preferences never suppress legally/operationally mandatory messaging where policy requires delivery, but the system must classify such messages explicitly;
- marketing consent is not inferred from order-notification consent.

## 15. SLA, delay and escalation engine

Workflow stages/lanes may define target minutes and service windows. The system computes deadlines from persisted arrival/departure facts and configured business calendars.

A scheduled worker may emit `shipment_delayed` only when a persisted deadline is exceeded. It must not fabricate a new location.

Customer-safe delay messages can say, for example, `Your order is taking longer than expected at Kumasi Regional Hub`, while staff views may include richer operational context.

Operational dashboards should expose:

- shipments approaching SLA breach;
- breached legs/stages;
- average dwell time per node;
- average transit time per lane;
- reroute count;
- failed final-mile attempts;
- notification delivery/failure rates by channel.

## 16. AI assistance boundary

AI may:

- recommend workflow templates from observed delivery patterns;
- recommend route rules or lane priorities;
- predict ETA ranges from historical lane/node performance;
- detect recurring bottlenecks;
- suggest notification wording for staff review;
- summarize exception patterns.

AI may not:

- auto-publish a workflow or notification template without authorized review;
- mark a shipment arrived/departed/picked-up/delivered;
- change custody;
- settle payment/COD;
- override a failed-safe route validation;
- expose private customer/rider data in prompts beyond the approved data minimization policy.

Predicted ETA is always labeled as an estimate and is suppressed when data quality is insufficient.

## 17. Admin experience

Add a `Logistics & Delivery` administration area with these major screens:

### 17.1 Locations & hubs

- list/search/filter logistics nodes;
- create/edit/archive nodes;
- choose node kind and customer-facing label;
- optionally link to an Inventory location;
- manage public directions/contact text;
- visualize parent/group relationships;
- warn before deactivating a node referenced by active routes.

### 17.2 Network lanes

- create origin -> destination lanes;
- select transport mode and, when available, a configured provider identity;
- configure typical time/service windows;
- activate/deactivate with dependency checks;
- surface route gaps/cycles that make published workflows invalid.

### 17.3 Workflow templates

A guided workflow builder lets the owner:

- choose canonical stage types;
- customize customer labels/details;
- choose which pending stages customers can see;
- define SLA targets;
- attach notification rules;
- preview customer tracking before publication;
- publish an immutable workflow version;
- clone a published version for future edits.

The builder must clearly distinguish `Display label` from `System event` so configuration cannot be mistaken for backend authority.

### 17.4 Route rules

- choose origin and destination coverage;
- assign workflow version;
- define node sequence or route-selection strategy;
- assign priority/effective dates;
- run a route simulation against sample zones/addresses;
- block publication on ambiguous/no-path scenarios.

### 17.5 Notification settings

- channel capability/status;
- per-event rules;
- template editor/preview;
- WhatsApp approval/configuration status where applicable;
- test-send to an authorized staff destination only;
- delivery/failure dashboard;
- suppression/consent diagnostics.

## 18. Customer tracking experience

The tracking page becomes a route-aware experience rather than a flat event list.

It should show:

- three separate top-level badges for payment, fulfilment and delivery;
- a clear current journey state;
- completed/current/pending route stages;
- public node names and safe timestamps;
- `Departed` and `Arrived` events when actually persisted;
- pickup-centre details when relevant;
- final-mile rider assignment/pickup/out-for-delivery when relevant;
- exceptions/reroutes/delays without internal operational detail;
- last updated time;
- notification preference/inbox links for signed-in customers.

A route may collapse repetitive history visually on small screens, but no completed stage may disappear from the accessible history.

The customer must never see a planned future node as though arrival already occurred.

## 19. Production API surface

The implementation plan will pin exact OpenAPI path counts against the then-current `main`, but the intended route families are:

### 19.1 Customer/public tracking

- `POST /api/v1/orders/track` — public reference + verification code, returning the unified tracking projection;
- `GET /api/v1/account/orders/{orderId}/tracking` — authenticated owner-only tracking;
- `GET /api/v1/account/notifications` — authenticated inbox;
- `POST /api/v1/account/notifications/{notificationId}/read`;
- `POST /api/v1/account/notifications/read-all`;
- `GET/PUT /api/v1/account/notification-preferences`.

### 19.2 Admin logistics configuration

- `/api/v1/admin/logistics/nodes`;
- `/api/v1/admin/logistics/lanes`;
- `/api/v1/admin/logistics/workflows` and workflow versions;
- `/api/v1/admin/logistics/route-rules`;
- `/api/v1/admin/logistics/route-rules/simulate`;
- `/api/v1/admin/logistics/shipments` and shipment detail;
- shipment movement commands for depart/arrive/reroute/custom-checkpoint;
- `/api/v1/admin/notifications/configuration`;
- template/rule/version routes;
- notification delivery ledger/read-only diagnostics.

Mutations require durable idempotency keys where replay could duplicate operational or messaging effects, plus the existing trusted-Origin/CSRF policy for cookie-authenticated admin sessions.

### 19.3 Tracking/admin projections

`GET /api/v1/admin/orders/{orderId}/tracking` returns the operational tracking projection with additional safe internal references such as shipment ID, current leg and dispatch job deep links. It still excludes provider credentials and raw webhook payloads.

## 20. Persistence summary

The production migration introduces at minimum:

- `LogisticsNode`;
- `LogisticsLane`;
- `DeliveryWorkflowTemplate`;
- `DeliveryWorkflowVersion`;
- `WorkflowStageDefinition`;
- `DeliveryRouteRule`;
- `Shipment`;
- `ShipmentStop`;
- `ShipmentLeg`;
- `ShipmentEvent`;
- `NotificationRule`;
- `NotificationTemplate`;
- `NotificationTemplateVersion`;
- `CustomerNotificationPreference`;
- `NotificationMessage`;
- `NotificationAttempt`;
- in-app read-state data if not represented directly on `NotificationMessage`.

The implementation plan must prefer normalized relational constraints for route identity/state over opaque JSON. Small immutable snapshots may use JSON only for bounded safe metadata whose schema is still validated in application code.

## 21. Database integrity

Database-level constraints/triggers should enforce invariants that must survive service bypass, including:

- shipment sequence positive and unique per order;
- stop position unique per shipment/revision;
- leg origin/destination correspond to adjacent stops in the same shipment revision;
- a leg cannot have arrival before departure;
- completed/superseded route history cannot be destructively repointed;
- published workflow versions cannot be mutated in place;
- message dedupe keys unique;
- notification attempt number unique per message;
- immutable rendered notification/template snapshots after send;
- final delivered shipment projection cannot be established by a `custom_checkpoint`;
- final-mile rider-custody state must correspond to an authoritative DeliveryJob when rider custody is active.

State transitions still belong in services; database checks protect impossible combinations and direct-write bypasses.

## 22. Security and privacy

### 22.1 Authorization

Initial production authority follows existing roles:

- `admin`: logistics configuration, route rules, shipment admin operations, notification configuration/diagnostics;
- `inventory_manager`: may receive location-scoped operational visibility only when explicitly granted in a later implementation step; no implicit new financial/logistics mutation privilege;
- `rider`: final-mile owned-job actions only;
- `customer`: own tracking, inbox/preferences only.

If a dedicated logistics/dispatcher role is later required, introduce it through the Identity/RBAC authority rather than weakening admin checks ad hoc.

### 22.2 Public tracking

Public guest tracking keeps the existing reference + verification-code capability, generic denial behavior, durable throttle and failed-attempt audit. Route expansion must not introduce an order-existence oracle.

### 22.3 Data minimization

Customer tracking/notifications may expose only safe node names, safe service windows, permitted rider display name and public support/pickup information. Exact internal route planning, private phone numbers, raw coordinates, staff identities and internal exception notes remain private.

### 22.4 Template safety

Template variables use an explicit allow-list; free-form database/metadata paths are forbidden. Email HTML is sanitized. URL/deep-link values are generated by trusted server code, not arbitrary template input.

## 23. Idempotency, concurrency and ordering

- Every shipment movement/reroute command uses the existing `Idempotency` authority pattern.
- Movement commands lock shipment + current leg/route revision before validating transitions.
- Two concurrent arrivals/departures cannot both advance the same shipment.
- Dispatch final-mile assignment races with logistics arrival are resolved by locking/rechecking shipment eligibility.
- Outbox publication commits atomically with the domain event.
- Notification consumption is at-least-once; durable dedupe makes customer message creation effectively once per event/rule/channel.
- Provider receipt webhooks are independently idempotent.
- Event timestamps come from the server/database boundary; clients may submit bounded evidence timestamps only where explicitly supported and such timestamps never override commit ordering.

## 24. Compatibility with existing authorities

### 24.1 Current Dispatch/Rider behavior

The current `main` correctly starts Dispatch after Fulfilment handover. During this milestone, that predicate is generalized:

- direct-route orders behave exactly as today;
- routed orders wait for final-mile readiness at the configured dispatch node.

Existing rider lifecycle/proof/custody rules remain authoritative.

### 24.2 COD Collection + Rider Remittance

The committed COD design remains valid. Its collection eligibility continues to depend on successful final delivery. Logistics transit and hub arrivals never create customer cash liability or rider remittance liability.

COD UI may later use this tracking projection to explain where the order is, but financial state remains separate.

### 24.3 Physical Returns

Failed/returned deliveries may produce reverse-logistics tracking events, but saleable restock remains future Returns Authority. A parcel arriving back at a hub/store is not silently restocked.

### 24.4 External delivery providers

Future provider adapters map verified provider events into canonical shipment/final-mile events. A provider tracking link/ETA/location appears only when the configured adapter supplies verified customer-safe data.

## 25. Migration and backward compatibility

Existing orders must remain trackable.

Migration strategy:

1. create the new configuration/shipment/notification tables without rewriting existing Order/Fulfilment/Delivery facts;
2. seed one default logistics node from the current configured commerce/stock location;
3. create a default direct-delivery workflow that semantically matches current production behavior;
4. create a default direct route rule for existing delivery zones where safe;
5. do **not** invent historical shipment departures/arrivals for old orders;
6. tracking for historical orders continues to derive from existing Order/Fulfilment/Delivery evidence and labels missing route detail honestly;
7. only newly activated shipments use the new route execution ledger unless an administrator performs an explicit controlled migration/import with evidence.

No migration may claim that an older delivered order passed through nodes for which no persisted evidence exists.

## 26. TDD and verification strategy

Implementation must be test-driven and split into reviewable waves.

### 26.1 Configuration/network tests

- node/lane validation;
- published workflow immutability;
- custom labels cannot gain protected semantics;
- invalid/ambiguous route rules fail closed;
- route simulation deterministic;
- deactivation dependency checks;
- workflow version snapshot stability.

### 26.2 Shipment execution tests

- direct route preserves current Dispatch behavior;
- multi-hop route blocks final-mile assignment until correct node arrival;
- departure/arrival require exact current leg;
- duplicate/replayed commands return the same outcome;
- concurrent advancement allows only one winner;
- skipped stop rejected unless explicit reroute;
- reroute preserves completed history;
- transit-node arrival never changes sellable inventory;
- rider pickup/delivery synchronizes logistics projection without double custody transitions;
- custom checkpoint cannot establish delivery/payment/stock truth.

### 26.3 Tracking tests

- guest/customer/admin audiences;
- sparse legacy order;
- direct delivery;
- multi-hop regional/district/pickup route;
- customer pickup terminal route;
- rider final-mile route;
- delay/reroute/failure/reschedule;
- delivered COD remains independently unpaid until COD authority says otherwise;
- privacy injections prove internal data cannot leak;
- pending planned stage is never rendered complete without evidence.

### 26.4 Notification tests

- event-to-rule matching;
- exact per-event/channel dedupe;
- provider failure does not roll back shipment state;
- retryable vs terminal failure;
- consent/preference suppression;
- guest vs authenticated inbox behavior;
- safe template-variable allow-list;
- HTML/URL safety;
- provider webhook authentication/idempotency;
- message snapshot unchanged after template edits;
- outbox replay cannot duplicate customer notifications.

### 26.5 Database bypass tests

Direct Prisma/raw SQL tests prove DB constraints reject impossible leg ordering, mutable published workflow history, duplicate sequence/message dedupe and invalid final delivery/custody combinations.

### 26.6 Full verification

Each implementation wave must finish with:

- fresh PostgreSQL 17 migration from empty database;
- full API integration/security suite;
- deterministic OpenAPI generation with no drift;
- root ESLint/TypeScript/production build;
- Bun regression suite;
- contracts/acceptance/route sweep;
- customer-facing demo/prototype-copy scan;
- whole-branch code review;
- exact head SHA and test counts in verification/handoff docs.

## 27. Implementation waves

The subsystem is too large for one safe PR. The implementation plan should decompose it as follows:

### Wave L1 — Network + workflow configuration authority

Persistence/contracts/admin APIs for nodes, lanes, immutable workflow versions and route rules/simulation. No customer shipment mutation yet.

### Wave L2 — Shipment route execution + Dispatch integration

Shipment/stops/legs/events, Fulfilment activation, depart/arrive/reroute, final-mile eligibility and direct-route compatibility.

### Wave L3 — Unified order tracking projection + customer/admin UI

Replace the old fixed tracking Wave A with the route-aware server projection, account/admin tracking endpoints and shared UI.

### Wave L4 — Notification authority + customer inbox

Rules/templates/preferences, outbox consumer, adapters, attempts, inbox, receipts and channel diagnostics.

### Wave L5 — SLA/exception analytics + AI recommendations

Delay worker, operational dashboards and non-authoritative AI recommendations after sufficient real data exists.

Every wave has its own implementation plan/review/verification gate. No later wave is claimed live merely because its schema/interface is anticipated earlier.

## 28. Rollout

1. Deploy schema/configuration with default direct workflow and no behavior change.
2. Configure real business nodes/lanes/workflow in staging.
3. Run route simulations for every delivery zone and pickup path.
4. Enable shipment execution for a small staging/UAT cohort.
5. Verify direct and multi-hop custody/inventory invariants.
6. Cut tracking UI to the unified projection.
7. Enable in-app notifications first because it has no external provider dependency.
8. Enable Email/SMS/WhatsApp one channel at a time only after provider configuration and UAT evidence are green.
9. Monitor route exceptions, message failure rates and duplicate suppression.
10. Expand production routing only after rollback/runbook evidence exists.

## 29. Explicit design decisions

- `Regional`, `District`, `Zonal`, `Outlet`, `Pickup Point` are configurable business concepts, not mandatory state-machine levels.
- Logistics nodes are separate from Inventory `Location`, with an optional link.
- Customer parcels do not re-enter sellable stock merely by arriving at an inventory-backed hub.
- Published workflow versions are immutable.
- The concrete route is snapshotted per shipment.
- Actual movement is append-only evidence; planned stages never impersonate completed movement.
- One shipment is executed per order in the first milestone, while `orderId + sequence` supports future split shipments.
- `DeliveryJob` represents final mile only; linehaul/inter-hub legs live in Logistics Authority.
- Multi-hop final-mile assignment waits for arrival at the configured dispatch node; direct delivery remains immediately eligible after source handover.
- Owner customization controls presentation/routing/notification policy, not protected payment/inventory/COD/delivery authority.
- Notifications are asynchronous, durable and deduplicated.
- In-app, Email, SMS and WhatsApp are channel capabilities; unavailable providers are shown honestly.
- Customer tracking is server-derived from evidence and preserves separate payment/fulfilment/delivery truth.
- AI is advisory only.

## 30. Relationship to the earlier tracking plan

The 2026-10-13 Wave A plan assumed a fixed tracking milestone sequence and no first-class inter-node shipment authority. Executing that plan now would create a temporary architecture that this subsystem would immediately replace.

Therefore:

- its privacy, secure guest tracking, shared server projection and one-click account/admin principles remain valid;
- its fixed `order_placed -> confirmed -> picking -> packed -> handed_to_delivery -> assigned -> ...` implementation is superseded by this configurable route-aware authority;
- no implementation agent should execute the older Wave A plan after this specification is approved.

## 31. Next authority after this subsystem

After the Logistics/Tracking/Notification waves and COD Collection + Rider Remittance are implemented and verified, the next recommended backend authority remains **Physical Returns + Inspection + Restock/Disposition**, because reverse physical custody must eventually close the inventory loop without unsafe automatic restocking.
