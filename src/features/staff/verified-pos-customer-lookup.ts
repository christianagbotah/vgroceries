import {
  posCustomerSearchQuerySchema,
  posCustomerSearchResultSchema,
  type PosCustomerSearchItem,
} from "@/services/contracts";
import { ApiError } from "@/services/adapters/types";
import { isDemoStaffSessionActive } from "./staff-demo-session";

export const posCustomerLookupUatEnabled =
  process.env.NEXT_PUBLIC_POS_CUSTOMER_LOOKUP_UAT === "1";

/**
 * No mock-account fallback: a customer directory is private account data.
 * An explicit frontend flag and the independent backend flag are BOTH needed.
 */
export function assertRealPosCustomerLookup(
  options: { enabled: boolean; demo: boolean; apiBase: string | undefined },
) {
  if (!options.enabled) throw new ApiError("FEATURE_DISABLED", "Registered-customer lookup is disabled.");
  if (options.demo) throw new ApiError("DEMO_ONLY", "Demo staff cannot search real customer accounts.");
  if (!options.apiBase?.trim())
    throw new ApiError("BAD_CONFIG", "A real POS API is required for customer search.");

  let base: URL;
  try {
    base = new URL(options.apiBase);
  } catch {
    throw new ApiError("BAD_CONFIG", "The configured POS API address is invalid.");
  }
  if (!["http:", "https:"].includes(base.protocol) ||
      (base.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) ||
      !/^\/api\/v1\/?$/.test(base.pathname) || base.username || base.password ||
      base.search || base.hash) {
    throw new ApiError("BAD_CONFIG", "Customer search requires a trusted HTTPS API /api/v1 endpoint.");
  }
}

export function parsePosCustomerMatches(input: unknown): PosCustomerSearchItem[] {
  const result = posCustomerSearchResultSchema.safeParse(input);
  if (!result.success) throw new ApiError(
    "BAD_RESPONSE",
    "Customer search returned an unexpected result. Nothing was selected.",
  );
  return result.data;
}

export async function searchVerifiedPosCustomers(query: string): Promise<PosCustomerSearchItem[]> {
  assertRealPosCustomerLookup({
    enabled: posCustomerLookupUatEnabled,
    demo: isDemoStaffSessionActive(),
    apiBase: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
  const parsed = posCustomerSearchQuerySchema.safeParse(query);
  if (!parsed.success)
    throw new ApiError("VALIDATION_FAILED", "Enter 2–80 characters to search registered customers.");
  // Lazy-load the browser client only for an explicitly authorised search.
  // This avoids initialising the browser cache on pure validation imports.
  // The shared browser adapter supplies real cookies, no-store and timeout.
  // The server rechecks current staff grants, branch scope and rate limits.
  const { api } = await import("@/services/client");
  const payload = await api<unknown>("cashier.pos.customers", { query: { q: parsed.data } });
  return parsePosCustomerMatches(payload);
}
