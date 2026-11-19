/**
 * Real rider cash evidence only. Separate from legacy demo rider operations.
 * The trusted backend remains the only source for rider identity, job amounts,
 * cash declaration uniqueness, and the disabled-by-default feature gate.
 */
import {
  riderJobsResponseSchema, codCashDeclarationRequestSchema,
  codCashDeclarationViewSchema,
  type ProductionRiderJobsResponse, type CodCashDeclarationRequest,
  type CodCashDeclarationView,
} from "@/services/contracts";
import { ApiError } from "@/services/adapters/types";
import { getBrowserCsrfToken } from "@/services/adapters/browser";
import { isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";

export const verifiedRiderCodEnabled = process.env.NEXT_PUBLIC_VERIFIED_RIDER_COD_D1 === "1";

export function assertVerifiedRiderCodEnvironment(options: {
  enabled: boolean; demo: boolean; apiBase?: string;
}): void {
  if (!options.enabled) throw new ApiError("FEATURE_DISABLED", "Verified rider COD declarations are disabled.");
  if (options.demo) throw new ApiError("FORBIDDEN", "Demo identities cannot access real rider COD records.");
  if (!options.apiBase) throw new ApiError("BAD_CONFIG", "A trusted production API connection is required.");
  let uri: URL;
  try { uri = new URL(options.apiBase); }
  catch { throw new ApiError("BAD_CONFIG", "A valid trusted API URL is required."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname);
  if ((uri.protocol !== "https:" && !(local && uri.protocol === "http:")) ||
      !/^\/api\/v1\/?$/.test(uri.pathname) || uri.username || uri.password ||
      uri.search || uri.hash) {
    throw new ApiError("BAD_CONFIG", "Only an HTTPS /api/v1 authority is permitted.");
  }
}

export function verifyRiderCodEnvironment() {
  assertVerifiedRiderCodEnvironment({
    enabled: verifiedRiderCodEnabled,
    demo: isDemoStaffSessionActive(),
    apiBase: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
}

function responseError(status: number): ApiError {
  if (status === 401 || status === 403)
    return new ApiError("FORBIDDEN", "A genuine signed-in rider session is required.");
  if (status === 404)
    return new ApiError("NOT_FOUND", "The authorized COD operation or assigned delivery was not found.");
  if (status === 409)
    return new ApiError("CONFLICT", "This COD delivery is already declared or no longer eligible. Please contact the dispatcher; no second record was made.");
  if (status === 422)
    return new ApiError("RULE_VIOLATION", "The recorded cash amount does not equal the original order total.");
  if (status === 503)
    return new ApiError("FEATURE_DISABLED", "COD declaration is not activated on this API.");
  return new ApiError("UNAVAILABLE", "The server could not verify the operation. Do not assume the cash declaration was saved.");
}

async function safeJson(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { throw new ApiError("BAD_RESPONSE", "The server returned an unreadable COD record."); }
}

/** Reads real session-scoped delivered jobs. No mock or browser rider ID. */
export async function getVerifiedRiderCodHistory(signal?: AbortSignal): Promise<ProductionRiderJobsResponse> {
  verifyRiderCodEnvironment();
  const response = await fetch("/api/v1/rider/jobs?scope=history", {
    method: "GET", credentials: "include", cache: "no-store",
    headers: { Accept: "application/json" }, signal,
  });
  if (!response.ok) throw responseError(response.status);
  const envelope = await safeJson(response);
  if (!envelope || typeof envelope !== "object" || !("ok" in envelope) ||
      envelope.ok !== true || !("data" in envelope))
    throw new ApiError("BAD_RESPONSE", "The rider history response could not be verified.");
  const parsed = riderJobsResponseSchema.safeParse(envelope.data);
  if (!parsed.success) throw new ApiError("BAD_RESPONSE", "The real rider history did not match its contract.");
  return parsed.data;
}

/**
 * Submits only when a real server-owned delivered COD job is selected.
 * A retry uses the same key when the request body is unchanged.
 */
export async function declareVerifiedRiderCod(
  jobId: string, request: CodCashDeclarationRequest, replayKey: string,
): Promise<CodCashDeclarationView> {
  verifyRiderCodEnvironment();
  if (!jobId || jobId.length > 128 || !/^[A-Za-z0-9:_-]{8,128}$/.test(replayKey))
    throw new ApiError("VALIDATION_FAILED", "A valid delivery and retry key are required.");
  const parsed = codCashDeclarationRequestSchema.safeParse(request);
  if (!parsed.success) throw new ApiError("VALIDATION_FAILED", "Confirm the exact cash, custody and a written note.");
  const csrf = getBrowserCsrfToken();
  if (!csrf) throw new ApiError("UNAUTHENTICATED", "The real rider session must be refreshed before cash can be declared.");
  const response = await fetch(`/api/v1/rider/jobs/${encodeURIComponent(jobId)}/cod-cash-declaration`, {
    method: "POST", credentials: "include", cache: "no-store", redirect: "error",
    headers: {
      "Content-Type": "application/json", Accept: "application/json",
      "X-CSRF-Token": csrf, "Idempotency-Key": replayKey,
    },
    body: JSON.stringify(parsed.data),
  });
  if (!response.ok) throw responseError(response.status);
  const envelope = await safeJson(response);
  if (!envelope || typeof envelope !== "object" || !("ok" in envelope) ||
      envelope.ok !== true || !("data" in envelope))
    throw new ApiError("BAD_RESPONSE", "Cash declaration response could not be verified.");
  const saved = codCashDeclarationViewSchema.safeParse(envelope.data);
  if (!saved.success || saved.data.deliveryJobId !== jobId ||
      saved.data.amountMinor !== parsed.data.amountMinor || saved.data.supervisorVerified ||
      saved.data.remitted || saved.data.paymentStatusChanged)
    throw new ApiError("BAD_RESPONSE", "Cash declaration proof was invalid. Contact the supervisor; do not resubmit with another key.");
  return saved.data;
}
