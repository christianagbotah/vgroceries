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
  if (saved !== null) {
    // Never mint a new key over corrupted state: the original attempt may
    // have committed. A replacement key could create a second order.
    if (!validKey.test(saved)) throw new Error("The previous checkout identity is invalid. Please contact support before retrying.");
    return saved;
  }
  const uuid = newUuid();
  if (!validUuid.test(uuid)) throw new Error("Secure checkout identity is unavailable.");
  const key = `co_${uuid.replaceAll("-", "")}`;
  // Browser storage can be blocked or fail to persist without throwing.
  // Check the stored value before any checkout mutation can start.
  store.setItem(CHECKOUT_ATTEMPT_KEY, key);
  if (store.getItem(CHECKOUT_ATTEMPT_KEY) !== key) {
    throw new Error("Secure checkout identity could not be retained. Please enable browser storage before placing an order.");
  }
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
  // Some storage implementations silently ignore removeItem. Do not report a
  // fresh retry identity until removal is independently verified.
  if (store.getItem(CHECKOUT_ATTEMPT_KEY) !== null) {
    throw new Error("The previous checkout identity could not be cleared. Please contact support before retrying.");
  }
  return true;
}
