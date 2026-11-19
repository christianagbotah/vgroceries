/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CHECKOUT_ATTEMPT_KEY,
  clearCheckoutAttemptKey,
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

  test("invalid stored marker is replaced with a securely generated one", () => {
    const { store, items } = makeStore();
    items.set(CHECKOUT_ATTEMPT_KEY, "not-a-valid-checkout-key");
    expect(getOrCreateCheckoutAttemptKey(store, () => firstUuid)).toStartWith("co_");
    expect(items.get(CHECKOUT_ATTEMPT_KEY)).toBe("co_60ad32124f174f5294a4a064fd32e9fb");
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

  test("checkout only releases the key on known success, not a failed or unknown response", () => {
    const source = readFileSync("src/app/(storefront)/checkout/page.tsx", "utf8");
    expect(source).toContain("getOrCreateCheckoutAttemptKey(window.sessionStorage");
    expect(source).toContain("clearCheckoutAttemptKey(window.sessionStorage)");
    expect(source.indexOf("clearCheckoutAttemptKey(window.sessionStorage)")).toBeGreaterThan(source.indexOf("const result = await apiOps.complete"));
    expect(source).toContain("if (placingRef.current) return;");
    expect(source).toContain("placingRef.current = true;");
    expect(source).toContain("placingRef.current = false;");
    expect(source).toContain('e.code === "IDEMPOTENCY_CONFLICT"');
    expect(source).not.toContain("co_${Date.now()}_");
  });
});
