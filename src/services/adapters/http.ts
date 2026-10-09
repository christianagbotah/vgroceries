/**
 * HTTP service adapter — the production client.
 *
 * Talks to any base URL that renders the service contract:
 *   - today: the Next.js dev mock route (`/api/mock/v1`) — same envelope;
 *   - production: the NestJS API (e.g. https://api.varietygrocery.com/api/v1)
 *     selected via NEXT_PUBLIC_API_BASE_URL (browser) / API_BASE_URL (server).
 *
 * Behaviour:
 *   - GET for reads, POST for mutations (body present).
 *   - `Idempotency-Key` header when the caller passes one.
 *   - Request bodies are validated against the shared zod schemas
 *     (src/services/contracts/validation.ts) BEFORE the request is sent.
 *   - Accepts both the current `{ok,data|error}` envelope and RFC 7807
 *     `application/problem+json` from the future REST backend; both are
 *     normalised into `ApiError` with canonical codes.
 *   - Transport failures and unreadable payloads raise NETWORK / BAD_RESPONSE.
 *   - 20s timeout per request via AbortController.
 */

import { ApiError, type ServiceAdapter, type ServiceRequest } from "./types";
import { validateRequest } from "../contracts/validation";

const REQUEST_TIMEOUT_MS = 20_000;

function buildUrl(base: string, req: ServiceRequest): string {
  const method = req.body !== undefined ? "POST" : "GET";
  // Mock operations use "." namespaces; the dev route maps them to "/".
  // A REST base URL receives the same path form (see docs/API_CONTRACTS.md §Mapping).
  const suffix = req.op.replace(/\./g, "/");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return `${base.replace(/\/$/, "")}/${suffix}${method === "GET" && s ? `?${s}` : ""}`;
}

export class HttpServiceAdapter implements ServiceAdapter {
  readonly kind: string;
  private readonly base: string;
  /** Extra header injection hook (auth bearer, trace ids, …). */
  private readonly headers?: () => Record<string, string>;

  constructor(base: string, opts: { headers?: () => Record<string, string>; kind?: string } = {}) {
    this.base = base;
    this.headers = opts.headers;
    this.kind = opts.kind ?? `http:${base}`;
  }

  async request<T = unknown>(req: ServiceRequest): Promise<T> {
    const method = req.body !== undefined ? "POST" : "GET";

    if (method === "POST" && !req.skipValidation) {
      const checked = validateRequest(req.op, req.body ?? {});
      if (!checked.ok) {
        throw new ApiError("VALIDATION_FAILED", `Invalid request for ${req.op}: ${checked.issues.join("; ")}`);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(buildUrl(this.base, req), {
        method,
        headers: {
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
          ...(req.idempotencyKey ? { "Idempotency-Key": req.idempotencyKey } : {}),
          ...(this.headers?.() ?? {}),
        },
        body: method === "POST" ? JSON.stringify(req.body ?? {}) : undefined,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted = err instanceof DOMException && err.name === "AbortError";
      throw new ApiError(
        "NETWORK",
        aborted ? `Request to ${req.op} timed out.` : "Could not reach the service. Check your connection and try again."
      );
    }
    clearTimeout(timer);

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiError("BAD_RESPONSE", "The service returned an unreadable response.");
    }

    // Current mock envelope: {ok:true,data} | {ok:false,error{code,message}}
    if (typeof json === "object" && json !== null && "ok" in json) {
      const env = json as { ok?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } };
      if (res.ok && env.ok && env.error === undefined) return env.data as T;
      if (env.error) {
        throw new ApiError(env.error.code ?? `HTTP_${res.status}`, env.error.message ?? "Request failed.", env.error.details);
      }
      throw new ApiError(`HTTP_${res.status}`, "Request failed.");
    }

    // Future REST rendering: RFC 7807 problem+json or bare resource on 2xx.
    if (res.ok) return json as T;
    const problem = json as { title?: string; detail?: string; type?: string };
    throw new ApiError(problem.type ?? `HTTP_${res.status}`, problem.detail ?? problem.title ?? "Request failed.");
  }
}
