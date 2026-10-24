# Hubtel, Paystack and eTranzact Payment Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Hubtel, Paystack and eTranzact into Variety Groceries' existing NestJS Payments Authority and replace the storefront's demo payment roleplay with real provider initiation.

**Architecture:** Keep the existing provider-neutral PaymentProviderAdapter/RefundProviderAdapter boundaries and single-active-provider configuration. Production startup creates configured adapters from protected environment bundles. Provider callbacks never directly grant payment authority unless cryptographically verified; lookup-required callbacks are reconciled server-side.

**Tech Stack:** NestJS/TypeScript, Prisma, PostgreSQL, Next.js/React, Node 24 fetch/crypto.

**Spec:** `docs/superpowers/specs/2026-10-24-payment-providers-design.md`

## Global Constraints
- Server-owned Order amount/currency/provider authority only.
- GHS only; no browser-authored amount/provider authority.
- No provider secrets in frontend, logs, responses or Git.
- Keep HTTPS hosted-domain allowlisting.
- Preserve idempotency, callback dedupe, reconciliation and Order -> PaymentAttempt lock order.
- Do not fabricate Hubtel/eTranzact refund APIs.

## Review Focus
- Duplicate payment initiation after lost provider response must not double-charge.
- Forged callback/signature/checksum must never mark payment succeeded.
- Provider response with wrong reference, amount or currency must go to exception/review rather than success.
- Hosted redirect/form target outside the configured HTTPS allowlist must be rejected.
- Guest/customer checkout must start payment without exposing credentials and must survive reload/replay.

---

### Task 1: Provider configuration and customer identity inputs
**Files:** `apps/api/src/config.ts`, `apps/api/src/payments/payment-provider.ts`, `apps/api/src/payments/payment-initiation.service.ts`, tests under `apps/api/test/`.
**Interfaces:** Produces provider-specific protected config and `payerName`/`payerEmail` in `PaymentProviderInitiationInput`.
- [ ] Add failing config and initiation tests.
- [ ] Parse only the selected provider's complete credential bundle; reject partial bundles and unsafe HTTP production endpoints.
- [ ] Pass order customer name/email/phone to provider adapter server-side.
- [ ] Run focused tests and commit.

### Task 2: Paystack payment + refund adapter
**Files:** create `apps/api/src/payments/providers/paystack.ts`, provider tests, startup factory.
**Interfaces:** Produces `PaystackPaymentAdapter` and `PaystackRefundAdapter` plus production adapter factory.
- [ ] Write failing tests for initialize, verify lookup, HMAC-SHA512 webhook, amount/currency/reference mapping, and refund create/lookup.
- [ ] Implement backend transaction initialization using the merchant reference and server amount; return hosted redirect.
- [ ] Implement webhook verification and verify-transaction lookup.
- [ ] Implement documented Paystack refund API adapter.
- [ ] Run payment/refund regressions and commit.

### Task 3: Hubtel payment adapter with verified lookup gate
**Files:** create `apps/api/src/payments/providers/hubtel.ts`, tests and config docs.
**Interfaces:** Produces `HubtelPaymentAdapter`; no fabricated refund adapter.
- [ ] Write failing tests for Basic auth, request-money/paylink mapping, callback lookup-required behavior, and configured status lookup normalization.
- [ ] Implement hosted paylink initiation and lookup through the merchant-configured official status endpoint.
- [ ] Ensure readiness remains closed for selected Hubtel until an official refund adapter is configured.
- [ ] Run focused tests and commit.

### Task 4: eTranzact WebConnect adapter + form-post action
**Files:** `packages/contracts/src/payments.ts`, create `apps/api/src/payments/providers/etranzact.ts`, `apps/api/src/bootstrap.ts`, checkout/status UI and tests.
**Interfaces:** Produces strict `form_post` provider action with HTTPS URL and server-generated fields.
- [ ] Write RED contract/provider/UI tests for WebConnect checksum, callback checksum, query mapping, raw form callback parsing and auto-submit form action.
- [ ] Extend provider action contract/policy to validate HTTPS form target and scalar hidden fields.
- [ ] Implement WebConnect initiate/verify/query adapter using configured merchant URLs/terminal/secret.
- [ ] Accept narrowly scoped raw `application/x-www-form-urlencoded` provider callbacks without weakening JSON endpoints.
- [ ] Render form_post safely in checkout status.
- [ ] Run focused tests and commit.

### Task 5: Production wiring and real checkout initiation
**Files:** `apps/api/src/main.ts`, provider factory/config docs, `src/services/client.ts`, `src/app/(storefront)/checkout/status/[id]/page.tsx`, endpoint/operation mappings, tests.
**Interfaces:** Production main injects real configured adapters; storefront invokes `payments.initiate` once per order with durable idempotency.
- [ ] Write RED tests proving the status page no longer contains demo outcome buttons and handles redirect/form/prompt actions.
- [ ] Add client operation for payment attempt initiation.
- [ ] Automatically initialize electronic payment once, persist/reuse the idempotency key across reload, and redirect/form-submit only from server response.
- [ ] Add provider configuration documentation without credentials.
- [ ] Run full payment, foundation, checkout and frontend regression gates; build API + Next app; commit.

### Task 6: Release readiness gate
**Files:** no new authority unless a failing verification requires correction.
- [ ] Verify all provider tests, existing payment/refund/concurrency suites, lint, API build, Next production build and `git diff --check`.
- [ ] Verify no secret-shaped values are committed.
- [ ] Keep production payments disabled unless valid merchant credentials are present; deploy code only after green smoke tests.
