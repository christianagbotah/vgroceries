/**
 * Development-only mock service adapter.
 *
 * Executes operations in-process against the seeded mock router
 * (src/services/mock/router.ts) — no network hop, no serialization. Used by
 * server-rendered pages during development and by the production build's
 * prerender phase so the prototype stays self-contained.
 *
 * ⚠ PROTOTYPE BOUNDARY — never wire this adapter to a production deployment:
 * the mock keeps all state in process memory and enforces no authentication.
 * Production selects the real backend with `API_BASE_URL` (server) /
 * `NEXT_PUBLIC_API_BASE_URL` (browser); when neither is set, a production
 * bundle falls back here with a one-time warning purely so the demo remains
 * demonstrable. See docs/HANDOFF_FIXES.md.
 */

import { handleApi } from "../mock/router";
import { ApiError, normalizedRequestBody, type ServiceAdapter, type ServiceRequest } from "./types";
import { validateRequest } from "../contracts/validation";

let warnedPrototypeMode = false;

export class MockServiceAdapter implements ServiceAdapter {
  readonly kind = "mock";

  async request<T = unknown>(req: ServiceRequest): Promise<T> {
    if (process.env.NODE_ENV === "production" && process.env.VG_ALLOW_MOCK_IN_PRODUCTION !== "1" && !warnedPrototypeMode) {
      warnedPrototypeMode = true;
      // Loud, one-time, honest: this bundle has no real backend selected.
      console.warn(
        "[vgroceries] PROTOTYPE MODE: no API_BASE_URL configured — server rendering is using the in-memory mock service. Set API_BASE_URL to the production backend."
      );
    }

    const normalizedBody = normalizedRequestBody(req);
    if (normalizedBody !== undefined && !req.skipValidation) {
      const checked = validateRequest(req.op, normalizedBody);
      if (!checked.ok) {
        throw new ApiError("VALIDATION_FAILED", `Invalid request for ${req.op}: ${checked.issues.join("; ")}`);
      }
    }

    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
    }

    // The mock engines read idempotency keys from the body; surface the
    // header-style key there so both transports behave identically.
    const body = normalizedBody ?? {};

    const result = await handleApi({
      path: req.op,
      method: normalizedBody !== undefined ? "POST" : "GET",
      query,
      body,
    });

    const json = result.json as { ok?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } };
    if (result.status !== 200 || !json?.ok) {
      throw new ApiError(json?.error?.code ?? "INTERNAL", json?.error?.message ?? `Service request failed: ${req.op}`, json?.error?.details);
    }
    return json.data as T;
  }
}

/** Exported for the dev API route and server-data to share the same engine. */
export { handleApi };
