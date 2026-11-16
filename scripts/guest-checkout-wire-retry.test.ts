import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "../src/services/adapters/types";
import { getBrowserCsrfToken, resolveClientAdapter } from "../src/services/adapters/browser";
import {
  FRESH_GUEST_CAPABILITY_MESSAGE,
  withFreshGuestCheckoutRetry,
} from "../src/services/checkout-guest-csrf";

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
const guestCsrf = "b".repeat(64);
const checkout = {
  lines: [{ variantId: "var_tof_1", quantity: "1" }],
  customerName: "Wire Test", customerPhone: "+233200000001",
  fulfilment: "collection", paymentMethod: "cash_counter",
  idempotencyKey: "guest-csrf-replay-stable-key",
};

function installBrowser(getSessionToken: () => string | null, getGuestCookie: () => string): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true, value: { sessionStorage: { getItem: getSessionToken } },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true, value: { get cookie() { return getGuestCookie(); } },
  });
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://portal.example.test/api/v1";
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

describe("actual browser -> HTTP transport -> guest checkout retry", () => {
  test("first guest challenge is retried ONCE with the real cookie header, same request and replay key", async () => {
    let cookie = "";
    installBrowser(() => null, () => cookie);
    const captured: Array<{ url: string; headers: Record<string, string>; body: unknown; credentials: RequestCredentials | undefined }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      captured.push({
        url: String(url), headers, body: JSON.parse(String(init?.body)),
        credentials: init?.credentials,
      });
      if (captured.length === 1) {
        cookie = "vg_guest_csrf=" + guestCsrf + "; theme=dark";
        return Response.json({ ok: false, error: {
          code: "FORBIDDEN", message: FRESH_GUEST_CAPABILITY_MESSAGE,
        } }, { status: 403 });
      }
      return Response.json({ ok: true, data: { orderId: "mock-only-order" } });
    }) as typeof fetch;

    const adapter = resolveClientAdapter();
    const operation = () => adapter.request<{ orderId: string }>({
      op: "checkout.complete",
      body: checkout as unknown as Record<string, unknown>,
    });
    expect(await withFreshGuestCheckoutRetry(operation)).toEqual({ orderId: "mock-only-order" });
    expect(captured).toHaveLength(2);
    expect(captured[0].url).toBe("https://portal.example.test/api/v1/checkout/complete");
    expect(captured[1].url).toBe(captured[0].url);
    expect(captured[0].headers["X-CSRF-Token"]).toBeUndefined();
    expect(captured[1].headers["X-CSRF-Token"]).toBe(guestCsrf);
    expect(captured[0].headers["Idempotency-Key"]).toBe(checkout.idempotencyKey);
    expect(captured[1].headers["Idempotency-Key"]).toBe(checkout.idempotencyKey);
    expect(captured[0].body).toEqual(captured[1].body);
    expect(captured[0].credentials).toBe("include");
    expect(captured[1].credentials).toBe("include");
  });

  test("account login token takes priority over any stale guest CSRF cookie", () => {
    installBrowser(() => "account-session-token", () => "vg_guest_csrf=" + guestCsrf);
    expect(getBrowserCsrfToken()).toBe("account-session-token");
  });

  test("valid cookie without account session is used, but no malformed guest value is accepted", () => {
    installBrowser(() => null, () => "pref=1; vg_guest_csrf=" + guestCsrf);
    expect(getBrowserCsrfToken()).toBe(guestCsrf);
    installBrowser(() => null, () => "vg_guest_csrf=malicious");
    expect(getBrowserCsrfToken()).toBeUndefined();
  });

  test("unexpected checkout errors never trigger a second transport call", async () => {
    installBrowser(() => null, () => "vg_guest_csrf=" + guestCsrf);
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return Response.json({ ok: false, error: {
        code: "FORBIDDEN", message: "Valid guest checkout CSRF token required.",
      } }, { status: 403 });
    }) as unknown as typeof fetch;
    const adapter = resolveClientAdapter();
    await expect(withFreshGuestCheckoutRetry(() => adapter.request({
      op: "checkout.complete",
      body: checkout as unknown as Record<string, unknown>,
    }))).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Valid guest checkout CSRF token required.",
    } satisfies Partial<ApiError>);
    expect(calls).toBe(1);
  });
});
