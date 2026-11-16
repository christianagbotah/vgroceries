import { ApiError } from "./adapters/types";

/** Exact fail-closed API challenge returned before guest checkout can mutate stock. */
export const FRESH_GUEST_CAPABILITY_MESSAGE =
  "A fresh guest checkout capability was issued. Retry with its CSRF token.";

/**
 * The API issues a readable, scoped vg_guest_csrf cookie in addition to
 * its HttpOnly session cookie. Do not persist this token in localStorage,
 * sessionStorage, logs, request bodies or URLs.
 */
export function guestCheckoutCsrfFromCookie(cookieString: string): string | undefined {
  for (const entry of cookieString.split(";")) {
    const part = entry.trim();
    if (!part.startsWith("vg_guest_csrf=")) continue;
    const encoded = part.slice("vg_guest_csrf=".length);
    try {
      const token = decodeURIComponent(encoded);
      return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function readGuestCheckoutCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  try { return guestCheckoutCsrfFromCookie(document.cookie); }
  catch { return undefined; }
}

/**
 * A newly issued capability is a guaranteed pre-mutation 403, not an
 * ambiguous HTTP failure. Retry at most ONCE using the same operation,
 * original body and Idempotency-Key. All other failures propagate.
 */
export async function withFreshGuestCheckoutRetry<T>(
  placeOnce: () => Promise<T>,
  readNewGuestToken: () => string | undefined = readGuestCheckoutCsrfToken,
): Promise<T> {
  try {
    return await placeOnce();
  } catch (error) {
    if (!(error instanceof ApiError) ||
      error.code !== "FORBIDDEN" ||
      error.message !== FRESH_GUEST_CAPABILITY_MESSAGE) {
      throw error;
    }
    if (!readNewGuestToken()) {
      throw new ApiError(
        "FORBIDDEN",
        "Guest checkout could not establish a secure session. Allow first-party cookies and try again.",
      );
    }
    // This first 403 was issued before checkout-command.service ran.
    // A second failure is surfaced directly, with NO further retries.
    return placeOnce();
  }
}
