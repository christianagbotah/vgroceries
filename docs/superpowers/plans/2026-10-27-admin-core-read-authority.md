# Admin Core Read Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back the Orders, Products/Categories, and Customers admin pages with real protected PostgreSQL reads so those sidebar destinations no longer 404 in UAT.

**Architecture:** Reuse existing domain projections and inventory semantics, add only thin protected HTTP read endpoints, and keep all response shapes identical to the existing shared contracts. Production OpenAPI and route-inventory assertions move with the implementation.

**Tech Stack:** NestJS, Prisma/PostgreSQL, TypeScript, Node test runner, shared `@variety/contracts`.

**Spec:** `docs/superpowers/plans/2026-10-27-admin-core-read-authority-design.md`

## Global Constraints
- No mock/demo records in production responses.
- Preserve existing browser operation paths.
- Admin/inventory-manager access must follow explicit backend permissions; customers are forbidden.
- 404 for missing order/product/customer resources.
- TDD for every production endpoint.

## Review Focus
- Search/filter inputs must not widen access or throw on empty values.
- Product availability must not double-subtract reservations or include quarantined/expired lots.
- Customer spend must use persisted paid/refunded order states only.
- Order detail must not expose another customer's private verification credentials.
- Empty UAT datasets must return valid empty arrays rather than 404/500.

---

### Task 1: Admin Orders read authority

**Files:**
- Create: `apps/api/src/orders/admin-order-query.service.ts`
- Create: `apps/api/src/orders/admin-orders.controller.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Test: `apps/api/test/admin-orders-http.spec.ts`

**Interfaces:**
- Produces `GET /api/v1/admin/orders` -> `AdminOrderRow[]`
- Produces `GET /api/v1/admin/orders/:orderId` -> `AdminOrderDetail`

- [ ] Write failing HTTP tests for 401/403/200, filters/search, detail projection, missing order 404, and OpenAPI routes.
- [ ] Run focused tests and confirm route-not-found failures.
- [ ] Implement minimal query/controller code using `OrderProjectionService` and persisted reservations/address/zone/refunds.
- [ ] Run focused tests green.
- [ ] Commit.

### Task 2: Admin Products and Categories read authority

**Files:**
- Modify: `apps/api/src/catalog-admin/catalog-admin.service.ts`
- Create: `apps/api/src/catalog-admin/catalog-admin-read.controller.ts`
- Modify: `apps/api/src/catalog-admin/catalog-admin.module.ts`
- Test: `apps/api/test/catalog-admin-read-http.spec.ts`

**Interfaces:**
- Produces `GET /api/v1/admin/products` -> `AdminProductRow[]`
- Produces `GET /api/v1/admin/products/:productId` -> `AdminProductDetail`
- Produces `GET /api/v1/admin/categories` -> `AdminCategoryRow[]`

- [ ] Write failing HTTP tests for protection, search, product detail, availability/lot projection, categories, missing product 404, and OpenAPI routes.
- [ ] Run focused tests and confirm route-not-found failures.
- [ ] Implement reads using the production inventory availability semantics.
- [ ] Run focused tests green.
- [ ] Commit.

### Task 3: Admin Customers read authority and route parity guard

**Files:**
- Create: `apps/api/src/admin-customers/admin-customers.service.ts`
- Create: `apps/api/src/admin-customers/admin-customers.controller.ts`
- Create: `apps/api/src/admin-customers/admin-customers.module.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Test: `apps/api/test/admin-customers-http.spec.ts`
- Modify: exact-route inventory tests and `docs/openapi-foundation.json`

**Interfaces:**
- Produces `GET /api/v1/admin/customers` -> `CustomerRow[]`
- Produces `GET /api/v1/admin/customers/:customerId` -> `CustomerDetailResponse`

- [ ] Write failing HTTP tests for protection, customer aggregates/detail, missing customer 404, empty data, and OpenAPI routes.
- [ ] Run focused tests and confirm route-not-found failures.
- [ ] Implement minimal customer query/controller/module.
- [ ] Update exact route inventories and regenerate deterministic OpenAPI.
- [ ] Run all focused tests, full API suite, frontend regressions, lint/typecheck/build.
- [ ] Commit and open PR.
