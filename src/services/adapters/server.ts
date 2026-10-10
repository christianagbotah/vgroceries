/**
 * Server-side adapter resolution (server components / route handlers).
 *
 * Resolution order:
 *   1. API_BASE_URL (server env)  → HttpServiceAdapter(production API) —
 *      server rendering then goes over HTTP like any other API client,
 *      preserving SEO while reading authoritative data.
 *   2. unset                       → MockServiceAdapter (development-only,
 *      in-process; a production build warns loudly — prototype mode).
 *
 * Both renderers produce identical output because both adapters implement
 * the same operation contracts (src/services/contracts).
 */

import { HttpServiceAdapter } from "./http";
import { MockServiceAdapter } from "./mock";
import { ApiError, type ServiceAdapter } from "./types";

let serverAdapter: ServiceAdapter | undefined;

/** The adapter used by server components (src/services/server-data.ts). */
export function resolveServerAdapter(): ServiceAdapter {
  if (Boolean(process.env.API_BASE_URL) !== Boolean(process.env.NEXT_PUBLIC_API_BASE_URL)) {
    throw new ApiError("CONFIGURATION_ERROR", "Configure both API_BASE_URL and NEXT_PUBLIC_API_BASE_URL to select the same backend mode.");
  }
  if (serverAdapter) return serverAdapter;
  const base = process.env.API_BASE_URL;
  serverAdapter = base
    ? new HttpServiceAdapter(base, {
        kind: "http:api-server",
        headers: (): Record<string, string> => {
          // Future: server-to-server auth (service token / mTLS) — see
          // docs/BACKEND_ARCHITECTURE.md §Identity.
          const token = process.env.API_SERVICE_TOKEN;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      })
    : new MockServiceAdapter();
  return serverAdapter;
}
