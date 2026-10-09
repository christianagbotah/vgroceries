/**
 * Service adapter boundary — the explicit interface every screen uses.
 *
 * All storefront, account, staff, POS, dispatch and rider screens obtain
 * business data through `ServiceAdapter.request()`:
 *
 *   client components → resolveClientAdapter()  (HTTP → mock route or API)
 *   server components → resolveServerAdapter()  (in-process mock or API)
 *
 * Two implementations exist:
 *   - HttpServiceAdapter  — production adapter, configurable base URL,
 *     Idempotency-Key header, envelope + problem/json error handling.
 *   - MockServiceAdapter  — development-only, calls the in-process mock
 *     router directly (no network hop).
 *
 * Swapping to the NestJS backend = setting an env var; pages never change.
 * See docs/API_CONTRACTS.md.
 */

import type { CacheTag } from "../contracts/common";

/** Query parameter value as accepted by adapters. */
export type QueryValue = string | number | boolean | undefined | null;

/** One service call, transport-agnostic. */
export interface ServiceRequest {
  /** Dot-namespaced operation, e.g. "checkout.complete". */
  op: string;
  query?: Record<string, QueryValue>;
  /** Present ⇒ mutating operation (POST). */
  body?: Record<string, unknown>;
  /** Sent as the `Idempotency-Key` header over HTTP. */
  idempotencyKey?: string;
  /** Response families to invalidate after a successful mutation. */
  invalidates?: CacheTag[];
  /** Skip the request-body schema validation (used by contract tests). */
  skipValidation?: boolean;
}

/**
 * Transport error thrown by every adapter. Carries the canonical
 * `code` from src/services/contracts/common.ts so screens can branch on
 * stable semantics (e.g. OUT_OF_STOCK) instead of HTTP statuses.
 */
export class ApiError extends Error {
  code: string;
  details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

/** The service interface. Implementations must be safe to share per runtime. */
export interface ServiceAdapter {
  /** Unique name for diagnostics (e.g. "http:https://api…", "mock"). */
  readonly kind: string;
  request<T = unknown>(req: ServiceRequest): Promise<T>;
}
