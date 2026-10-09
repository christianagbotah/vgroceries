/**
 * Browser-side adapter resolution + cache-refresh behaviour.
 *
 * Resolution order (client components):
 *   1. NEXT_PUBLIC_API_BASE_URL  → HttpServiceAdapter(production REST API)
 *   2. unset                     → HttpServiceAdapter("/api/mock/v1") — the
 *      development mock route served by this Next.js app. When the NestJS
 *      backend lands, only this env var changes; screens are untouched.
 *
 * Cache-refresh contract (contracts/common.ts):
 *   - GET responses may be cached per (op, query) for VG_CACHE_TTL_MS
 *     (default 0 = always no-store, correct for a live-stock prototype);
 *   - a successful mutation drops cached entries whose tags intersect the
 *     mutation's `invalidates` families and dispatches the
 *     `vg:cache-invalidated` CustomEvent so mounted screens refetch;
 *   - `demo.reset` invalidates everything.
 */

import { HttpServiceAdapter } from "./http";
import { ApiError, type ServiceAdapter, type ServiceRequest } from "./types";
import { invalidatesTags, readTags } from "../operation-registry";
import type { CacheInvalidationEvent, CacheTag } from "../contracts/common";

export const CACHE_INVALIDATED_EVENT = "vg:cache-invalidated";

interface CacheEntry {
  at: number;
  value: unknown;
}

const TTL_MS = Number(process.env.NEXT_PUBLIC_CACHE_TTL_MS ?? 0) || 0;
const cache = new Map<string, CacheEntry>();

function cacheKey(req: ServiceRequest): string {
  const q = Object.entries(req.query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort()
    .join("&");
  return `${req.op}${q ? `?${q}` : ""}`;
}

function dropTagged(tags: CacheTag[]): void {
  if (tags.includes("*")) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    const entry = cache.get(key);
    if (entry && Array.isArray((entry as CacheEntry & { tags?: CacheTag[] }).tags)) {
      const entryTags = (entry as CacheEntry & { tags: CacheTag[] }).tags;
      if (entryTags.some((t) => tags.includes(t))) cache.delete(key);
    }
  }
}

class CachingBrowserAdapter implements ServiceAdapter {
  readonly kind: string;
  private readonly inner: ServiceAdapter;

  constructor(inner: ServiceAdapter) {
    this.inner = inner;
    this.kind = inner.kind;
  }

  async request<T = unknown>(req: ServiceRequest): Promise<T> {
    const isMutation = req.body !== undefined;
    if (!isMutation && TTL_MS > 0 && readTags(req.op).length > 0) {
      const key = cacheKey(req);
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
      const value = await this.inner.request<T>(req);
      cache.set(key, { at: Date.now(), value, tags: readTags(req.op) } as CacheEntry & { tags: CacheTag[] });
      return value;
    }
    const value = await this.inner.request<T>(req);
    if (isMutation) {
      const tags = req.invalidates ?? invalidatesTags(req.op);
      if (tags.length > 0) {
        dropTagged(tags);
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(
            new CustomEvent<CacheInvalidationEvent>(CACHE_INVALIDATED_EVENT, {
              detail: { tags, operation: req.op, at: new Date().toISOString() },
            })
          );
        }
      }
    }
    return value;
  }

  /** Test/demo hook: wipe the client cache. */
  clearCache(): void {
    cache.clear();
  }
}

let browserAdapter: ServiceAdapter | undefined;

/**
 * The adapter used by client components (src/services/client.ts).
 * Single instance per browser tab.
 */
export function resolveClientAdapter(): ServiceAdapter {
  if (browserAdapter) return browserAdapter;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (base) {
    browserAdapter = new CachingBrowserAdapter(
      new HttpServiceAdapter(base, {
        kind: "http:api",
        headers: (): Record<string, string> => {
          // Future: attach the bearer/session token here — see
          // docs/MOBILE_READINESS.md §Authentication.
          const token = typeof window !== "undefined" ? window.localStorage.getItem("vg.api_token") : null;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      })
    );
  } else {
    // Development: this app's own versioned mock route.
    browserAdapter = new CachingBrowserAdapter(new HttpServiceAdapter("/api/mock/v1", { kind: "http:mock-route" }));
  }
  return browserAdapter;
}

export { ApiError };
