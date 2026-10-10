/**
 * Shared API contracts — common primitives.
 *
 * This package is deliberately FRAMEWORK-FREE: no Next.js, React, Prisma or
 * backend-only imports are allowed anywhere under `src/services/contracts/`.
 * The same files are intended to be consumed later by:
 *   - the Next.js web app (via `src/services/adapters/*`),
 *   - the NestJS production backend (as response shapes + validation rules),
 *   - future React Native (Expo) customer and rider apps.
 *
 * Conventions (mirrored from src/types/domain.ts):
 *  - IDs are stable strings with an entity prefix ("prd_", "var_", "ord_").
 *  - Timestamps are UTC ISO-8601 strings; "*Label" fields are pre-formatted
 *    display strings for the current locale (the raw value stays authoritative).
 *  - Money is an INTEGER number of GHS minor units (pesewas). No floats.
 *  - Stock quantities are decimal STRINGS (e.g. "1.5"); integers for
 *    piece-counted SKUs. Floating point is never stock authority.
 *  - Payment, fulfilment, delivery, return and refund states are separate
 *    dimensions and must never be collapsed into one field.
 */

/* ------------------------------------------------------------------ */
/* Transport envelope (current mock protocol; see docs/openapi.yaml    */
/* for the proposed /api/v1 REST rendering of the same contract)       */
/* ------------------------------------------------------------------ */

/** Successful response envelope returned by every mock operation. */
export interface ApiEnvelope<T> {
  ok: true;
  data: T;
}

/** Failure envelope. Transport-level HTTP status is mirrored in `status`. */
export interface ApiErrorEnvelope {
  ok: false;
  error: ApiErrorShape;
}

export type ApiAnyEnvelope<T> = ApiEnvelope<T> | ApiErrorEnvelope;

/** Machine-readable error payload shared by mock and REST adapters. */
export interface ApiErrorShape {
  /** Stable error code — the contract for programmatic handling. */
  code: ApiErrorCode | string;
  /** Human-readable explanation safe to show to a user. */
  message: string;
  /** Optional structured detail (e.g. per-line conflicts). */
  details?: unknown;
}

/**
 * Canonical error codes. The mock router throws these today; the production
 * REST API maps them onto HTTP statuses (see docs/API_CONTRACTS.md §Errors).
 */
export type ApiErrorCode =
  | "VALIDATION_FAILED" // 400 — request shape/semantic validation
  | "NOT_FOUND" // 404 — unknown resource
  | "UNAUTHENTICATED" // 401 — missing/expired credentials (future)
  | "FORBIDDEN" // 403 — role or ownership failure (future)
  | "CONFLICT" // 409 — stale state, e.g. price or stock changed
  | "OUT_OF_STOCK" // 409 — availability invariant failed
  | "RESERVATION_LOST" // 409 — hold expired/released before handover
  | "IDEMPOTENCY_CONFLICT" // 409 — same key, different input
  | "INVALID_INPUT" // 400 — malformed field
  | "RULE_VIOLATION" // 422 — business rule refused the transition
  | "BAD_RESPONSE" // 502 — unreadable upstream payload (adapter-level)
  | "NETWORK" // 0/503 — transport failure (adapter-level)
  | "INTERNAL"; // 500 — unexpected server fault

/* ------------------------------------------------------------------ */
/* Pagination, filtering, sorting                                      */
/* ------------------------------------------------------------------ */

/** Query parameters every list operation accepts. */
export interface ListQuery {
  /** Full-text search term (name, reference, phone — per resource). */
  q?: string;
  /** Page index; page 1 is the first page (default 1). */
  page?: number;
  /** Items per page (server clamps to its max, default 12–48 by resource). */
  perPage?: number;
}

/** Cursor-free page metadata returned by paged collections. */
export interface PageMeta {
  total: number;
  page: number;
  pages: number;
  perPage: number;
}

/** A paged collection. */
export interface Paged<T> extends PageMeta {
  items: T[];
}

/** Field + direction pair used by sorted admin lists. */
export interface SortSpec {
  field: string;
  direction: "asc" | "desc";
}

/* ------------------------------------------------------------------ */
/* Idempotency                                                         */
/* ------------------------------------------------------------------ */

/**
 * Retry-safety contract. Checkout/POS currently replay stored keys; the
 * backend must implement durable replay for every operation it declares
 * retryable. Forwarding a key alone does not provide this guarantee:
 *  - same key + same input  → replay the ORIGINAL result, no new side effect;
 *  - same key + new input   → IDEMPOTENCY_CONFLICT, nothing applied;
 *  - new key                → normal execution.
 *
 * Over HTTP the key travels as the `Idempotency-Key` header (REST) or the
 * `idempotencyKey` body field (current mock operations).
 */
export type IdempotencyKey = string;

/** Request options every mutating operation understands. */
export interface MutationMeta {
  idempotencyKey?: IdempotencyKey;
  /** Actor executing the operation (future: derived from the session). */
  actor?: string;
}

/* ------------------------------------------------------------------ */
/* Cache invalidation tags                                             */
/* ------------------------------------------------------------------ */

/**
 * Cache-refresh contract. The client adapter caches GET responses (default
 * TTL 0 = no-store) tagged with these resource families. A successful
 * mutation declares which families it invalidates; matching cached entries
 * are dropped and a `vg:cache-invalidated` window event is emitted so any
 * mounted screen can refetch. See src/services/operation-registry.ts.
 */
export type CacheTag =
  | "catalog" // product availability / prices
  | "stock" // lots, movements, inventory overview
  | "orders" // order lists, status, fulfilment queues
  | "payments" // attempts, refunds, reconciliation
  | "returns" // return requests + refundable balances
  | "delivery" // dispatch queue, rider jobs
  | "sessions" // cashier sessions
  | "config" // settings, zones, slots
  | "ai" // suggestions
  | "*"; // everything (demo reset)

/** Payload of the `vg:cache-invalidated` window event. */
export interface CacheInvalidationEvent {
  tags: CacheTag[];
  operation: string;
  at: string;
}
