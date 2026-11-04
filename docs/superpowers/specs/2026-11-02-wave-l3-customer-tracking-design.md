# Wave L3 Advanced Customer Tracking Design

## Intent
Give delivery customers a truthful, readable route-aware progress view without exposing operational routing internals or creating a second shipment authority. Secure guest tracking (`reference + verification code`) and authenticated order status continue to return the same `PublicOrder`; L3 enriches that projection.

## Goals
- Show a clear current delivery headline and chronological customer-safe journey.
- Use the exact workflow version pinned to the Shipment for configured customer presentation.
- Derive progress only from committed Order/Fulfilment/Shipment/Dispatch truth.
- Show customer-visible facility public names when the parcel is actually at that facility.
- Keep legacy orders with no Shipment usable through the existing order-event history.
- Reuse one tracking component on `/track`, `/checkout/status/[id]`, and `/account/orders/[id]`.
- Keep the existing secure tracking ownership/throttle model unchanged.

## Non-goals
- No notifications/SMS/email/push.
- No GPS, map pin, driver location, distance, live ETA, or fabricated SLA time.
- No COD collection/remittance authority.
- No Physical Returns/restocking authority.
- No public/admin Shipment detail exposure, route-rule IDs, workflow IDs, lane IDs, revisions, custody internals, actor IDs, request IDs, or raw metadata.
- No new public API route and no new database table.

## Constraints
- L2 execution remains default-off; L3 must still render legacy orders.
- The public projection must remain identical for an authenticated owner and a successfully verified guest tracking request.
- Only nodes with `customerVisible=true` may contribute a facility label.
- A Shipment event may contribute custom text only from bounded `customerTitle` / `customerDetail`; `safeMetadata` is never copied to the public projection.
- Workflow stage text is already protected from payment/refund/COD/delivery-truth claims by L1 validation and is read from the immutable workflow version pinned to the Shipment.
- Existing `PublicOrder.events` remains for compatibility during this wave.

## Approaches considered

### 1. Expose the admin Shipment detail to customers
Rejected. It contains operational routing/custody identifiers and would turn an admin execution projection into a public contract.

### 2. Add a second public `/tracking/...` resource backed by a new timeline table
Rejected. Secure tracking already resolves to `PublicOrder`; duplicating storage/API authority creates drift and unnecessary migration/state reconciliation.

### 3. Enrich `PublicOrder` with a derived `trackingJourney` (chosen)
Chosen because it preserves the existing ownership/security boundary, requires no new authority, and can combine immutable workflow presentation with committed execution events. The server performs the privacy projection once; all storefront screens reuse it.

## Public contract
`PublicOrder.trackingJourney` is optional so legacy/mock clients remain compatible during rollout.

`trackingJourney` contains:
- `source`: `shipment` or `legacy`.
- `state`: a small customer vocabulary (`preparing`, `at_facility`, `in_transit`, `ready_for_delivery`, `out_for_delivery`, `delivery_exception`, `ready_for_pickup`, `delivered`, `collected`, `returned_to_dispatch`).
- `headline`: bounded customer-facing current state copy.
- optional `detail` and `currentLocationLabel`.
- `updatedAt`.
- ordered `milestones[]` containing only `id`, `at`, `title`, optional `detail`, optional `locationLabel`, `status` (`complete`, `current`, `planned`), and `kind` (`order`, `fulfilment`, `shipment`, `delivery`).

The contract contains no money fields beyond those already present on `PublicOrder`, no operational IDs, and no raw event kind/metadata requirement for the browser.

## Projection rules
1. If no Shipment exists, return a legacy journey derived from existing `customerSafe` OrderEvents; do not invent route stages.
2. If Shipment exists, load sequence 1 with its pinned workflow version/stages, events, event nodes, current node, and FulfilmentRun timestamps.
3. Actual canonical facts are available for workflow events `order_placed`, `order_confirmed`, `picking_started`, `packed`, and all committed Shipment events.
4. Customer-visible workflow stages are rendered in `sortOrder`. Completed stages use the committed fact timestamp. Uncompleted stages appear only when `showPlannedWhenPending=true` and are labelled planned, never with an ETA.
5. Actual Shipment events with a bounded `customerTitle` that are not represented by a workflow stage may appear as completed informational milestones; their `customerDetail` is optional.
6. Customer location comes only from a related LogisticsNode with `customerVisible=true`, using `publicName`. Hidden nodes and null-node in-transit states reveal no facility.
7. Current state is derived from Shipment status plus the latest committed delivery exception/delivery event. No client input determines it.
8. Return-to-dispatch is represented as a delivery exception/recovery milestone; it does not claim a stock return.
9. Collection orders remain on the legacy order journey unless/until a pickup Shipment is present; pickup Shipment states may show `ready_for_pickup` / `collected`.

## UI
Create one `OrderTrackingJourney` component. It shows current headline/location, a simple ordered timeline/stepper, planned stages visually distinct from completed stages, and a refresh affordance. `/track` keeps secure guest entry; once an order is loaded it auto-refreshes periodically while non-terminal. Authenticated order detail and checkout status reuse the same component. If `trackingJourney` is absent, the component renders the existing `order.events` fallback.

## Security and failure behavior
- Guest verification and durable throttle remain unchanged.
- Unauthorized/guessed orders still reveal nothing.
- Projection failure fails the order response rather than silently falling back to admin/raw Shipment data.
- Hidden facility nodes, safeMetadata, actor identity, route revision and execution identifiers are explicitly regression-tested as absent.
- Customer strings remain bounded by existing workflow/event validators; UI treats them as text only.

## Verification
TDD for contracts, projection privacy/state mapping, owner/guest parity, OpenAPI schema, UI fallback/refresh and mock/contract fixtures. Finish with the full clean-room API suite, root CI mirror, deterministic OpenAPI, GitHub PR CI, and keep any production activation separate.
