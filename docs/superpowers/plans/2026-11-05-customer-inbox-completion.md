# Customer notification inbox completion

**Goal:** Complete PR #55 with a usable customer inbox and a verified background projector.

**Architecture:** Retain the existing Notification and NotificationOutboxReceipt models. Committed outbox events produce immutable customer messages. Customer account APIs own inbox reads and read state. A systemd timer invokes the existing bounded projector command.

**Spec:** The in-app inbox portions of `docs/superpowers/specs/2026-10-17-configurable-logistics-tracking-notifications-authority-design.md`, together with the existing phase-one implementation in `docs/NOTIFICATIONS_L4.md`.

## Scope and decisions

- Reuse the existing outbox consumer and customer session authorization.
- Add cursor pagination to the existing list endpoint, preserving the default limit and existing response fields.
- Add mark-all-read and an account Notifications tab with unread count, refresh, per-item read actions and order links.
- Render concise transaction updates using explicit templates and database-owned recipient identity.
- Add a follow-up migration for snapshot/receipt integrity. Preserve migration 021.
- Ship and verify the in-app channel. Provider adapters, channel preferences and template editing are subsequent L4 slices.

## Review focus

- Two workers processing the same event create one inbox item, including retry after a transaction failure.
- A guest order has a real guest session and is skipped without blocking later customer events.
- Pagination remains stable when timestamps tie or newer notifications arrive.
- Every mutation enforces customer ownership and web session Origin/CSRF protection.
- Mark-all-read and message rendering preserve other customers' inboxes and safe order history.

## Task 1 — Restore the database verification baseline

Files: `apps/api/test/notification-inbox.spec.ts`, `apps/api/test/commerce-authority.spec.ts`, `apps/api/test/foundation.spec.ts`.

1. Reproduce PR #55's three failing PostgreSQL checks in a separate test database.
2. Give the guest fixture a real GuestCheckoutSession to satisfy Order_owner_xor.
3. Add the two implemented inbox routes to the exact OpenAPI route assertions.
4. Run those suites and commit the correction after the tests pass.

## Task 2 — Complete durable inbox behavior

Files: shared `packages/contracts/src/notifications.ts`, contract exports, `apps/api/src/notifications/*`, `apps/api/test/notification-inbox.spec.ts`, a follow-up migration, and production OpenAPI.

1. Write failing behavior cases for tied-time cursor pagination, malformed cursors, account isolation, read-all, cookie CSRF, concurrent projectors and atomic rollback. Add direct-database immutable snapshot and source ownership cases.
2. Implement strict shared notification response/cursor schemas. `list(userId, limit, cursor?)` returns existing fields plus `nextCursor`. Cursor selection always retains recipient ownership.
3. Add `markAllRead(userId, requestId)` and `POST /account/notifications/read-all`, with first-change audit evidence.
4. Add snapshot/receipt integrity in migration 022 and update concise event copy, including committed manual-provider delivery transitions.
5. Run focused PostgreSQL checks, regenerate OpenAPI twice, update exact path assertions and commit.

## Task 3 — Connect the account experience and background processing

Files: `packages/contracts/src/endpoints.ts`, shared cache tags, `src/services/client.ts`, operation registry, mock router, account layout, `src/app/(storefront)/account/notifications/page.tsx`, projector service/timer units, existing notification handoff and verification docs.

1. Add the three notification operations through the existing adapter boundary, with notification cache invalidation after successful reads.
2. Build the responsive account inbox with loading, empty and error states, unread count, mark-one/mark-all, refresh, cursor-based load-more and safe account-order links.
3. Add matching demo responses to preserve the existing mock transport. Verify adapter requests and shared schemas with behavioral tests.
4. Add a hardened oneshot projector service and one-minute timer using the API release and protected environment file. The timer is enabled during the coordinated UAT rollout after migration and API deployment.
5. Run full API integration/security checks and the existing frontend build/regression gates. Request one independent whole-branch review and fix important findings with focused regressions.
6. Push the completed PR, require both workflows to pass for its final commit and merge. Rehearse the migrations and account inbox on an isolated database, deploy the matching UAT API/web release with rollback, and verify the timer and account boundaries.
