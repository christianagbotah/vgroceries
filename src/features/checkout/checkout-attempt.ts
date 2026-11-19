/**
 * Retain one checkout completion identity within the browser tab.
 *
 * The server scopes this Idempotency-Key to the authenticated customer or
 * guest session and the request hash. A lost response can therefore be
 * retried without allocating a second order or consuming stock twice.
 * Store only the random key here — never order/contact/payment details.
 */
export const CHECKOUT_ATTEMPT_KEY = "vg_checkout_attempt_v1";

export interface CheckoutAttemptStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const validKey = /^co_[0-9a-f]{32}$/;
const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function getOrCreateCheckoutAttemptKey(
  store: CheckoutAttemptStore,
  newUuid: () => string,
): string {
  const saved = store.getItem(CHECKOUT_ATTEMPT_KEY);
  if (saved && validKey.test(saved)) return saved;
  const uuid = newUuid();
  if (!validUuid.test(uuid)) throw new Error("Secure checkout identity is unavailable.");
  const key = `co_${uuid.replaceAll("-", "")}`;
  // Fail closed if tab storage is blocked. Reusing a fresh key on an
  // ambiguous network retry could otherwise create a duplicate order.
  store.setItem(CHECKOUT_ATTEMPT_KEY, key);
  return key;
}

export function clearCheckoutAttemptKey(store: CheckoutAttemptStore): void {
  store.removeItem(CHECKOUT_ATTEMPT_KEY);
}

/**
 * Only explicit, pre-commit checkout rejections permit a corrected request
 * to start with a new key. The production checkout command returns these
 * errors before committing its atomic order/reservation/idempotency record.
 *
 * Never release after an HTTP timeout, 5xx, authentication error or
 * IDEMPOTENCY_CONFLICT: any of those may leave an existing order to reconcile.
 */
const definitePreCommitRejections = new Set([
  "OUT_OF_STOCK",
  "PICKUP_FEE_CHANGED",
  "RULE_VIOLATION",
  "VALIDATION_FAILED",
]);

export function clearCheckoutAttemptAfterDefiniteRejection(
  store: CheckoutAttemptStore,
  errorCode: string,
): boolean {
  if (!definitePreCommitRejections.has(errorCode)) return false;
  clearCheckoutAttemptKey(store);
  return true;
}
