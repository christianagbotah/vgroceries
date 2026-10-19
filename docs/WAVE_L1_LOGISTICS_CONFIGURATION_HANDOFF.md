# Wave L1 — Logistics Network & Workflow Configuration handoff

**Implementation branch:** `feat/logistics-network-workflow-l1-20261017`  
**Reviewed code checkpoint before verification-doc commit:** `3752722`  
**Integrated base:** `origin/main` at `b82dc55d4c17ad11268b65c8c1001b317924abe8`  
**Architecture:** `docs/superpowers/specs/2026-10-17-configurable-logistics-tracking-notifications-authority-design.md`  
**Plan:** `docs/superpowers/plans/2026-10-17-wave-l1-logistics-network-workflow-configuration.md`

## What L1 now owns

Wave L1 adds production configuration authority for business-defined logistics networks without changing live parcel movement yet. Administrators can configure Logistics Nodes, directed Lanes, immutable Delivery Workflow versions, deterministic Route Rules and read-only route simulation. The browser does not select hidden routes; zero matches and equal-highest-priority matches fail closed.

The production model supports head office, warehouse, fulfilment centre, hub, outlet, pickup point, cross-dock, partner facility and other business concepts without hard-coding regional/district/zonal hierarchy. A logistics node may optionally reference an Inventory Location, but parcel transit does not make goods saleable stock.

Published workflows are immutable. Route rules pin a specific published workflow version. Doorstep routes must bind to a workflow ending in `delivered`; remote-pickup and source-collection routes must bind to a workflow ending in `customer_collected`. Direct one-stop routes require zero lanes; multi-hop routes require one active lane for every adjacent stop pair.

## Production API surface

L1 adds exactly 13 path keys under `/api/v1/admin/logistics/*`, taking the generated production OpenAPI from 69 to **82 paths**. Reads and simulation require administrator authentication. Mutating commands use the existing CSRF/idempotency boundary; simulation is diagnostic and creates no shipment or commerce mutation.

OpenAPI regeneration is deterministic. The verified SHA-256 is:

`fe1de21570acdea4f22297c1cda1952efcf0f092feabf9ecdce04fadbd3d365b`

## Admin experience

`/admin/logistics` provides one responsive **Logistics & Delivery** workspace with:

- Locations & hubs;
- Network lanes;
- Delivery workflow builder with immutable published versions;
- Route rules, activation preflight and route simulation.

A guarded CLI bootstrap can create the existing direct-delivery defaults from the configured commerce source and active delivery zones. It is explicit, idempotent and refuses conflicting operator-authored defaults or overlapping active broad routes; it never runs automatically at application startup or migration time. See `docs/LOGISTICS_CONFIGURATION_RUNBOOK.md`.

## Authority boundaries preserved

L1 configuration and simulation do **not** mutate Order, Reservation, StockLot, StockDepletion, FulfilmentRun, DeliveryJob, PaymentAttempt or Refund authority. The dedicated boundary regression snapshots those runtime tables before and after L1 configuration/activation/simulation and requires byte-equivalent state.

L1 also does not claim parcel departure/arrival, customer tracking cutover, courier bookings/webhooks, GPS/ETA, Email/SMS/WhatsApp/in-app delivery, COD collection/remittance, Physical Returns/restocking or POS authority.

## Verification evidence

Fresh isolated verification used the local PostgreSQL test cluster on `127.0.0.1:55433`, separate from production/staging.

| Check | Result |
|---|---:|
| Empty database migrations | **10/10 applied** |
| Final exact-head complete API suite | **429/429 passed, 0 failed** |
| Final focused L1 Logistics suite | **30/30 passed, 0 failed** |
| Post-review affected route/bootstrap/boundary suite | **11/11 passed** |
| Production OpenAPI | **82 paths** |
| OpenAPI deterministic regeneration | **PASS — byte-identical** |
| OpenAPI SHA-256 | `fe1de21570acdea4f22297c1cda1952efcf0f092feabf9ecdce04fadbd3d365b` |
| ESLint | **PASS** |
| Root TypeScript | **PASS** |
| Next.js production build | **PASS** |
| Static page generation | **50/50** |
| Handoff regressions | **27/27** |
| Bun regression suite | **114/114 — 1009 expectations** |
| Shared contract checks | **38/38** |
| Acceptance checks | **24/24** |
| Production-server route sweep | **60/60 HTTP 200** |
| `git diff --check` | **PASS** |

The final local API row above is intentionally not filled until the exact-head process reports its explicit Node test summary. GitHub's PostgreSQL 17 PR workflows remain the merge gate after push.

## Next wave

The next implementation wave is **L2 — Shipment Route Execution + Dispatch Integration**. It will introduce Shipment/Stop/Leg runtime identities, append-only movement events, route snapshotting, Fulfilment handover activation, depart/arrive/reroute commands and final-mile readiness. L2 must consume the immutable L1 route/workflow snapshot and must not turn transit nodes into inventory restock events.

After L2, the approved architecture continues with advanced customer tracking, notification authority/inbox, and later SLA/AI route assistance. COD collection/remittance and Physical Returns remain separate financial/stock authorities.
