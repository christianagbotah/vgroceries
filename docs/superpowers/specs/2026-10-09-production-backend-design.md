# Variety Groceries production backend design

Prepared 9 October 2026 for Christian Agbotah.

**Status:** written architecture for owner review. NestJS, PostgreSQL, Redis,
native apps and live AI have not been implemented by this change.

## Intent and existing foundation

Variety Groceries must sell groceries online and at the counter from one stock
truth, manage fulfilment, delivery, returns and refunds, and later serve native
Android/iOS customer and rider applications. Advanced AI must work from verified
business records and use the same permissions and commands as ordinary users.

Keep the existing Next.js interface and its Ghana-specific contacts, addresses,
GHS prices, delivery zones and owner-configured business policies. Start with one
business; preserve location identifiers so additional stock locations can be
introduced without changing every contract. A marketplace, subscription
deliveries and a complete accounting product are separate future projects.

The corrected frontend currently uses `src/services/client.ts` for browser
requests and `src/services/server-data.ts` for server-rendered data. Both still
call development mock operations. Production integration replaces both adapters;
shared contracts must remain independent of the mock implementation.

## Architecture decision

| Approach | Benefit | Trade-off | Decision |
| --- | --- | --- | --- |
| Dedicated modular NestJS API with PostgreSQL | Explicit business boundaries and one API for web, POS and native apps | Adds a separate application and deployment process | Selected |
| All business operations in Next.js handlers | Fewer initial processes | Couples commerce, native API and AI execution to the web application | Retain Next.js for the web interface |
| Separate service for every business module | Independent deployments for each module | Distributed stock/payment coordination and more operational overhead | Extract individual services only when measured needs justify it |

Deploy the web application, API and workers as separate processes. NestJS modules
initially share one PostgreSQL database. API replicas must be stateless apart
from requests; sessions, stock and idempotency records live in durable stores.
Scale HTTP replicas and worker queues independently using observed load.

| Layer | Decision and responsibility |
| --- | --- |
| Web | Existing Next.js/React/TypeScript interface, including staff and POS |
| API | NestJS/TypeScript; versioned REST, validation, permissions and domain commands |
| Database | PostgreSQL; business authority, constraints, migrations and transactions |
| Data access | Prisma for migrations and routine queries; explicit SQL where transactional locking requires it |
| Queues/cache | Redis and BullMQ; cache and delivery of background work, never stock or payment authority |
| Workers | Separate Node/Nest processes for outbox publishing, notifications, reconciliation and AI jobs |
| Files | Object storage adapter for product media and private delivery/return evidence |
| Native apps | React Native/Expo customer and rider applications for Android and iOS |
| AI providers | Backend-only provider adapters; external inference initially |

## Repository boundaries

Introduce the API and worker packages alongside the existing web app before a
workspace-wide move. The eventual workspace has these responsibilities:

| Package | Contents |
| --- | --- |
| `apps/web` | Existing Next.js application |
| `apps/api` | NestJS controllers, modules, domain services and repository adapters |
| `apps/worker` | Queue consumers and scheduled orchestration |
| `apps/mobile-customer` | Customer Android/iOS screens |
| `apps/mobile-rider` | Rider Android/iOS screens |
| `packages/contracts` | Transport schemas, public enums and API models |
| `packages/api-client` | Generated clients and explicit web/native authentication adapters |
| `packages/domain-values` | Pure money, quantity and unit-conversion helpers |

Public contracts cannot import Next.js, React, Prisma or mock stores. Share
contracts, clients and pure value handling; native applications have their own
screens and device interactions. Module repositories and database models remain
private to the backend.

Pin compatible runtime/dependency versions when preparing the implementation
plan. Moving the current web directory is a separate migration with its own
build and deployment checks.

## NestJS module ownership

| Module | Owns | Uses |
| --- | --- | --- |
| Identity | Users, sessions, device sessions, grants and actor context | Audit |
| Catalogue | Categories, products, variants, publication and price versions | Inventory availability |
| Inventory | Locations, lots, movements, reservations, receiving and stocktakes | Audit and outbox |
| Orders | Order snapshots, checkout, fulfilment and permitted transitions | Inventory and payments |
| POS | Counter workflow, receipts and cashier sessions | Orders and inventory commands |
| Payments | Attempts, verified provider events, settlements and reconciliation | Order totals and audit |
| Returns/refunds | Eligibility, inspection, dispositions, refund allocations and exchanges | Inventory and payments |
| Delivery | Zones, slots, assignments, evidence and COD collection/remittance | Orders, inventory handover and provider adapters |
| Purchasing | Suppliers, purchase orders and receiving requests | Inventory receiving |
| Reports | Permission-scoped read models and exports | Committed business records |
| AI | Conversations, retrieval, proposals, provider usage and evaluations | Permission-scoped read tools and reviewed domain commands |

Controllers translate HTTP requests into validated domain commands. Modules
expose explicit services; other modules cannot modify their tables directly.
Inventory alone decides stock mutations. Payments alone interprets verified
money-transfer outcomes. AI cannot bypass either boundary.

## Database and business invariants

Use stable opaque API identifiers, UTC timestamps and explicit location IDs.
Store money as integer minor units with currency `GHS`; calculate authoritative
discounts, fees and taxes on the server using configured policy. Store stock as
precise decimal quantities in a base unit, with explicit unit conversions.
Reject unsupported precision and increments.

| Records | Required relationships and protections |
| --- | --- |
| Identity/session/grant | Unique identity keys, hashed secrets/tokens, expiry and revocation |
| Category/product/variant/unit | Unique slugs/SKUs where appropriate; publication and price versions |
| Location/lot/balance/movement | Variant/location foreign keys, lot eligibility, nonnegative balances, append-only movement history |
| Reservation/allocation | Order/line/location/lot relationships, expiry and once-only release/consumption |
| Order/line | Snapshot names, units, prices and policy; separate lifecycle dimensions; optimistic version |
| Payment/event/refund | Unique provider event IDs and references; refund allocations and paid-balance limits |
| Return/line/disposition | Original sale quantities, evidence and every credited or reversed lot |
| Cashier session/receipt | Cash movements, reconciliation and unique receipt sequence |
| Delivery/job/evidence/COD | Assigned resource ownership, durable action history and collection/remittance separation |
| Idempotency/outbox/audit | Scoped unique request keys, request hashes, outcomes and durable event IDs |

### Stock reservation and handover

Available to sell is eligible physical stock minus unexpired active reservations
minus safety stock. Eligibility excludes damaged, expired, quarantined and
unsaleable lots at the chosen stock source. Browsing and cart editing do not
create holds.

Checkout and POS call one allocation service. In a PostgreSQL transaction, lock
the affected variant/location balance rows in a consistent order, recheck all
lines, create the order/holds and persist its idempotency outcome. Any conflict
rolls back the whole command. Every command changing lot eligibility or stock
uses the same locking discipline. Enforce constraints as well as application
validation, and retry bounded deadlock/serialization failures.

At rider pickup or customer/counter collection, lock the order and its active
allocations, verify coverage, expiry and eligible physical quantities, then
consume stock and retire holds in one transaction. A unique depletion event
returns the original result on retry. Picking and packing never deplete stock.
Worker-based expiry helps cleanup, but every command validates the current
expiry so queue delay cannot preserve an invalid hold.

### Returns and money

Aggregate return quantities across all requests and duplicate input lines.
Each disposition records every lot and movement it creates. Reclassification
uses compensating movements and retains lot history. If credited stock has
already moved or is allocated, stop for a reconciliation workflow before any
partial reversal. Production inspection records the returned batch and verified
expiry; missing perishable provenance stays quarantined. A mixed-batch return
must never inherit a later expiry from another batch.

Refunds allocate against verified captured/collected money, both per return and
per original order. Reserve refund amounts while outcomes are unresolved.
Cancellation can request a refund without inventing a physical return. Approval,
provider execution and confirmed success are separate events; an uncertain
outcome remains pending/requires review. Record financial reversals and original
sale references without rewriting history. Exchanges link a return and a new
sale. Reports derive from these records, including configured tax/discount and
delivery-fee reversal policy.

## API and authentication contracts

Publish OpenAPI under `/api/v1` and generate web/native clients. Keep the
view-facing service method names stable while explicitly mapping them to new
HTTP endpoints; the existing mock URL layout is a compatibility reference.

| API family | Representative production resource |
| --- | --- |
| Authentication | `/api/v1/auth/sessions` and session renewal/revocation |
| Catalogue | `/api/v1/catalog/products`, categories and product detail |
| Inventory | `/api/v1/inventory/availability`, reservations and movements |
| Commerce | `/api/v1/orders`, order actions and `/api/v1/pos/sales` |
| Money | `/api/v1/payments`, verified provider events and `/api/v1/refunds` |
| Returns | `/api/v1/returns` and reviewed inspection actions |
| Delivery | `/api/v1/delivery/jobs`, assignments and evidence |
| AI | `/api/v1/ai/conversations` and reviewed suggestions |

Use the existing `{ok,data}` / `{ok:false,error}` envelope with request IDs,
typed errors, bounded pagination and UTC timestamps. Mutation requests supply
an idempotency key scoped to actor/guest session, operation and business.
Persist a canonical request hash and original outcome atomically; changed input
with an existing key returns a conflict. Financial event uniqueness is retained
independently of short-lived request-key retention. Concurrent updates use
resource versions and return `VERSION_CONFLICT`.

Web authentication uses secure HttpOnly same-site cookies with origin/CSRF
checks on mutations. Native clients use short-lived bearer access tokens and
rotating refresh sessions; persist refresh credentials using secure device
storage, with server-side hashed token records and reuse detection/revocation.
Authorisation evaluates role/action plus the actual customer, location, cashier
session or assigned rider resource on every request. Request body `actor` or
`customerId` values cannot establish identity.

Guest checkout issues a scoped guest session/order access capability. Public
tracking requires verification and rate limiting; an order reference alone
does not reveal private information. Staff privileges are never inferred from
the demo role picker. Production mode excludes mock/reset/payment-simulation
endpoints and demo access.

## Events, recovery and operations

Insert business state, audit and an outbox event in the same database
transaction. A publisher sends committed events to BullMQ. Publishing is at
least once; workers deduplicate durable event IDs, so a crash between delivery
and acknowledgement cannot repeat a money or stock effect. External provider
requests have their own supported idempotency and reconciliation paths.

Separate queues for notifications, media processing, payment reconciliation,
reporting and AI keep slow inference away from checkout. Apply bounded retries,
backoff, timeouts, dead-letter visibility and owner-operable recovery. Providers
are capability-based adapters; Hubtel remains a candidate until merchant access
and supported verification/refund capabilities are confirmed. In-house and
manual dispatch remain usable without an external courier integration.

Start with independently supervised web, API and worker processes, PostgreSQL,
Redis and object storage. Keep backups and restore checks, migrations, request
and event correlation, structured logs, health/readiness endpoints and queue
lag monitoring. Caches can be rebuilt and never decide stock or payment truth.
Stock/order events invalidate relevant web read models. Mobile clients fetch
fresh state on reconnect and reconcile resource versions.

## Native mobile readiness

Build distinct customer and rider apps against the same API. Register each
device for notifications, with revocable ownership and permission settings.
Rider APIs expose assigned jobs only; signed private uploads support delivery
evidence with size/type limits. Location reporting is opt-in and timestamped.

Local drafts, notes and evidence have durable client action IDs and a visible
pending queue. Retry with the same ID and show server acknowledgement. Never
claim a sale, reservation, payment or delivery-state transition completed while
offline. Reconcile version conflicts rather than replaying stale state blindly.

Version APIs additively while supported app releases remain installed. Document
the minimum compatible client version and a migration/deprecation policy before
removing fields. Notifications prompt a fresh fetch; they do not establish the
current order or payment state.

## Advanced AI boundary

Build provider-neutral adapters for text, streaming, speech and image inputs.
The initial grounding layer retrieves catalogue/availability and authorised
business records through typed tools and filtered database search. A later
semantic search implementation uses the same retrieval port and access filters.
Model output is untrusted input to ordinary validation.

| Capability | Evidence and permitted output |
| --- | --- |
| Shopping/budget basket | Available SKUs, current price versions and budget; a reviewable basket |
| Voice/photo list | Extracted requested items, uncertain matches and available alternatives |
| Replenishment/forecasting | Sales history, seasonality, lead times and backtests; draft purchasing suggestions |
| Expiry assistance | Verified eligible lots/dates; reviewed promotion proposals |
| Dispatch assistance | Zones, capacity, assignment and delivery events; suggested grouping |
| Business insights/exceptions | Permission-filtered records, data period and supporting references |

Recheck price and availability when a basket is accepted. Insufficient history
disables forecast claims. Sensitive actions become proposals reviewed by an
authorised person; execution carries the reviewed resource version and the
normal domain command. AI never directly writes inventory, prices or refunds.

Record model/provider/version, tool use, evidence, latency, usage and estimated
cost. Enforce per-user/business quotas, timeouts and cancellation, with readable
fallbacks when a provider is unavailable. Maintain evaluation cases for grounded
prices/stock, restricted records, missing data and malicious instructions in
retrieved content. Keep secrets and unnecessary personal information out of
prompts and logs. Demo suggestions remain labelled until live integration.

## Implementation milestones and verification

1. **Foundation:** NestJS application and PostgreSQL migrations; identity,
   permissions, audit/outbox conventions, catalogue and availability APIs,
   generated contracts/clients and private integration preview.
2. **Commerce authority:** transactional reservations, orders, POS, receiving,
   expiry and handover; concurrent final-unit tests, duplicate-command recovery
   and both web adapter replacements.
3. **Money and delivery:** verified payment adapters, refund ledger, cashier
   reconciliation, returns, assignments, evidence and COD workflows.
4. **AI and native clients:** grounded tools/streaming, audited proposals,
   forecasting when history supports it, then customer/rider apps and their
   reconnect/device workflows.

Foundation is the first separately planned implementation slice. Do not switch
the public shop to mixed authority where a live catalogue feeds mock checkout.
Production activation requires one consistent backend operating mode and the
completed commerce/money/delivery acceptance criteria.

Required verification includes schema migrations on an empty database, server
resource authorisation, two independent concurrent attempts for the final unit,
multi-line rollback, expired holds, duplicate checkout and handover, refunds
after uncertain outcomes, multi-item return dispositions, mixed expiry dates,
outbox/worker crash recovery, native refresh revocation and offline retries.
Keep strict types/builds, current acceptance/regression suites and genuine
browser checkout/POS/rider/returns checks. Launch additionally requires configured
business policies, real product records and verified integration access.

The next deliverable after owner review is an implementation plan for the
foundation milestone, including file-level changes and executable checks.

## Primary technical references

- [NestJS modules](https://docs.nestjs.com/modules)
- [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [NestJS Prisma integration](https://docs.nestjs.com/recipes/prisma)
- [NestJS BullMQ queues](https://docs.nestjs.com/techniques/queues)
- [PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Expo native applications](https://docs.expo.dev/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
