/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CHECKOUT_ATTEMPT_KEY,
  clearCheckoutAttemptKey,
  clearCheckoutAttemptAfterDefiniteRejection,
  getOrCreateCheckoutAttemptKey,
  type CheckoutAttemptStore,
} from "../src/features/checkout/checkout-attempt";

function makeStore() {
  const items = new Map<string, string>();
  const store: CheckoutAttemptStore = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
    removeItem: (key) => { items.delete(key); },
  };
  return { items, store };
}

const firstUuid = "60ad3212-4f17-4f52-94a4-a064fd32e9fb";
const secondUuid = "f5224c80-0c1b-41ab-8380-b43c665a0038";

describe("checkout completion retry safety", () => {
  test("retries and tab reloads use exactly the same server idempotency key", () => {
    const { store } = makeStore();
    let calls = 0;
    const create = () => { calls++; return firstUuid; };
    const first = getOrCreateCheckoutAttemptKey(store, create);
    expect(first).toBe("co_60ad32124f174f5294a4a064fd32e9fb");
    expect(getOrCreateCheckoutAttemptKey(store, create)).toBe(first);
    expect(calls).toBe(1);
  });

  test("verified order completion clears the marker for a new checkout", () => {
    const { store } = makeStore();
    const first = getOrCreateCheckoutAttemptKey(store, () => firstUuid);
    clearCheckoutAttemptKey(store);
    const next = getOrCreateCheckoutAttemptKey(store, () => secondUuid);
    expect(next).not.toBe(first);
  });

  test("corrupted stored marker cannot be replaced with a fresh key", () => {
    const { store, items } = makeStore();
    items.set(CHECKOUT_ATTEMPT_KEY, "not-a-valid-checkout-key");
    let generated = false;
    expect(() => getOrCreateCheckoutAttemptKey(store, () => { generated = true; return firstUuid; })).toThrow("previous checkout identity is invalid");
    expect(generated).toBe(false);
    expect(items.get(CHECKOUT_ATTEMPT_KEY)).toBe("not-a-valid-checkout-key");
  });

  test("insecure key generation or blocked tab storage cannot silently submit an order", () => {
    const { store } = makeStore();
    expect(() => getOrCreateCheckoutAttemptKey(store, () => "weak")).toThrow("Secure checkout identity");
    const blocked: CheckoutAttemptStore = {
      getItem: () => null,
      setItem: () => { throw new Error("Access denied"); },
      removeItem: () => {},
    };
    expect(() => getOrCreateCheckoutAttemptKey(blocked, () => firstUuid)).toThrow("Access denied");
  });

  test("a storage implementation that silently drops the key fails closed", () => {
    const forgotten: CheckoutAttemptStore = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    expect(() => getOrCreateCheckoutAttemptKey(forgotten, () => firstUuid)).toThrow("could not be retained");
    const stale: CheckoutAttemptStore = {
      getItem: () => "co_00000000000000000000000000000000",
      setItem: () => {},
      removeItem: () => {},
    };
    expect(getOrCreateCheckoutAttemptKey(stale, () => firstUuid)).toBe("co_00000000000000000000000000000000");
  });

  test("checkout only releases the key on known success, not a failed or unknown response", () => {
    const source = readFileSync("src/app/(storefront)/checkout/page.tsx", "utf8");
    expect(source).toContain("getOrCreateCheckoutAttemptKey(window.sessionStorage");
    expect(source).toContain("No new order request was sent");
    expect(source).toContain("clearCheckoutAttemptKey(window.sessionStorage)");
    expect(source.indexOf("clearCheckoutAttemptKey(window.sessionStorage)")).toBeGreaterThan(source.indexOf("const result = await apiOps.complete"));
    expect(source).toContain("if (placingRef.current) return;");
    expect(source).toContain("placingRef.current = true;");
    expect(source).toContain("placingRef.current = false;");
    expect(source).toContain('e.code === "IDEMPOTENCY_CONFLICT"');
    expect(source).not.toContain("co_${Date.now()}_");
    expect(source).toContain("clearCheckoutAttemptAfterDefiniteRejection(window.sessionStorage, e.code)");
  });

  test("a confirmed pre-commit rejection allows a corrected checkout with a fresh key", () => {
    for (const code of ["OUT_OF_STOCK", "PICKUP_FEE_CHANGED", "RULE_VIOLATION", "VALIDATION_FAILED"]) {
      const { store } = makeStore();
      const first = getOrCreateCheckoutAttemptKey(store, () => firstUuid);
      expect(clearCheckoutAttemptAfterDefiniteRejection(store, code)).toBe(true);
      expect(getOrCreateCheckoutAttemptKey(store, () => secondUuid)).not.toBe(first);
    }
  });

  test("ambiguous failures, 5xx and key conflicts retain the same checkout identity", () => {
    for (const code of ["IDEMPOTENCY_CONFLICT", "UNAVAILABLE", "UNAUTHORIZED", "FORBIDDEN", "PAYMENT_PENDING", "INTERNAL_ERROR", "NETWORK_ERROR"]) {
      const { store } = makeStore();
      const first = getOrCreateCheckoutAttemptKey(store, () => firstUuid);
      expect(clearCheckoutAttemptAfterDefiniteRejection(store, code)).toBe(false);
      expect(getOrCreateCheckoutAttemptKey(store, () => secondUuid)).toBe(first);
    }
  });

  test("blocked storage does not claim a rejected attempt was reset", () => {
    const { store } = makeStore();
    getOrCreateCheckoutAttemptKey(store, () => firstUuid);
    const blocked: CheckoutAttemptStore = { ...store, removeItem: () => { throw new Error("blocked"); } };
    expect(() => clearCheckoutAttemptAfterDefiniteRejection(blocked, "PICKUP_FEE_CHANGED")).toThrow("blocked");
    expect(getOrCreateCheckoutAttemptKey(store, () => secondUuid)).toBe("co_60ad32124f174f5294a4a064fd32e9fb");
  });
});
