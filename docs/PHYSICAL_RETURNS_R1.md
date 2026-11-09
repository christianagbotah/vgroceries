# Physical Returns — R1 staff receipt and inspection authority

Status: first independently verifiable backend/frontend increment; **not**
revenue reconciliation, full customer return authorization, or saleable restock.

## Motivation

The original Returns pages include a development-only local transaction
simulation. Those UI screens do not provide production proof of physical goods,
inspection or inventory reconciliation. The new administrator workspace under
`/admin/physical-returns` uses only durable PostgreSQL-backed commands.

## Supported authority

- Admin-only `GET/POST /api/v1/admin/physical-returns`, `GET
  /api/v1/admin/physical-returns/{returnId}` and `POST
  /api/v1/admin/physical-returns/{returnId}/inspect`.
- `PHYSICAL_RETURNS_INTAKE_ENABLED=false` by default. GET exposes the server's
  activation state; writes reject with 503 until separately enabled.
- A physical receipt is allowed only for a genuinely **delivered/collected**
  order whose `stockConsumedAt` and immutable order-specific `StockDepletion`
  both exist. The original handover location is **server-derived**, not a
  browser-supplied field.
- Receipt lines have explicit item quantities and whether packaging was
  sealed, opened, damaged or unverified. Strict notes are required to record
  physical possession. Only real source order lines may be included. The sum
  across all past receipts may never exceed the original depleted units;
  packaged goods must be whole base units. Source order row locks serialize
  independent receipts and direct SQL attempts.
- Inspection is terminal and must make an explicit decision on **every**
  receipt line. R1 permits **quarantine** or **destroy** decisions only.
  Inspection notes and actor IDs are durable; receipt identity, quantities and
  terminal dispositions are immutable, with database triggers rejecting
  direct bypasses. Refunds are not implied by return collection.
- Both commands require valid actor-scoped replay keys, are one transaction
  with audit and outbox evidence, and permit safe identical retries.
- No stock lot quantity, stock movement, cost of goods, customer refund,
  COD remittance or payment capture is written at receipt or inspection.
- The browser mock explicitly refuses to create physical evidence.

## Outstanding R2 / R3 work

- Formal customer return request/approval workflow, eligibility windows,
  source documentation and service-level exceptions.
- Distinct stock disposition approval for **restockable** goods only, with
  expiry/lot verification, packaging safety and qualified staff permission.
  Ensure exactly one new inventory movement and proper quarantine history.
- Physically returned goods inventory under quarantine for cross-location
  receiving; separate unsaleable shrinkage/damage reporting.
- Link approved refund obligation to existing electronic Refund Authority and
  COD/cash policy; no payment refund is automatically created from this API.
- Uploadable private photos/proof, customer-safe return tracking, accounting
  reconciliation, staff operational acceptance and reporting.

## Deployment gates

Regenerate the production OpenAPI and verify **124 paths**; check all role,
Origin/CSRF, idempotency, source handover, concurrent cap and SQL-integrity
cases. Test on isolated PostgreSQL; review full GitHub checks; restore current
UAT backup in a separate database and rehearse the migration before any
live schema action. Keep the feature flag off in UAT until real staff procedures
and return policy are approved. The earlier remote pickup flags stay off.

Related: GitHub #61, `docs/RELEASE_COMPLETION_ROADMAP.md`.


## R2a quarantine custody extension — read the current R2a runbook

The forthcoming custody slice records goods already inspected as quarantined
in a separate, immutable, non-saleable stock lot. It has a second
default-OFF feature flag and requires verified one-lot depletion provenance.
See `docs/PHYSICAL_RETURNS_R2A.md`. No resale, restock approval or refund
is implemented by that extension.
