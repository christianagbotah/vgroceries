import {
  cashierTillListSchema,
  posQuoteRequestSchema,
  posQuoteViewSchema,
  type AdminProductRow,
  type CashierTillSessionView,
  type PosQuoteView,
} from "@/services/contracts";
import { ApiError } from "@/services/adapters/types";
import { isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";

export const verifiedPosQuoteUatEnabled =
  process.env.NEXT_PUBLIC_VERIFIED_POS_QUOTE_UAT === "1";

export function assertVerifiedPosQuoteUat(options: {
  enabled: boolean;
  demo: boolean;
  apiBase: string | undefined;
}): void {
  if (!options.enabled)
    throw new ApiError("FEATURE_DISABLED", "Verified POS quote preview is disabled.");
  if (options.demo)
    throw new ApiError("DEMO_ONLY", "Demo accounts cannot read real POS till or inventory data.");
  if (!options.apiBase)
    throw new ApiError("BAD_CONFIG", "A real POS API connection is required.");

  let url: URL;
  try { url = new URL(options.apiBase); }
  catch { throw new ApiError("BAD_CONFIG", "Invalid POS API URL."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      !/^\/api\/v1\/?$/.test(url.pathname) || url.username || url.password ||
      url.search || url.hash) {
    throw new ApiError("BAD_CONFIG", "Only a trusted HTTPS /api/v1 API is supported.");
  }
}

function verifyEnvironment(): void {
  assertVerifiedPosQuoteUat({
    enabled: verifiedPosQuoteUatEnabled,
    demo: isDemoStaffSessionActive(),
    apiBase: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
}

export function validatePosQuoteLines(input: unknown): {
  sessionId: string;
  lines: { variantId: string; quantity: string }[];
} {
  const parsed = posQuoteRequestSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(
    "VALIDATION_FAILED",
    "Select an open till and 1–100 distinct products with valid positive quantities.",
  );
  const ids = new Set(parsed.data.lines.map(line => line.variantId));
  if (ids.size !== parsed.data.lines.length ||
      parsed.data.lines.some(line => Number(line.quantity) <= 0)) {
    throw new ApiError("VALIDATION_FAILED", "Use a positive quantity and only one line per variant.");
  }
  return parsed.data;
}

export async function getVerifiedPosPreviewData(): Promise<{
  tills: CashierTillSessionView[];
  enabled: boolean;
  products: AdminProductRow[];
}> {
  verifyEnvironment();
  // Lazy import keeps private-client caching state out of pure validation tests.
  const { api } = await import("@/services/client");
  const [rawTills, products] = await Promise.all([
    api<unknown>("pos.verified.tills"),
    api<AdminProductRow[]>("admin.products"),
  ]);
  const result = cashierTillListSchema.safeParse(rawTills);
  if (!result.success || !Array.isArray(products))
    throw new ApiError("BAD_RESPONSE", "The till or catalogue response could not be verified.");
  return { tills: result.data.sessions, enabled: result.data.enabled, products };
}

/**
 * The POST endpoint is a read-only pricing calculation.
 * It cannot reserve stock, complete a sale, or create a payment.
 */
export async function previewVerifiedPosQuote(input: unknown): Promise<PosQuoteView> {
  verifyEnvironment();
  const request = validatePosQuoteLines(input);
  const { api } = await import("@/services/client");
  const raw = await api<unknown>("pos.verified.quote", {
    body: request as unknown as Record<string, unknown>,
  });
  const result = posQuoteViewSchema.safeParse(raw);
  if (!result.success || result.data.sessionId !== request.sessionId ||
      !result.data.quoteOnly || result.data.stockReserved ||
      result.data.orderCreated || result.data.paymentVerified) {
    throw new ApiError("BAD_RESPONSE", "The server returned an unsafe or mismatched POS preview.");
  }
  return result.data;
}
