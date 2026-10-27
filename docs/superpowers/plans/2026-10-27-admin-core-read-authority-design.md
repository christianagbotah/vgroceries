# Admin Core Read Authority Design

## Intent
Stop the first-wave Variety Groceries admin pages from calling frontend-only contracts that return production 404s after successful staff authentication.

## Scope
This wave adds real protected read authority for Orders, Products/Categories, and Customers. It does not implement catalogue edits, category edits, POS, cashier sessions, purchasing mutations, returns, AI, settings, demo controls, or other still-missing admin operations.

## Constraints
- Production PostgreSQL is authoritative; no mock/demo data may be fabricated.
- Existing browser operation names and REST paths remain stable.
- Admin routes require authenticated back-office roles; customer sessions must receive 403.
- Inventory-derived availability must use the same sellable/reservation/safety-stock semantics already used by production inventory/catalogue code.
- Missing resources return 404, not a successful empty placeholder.
- OpenAPI and exact route inventories must be updated with every new route.

## Approach
Extend existing domain services instead of creating a parallel admin data layer: Orders reuse OrderProjectionService plus a small admin query service; catalogue reads extend CatalogAdminService; customer reads use a focused AdminCustomerService. Controllers remain thin and guarded. Tests are HTTP integration tests against PostgreSQL and assert both response shape and access control.

## Deferred gaps
The parity audit found 57 missing admin operations before this wave. The remaining operations will be closed in later coherent waves: inventory detail/actions, purchasing/receiving, POS/cash sessions, dispatch/riders/providers, returns, reports/team/audit/settings, AI, and demo-only controls.
