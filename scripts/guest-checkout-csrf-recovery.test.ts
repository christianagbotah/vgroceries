import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ApiError } from "../src/services/adapters/types";
import {
  FRESH_GUEST_CAPABILITY_MESSAGE,
  guestCheckoutCsrfFromCookie,
  readGuestCheckoutCsrfToken,
  withFreshGuestCheckoutRetry,
} from "../src/services/checkout-guest-csrf";

const root = resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const token = "a".repeat(64);

describe("guest checkout double-submit CSRF recovery", () => {
  test("reads only exact scoped guest CSRF token in mixed first-party cookies", () => {
    expect(guestCheckoutCsrfFromCookie("vg_guest=" + "f".repeat(64) +
      "; vg_guest_csrf=" + token + "; theme=light")).toBe(token);
    expect(guestCheckoutCsrfFromCookie("theme=x; vg_guest_csrf=" + token)).toBe(token);
    expect(guestCheckoutCsrfFromCookie("vg_guest_csrf_backup=" + token)).toBeUndefined();
    expect(guestCheckoutCsrfFromCookie("xvg_guest_csrf=" + token)).toBeUndefined();
    expect(guestCheckoutCsrfFromCookie("vg_guest_csrf=" + token.slice(1))).toBeUndefined();
    expect(guestCheckoutCsrfFromCookie("vg_guest_csrf=javascript%3Aalert(1)")).toBeUndefined();
    expect(guestCheckoutCsrfFromCookie("vg_guest_csrf=%GG")).toBeUndefined();
    expect(guestCheckoutCsrfFromCookie("")).toBeUndefined();
    expect(readGuestCheckoutCsrfToken()).toBeUndefined();
  });

  test("only the exact pre-commit 403 permits one transparent retry", async () => {
    const requests: string[] = [];
    const body = Object.freeze({ idempotencyKey: "co_exact_same_replay_key", lines: ["SKU-1"] });
    const place = async () => {
      requests.push(body.idempotencyKey);
      if (requests.length === 1)
        throw new ApiError("FORBIDDEN", FRESH_GUEST_CAPABILITY_MESSAGE);
      return { orderId: "verified-order-id" };
    };
    expect(await withFreshGuestCheckoutRetry(place, () => token))
      .toEqual({ orderId: "verified-order-id" });
    expect(requests).toEqual([body.idempotencyKey, body.idempotencyKey]);
  });

  test("uncertain earlier checkout cannot automatically bootstrap a different guest actor", async () => {
    let calls = 0;
    const place = async () => {
      calls++;
      throw new ApiError("FORBIDDEN", FRESH_GUEST_CAPABILITY_MESSAGE);
    };
    await expect(withFreshGuestCheckoutRetry(place, () => token, false))
      .rejects.toMatchObject({
        code: "FORBIDDEN",
        message: expect.stringContaining("avoid placing a duplicate order"),
      });
    expect(calls).toBe(1);
  });

  test("guest session missing after first 403 fails closed without second POST", async () => {
    let calls = 0;
    const place = async () => {
      calls++;
      throw new ApiError("FORBIDDEN", FRESH_GUEST_CAPABILITY_MESSAGE);
    };
    await expect(withFreshGuestCheckoutRetry(place, () => undefined))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("first-party cookies") });
    expect(calls).toBe(1);
  });

  test("rejects generic CSRF 403, network errors, conflicts and stale keys without retry", async () => {
    for (const [code, message] of [
      ["FORBIDDEN", "Valid guest checkout CSRF token required."],
      ["FORBIDDEN", "An administrator is not allowed to checkout."],
      ["NETWORK", "Request timed out."],
      ["CONFLICT", "Idempotency key replay conflict."],
      ["OUT_OF_STOCK", "Product sold out."],
    ]) {
      let calls = 0;
      const place = async () => { calls++; throw new ApiError(code, message); };
      await expect(withFreshGuestCheckoutRetry(place, () => token))
        .rejects.toMatchObject({ code, message });
      expect(calls).toBe(1);
    }
  });

  test("second pre-commit error does not trigger a third attempt", async () => {
    let calls = 0;
    const place = async () => { calls++; throw new ApiError("FORBIDDEN", FRESH_GUEST_CAPABILITY_MESSAGE); };
    await expect(withFreshGuestCheckoutRetry(place, () => token))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls).toBe(2);
  });

  test("authenticated CSRF stays highest-priority and guest token never persists client-side", () => {
    const browser = read("src/services/adapters/browser.ts");
    expect(browser).toContain('window.sessionStorage.getItem(CSRF_TOKEN_KEY)');
    expect(browser).toContain("accountToken || readGuestCheckoutCsrfToken()");
    const helper = read("src/services/checkout-guest-csrf.ts");
    expect(helper).not.toContain("localStorage.setItem");
    expect(helper).not.toContain("sessionStorage.setItem");
    expect(helper).not.toContain("fetch(");
  });

  test("real typed checkout entrypoint makes exactly one guarded retry with the same body", () => {
    const client = read("src/services/client.ts");
    expect(client).toContain('withFreshGuestCheckoutRetry(() =>');
    expect(client).toContain('api<CompleteOrderResponse>("checkout.complete", {');
    expect(client).toContain("options?.allowGuestBootstrapRetry === true");
    expect(client).toContain("body: body as unknown as Record<string, unknown>");
    expect(client).not.toContain('fetch("/api/v1/checkout/complete"');
  });

  test("API still requires a readable CSRF cookie matching server hash", () => {
    const backend = read("apps/api/src/commerce-identity/guest-checkout.service.ts");
    expect(backend).toContain('req.get("x-csrf-token")');
    expect(backend).toContain('cookieValue(req, "vg_guest_csrf")');
    expect(backend).toContain("sameSecretHash(header, session.csrfHash)");
    expect(backend).toContain(FRESH_GUEST_CAPABILITY_MESSAGE);
  });
});
