import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { verifiedPosUat } from "../src/features/staff/verified-pos-uat-transport";
import { lockPosCashSaleAttempt } from "../src/features/staff/pos-sale-retry";

const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

describe("uncertain POS cash sale recovery", () => {
  test("keeps exactly the first key and original business values when cashier retries", () => {
    const first = lockPosCashSaleAttempt(null, {
      holdId: "sample-hold-1", cashReceivedMinor: 4000,
      handoverNote: "  Sample goods physically handed over  ",
      customer: { mode: "named", customerName: "  Sample Shopper  " },
    }, () => "replay-sample-stable-key-0001");
    const retry = lockPosCashSaleAttempt(first, {
      holdId: "sample-hold-1", cashReceivedMinor: 10000,
      handoverNote: "Changed note should not be submitted",
      customer: { mode: "walk_in" },
    }, () => "wrong-second-key");
    expect(retry).toBe(first);
    expect(retry).toEqual({
      holdId: "sample-hold-1", replayKey: "replay-sample-stable-key-0001",
      cashReceivedMinor: 4000, handoverNote: "Sample goods physically handed over",
      customer: { mode: "named", customerName: "Sample Shopper" },
    });
    expect(() => lockPosCashSaleAttempt(first, {
      holdId: "another-hold", cashReceivedMinor: 4000,
      handoverNote: "Fresh request blocked", customer: { mode: "walk_in" },
    })).toThrow("prior counter sale is unresolved");
  });

  test("snapshots registered customer instead of keeping a mutable object", () => {
    const person = { mode: "existing" as const, customerUserId: "synthetic-customer" };
    const first = lockPosCashSaleAttempt(null, {
      holdId: "hold-customer", cashReceivedMinor: 1200,
      handoverNote: " Sample goods transferred ", customer: person,
    }, () => "replay-id-existing-0001");
    person.customerUserId = "different-customer";
    expect(first.customer).toEqual({ mode: "existing", customerUserId: "synthetic-customer" });
  });

  test("timeout after server acceptance reuses the same key and exact body", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://pos-uat.example.test/api/v1";
    const attempts: { key: string; body: unknown; path: string }[] = [];
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      attempts.push({
        key: headers["Idempotency-Key"],
        body: JSON.parse(String(init?.body)),
        path: String(input),
      });
      if (attempts.length === 1) throw new TypeError("Network response lost after commit");
      return Response.json({
        ok: true, data: { id: "one-server-receipt", reference: "VG-POS-TEST" },
      });
    }, { preconnect: () => {} });

    const first = lockPosCashSaleAttempt(null, {
      holdId: "same-hold", cashReceivedMinor: 2000,
      handoverNote: "Synthetic handover confirmed",
      customer: { mode: "walk_in" },
    }, () => "pos-retry-same-key-001");
    await expect(verifiedPosUat.sale(
      "csrf-token", first.holdId, first.cashReceivedMinor,
      first.handoverNote, first.customer, first.replayKey,
    )).rejects.toThrow("Network response lost after commit");
    const retry = lockPosCashSaleAttempt(first, {
      holdId: "same-hold", cashReceivedMinor: 5000,
      handoverNote: "Different money must not be sent",
      customer: { mode: "named", customerName: "Unrelated shopper" },
    });
    const receipt = await verifiedPosUat.sale(
      "csrf-token", retry.holdId, retry.cashReceivedMinor,
      retry.handoverNote, retry.customer, retry.replayKey,
    );
    expect(receipt.id).toBe("one-server-receipt");
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts[0].key).toBe("pos-retry-same-key-001");
    expect(attempts[0].path).toEndWith("/admin/pos/cash-sales");
    expect(attempts[0].body).toEqual({
      holdId: "same-hold", cashReceivedMinor: 2000, cashCountConfirmed: true,
      goodsHandedOver: true, handoverNote: "Synthetic handover confirmed",
      customerMode: "walk_in",
    });
  });

  test("locks edits and release while sale outcome remains uncertain", () => {
    const ui = readFileSync("src/features/staff/verified-pos-uat.tsx", "utf8");
    expect(ui).toContain("lockPosCashSaleAttempt(saleAttempt");
    expect(ui).toContain("setSaleAttempt(attempt)");
    expect(ui).toContain("attempt.replayKey");
    expect(ui).toContain("setSaleStatusUncertain(true)");
    expect(ui).toContain("disabled={busy || !!sale || !!saleAttempt}");
    expect(ui).toContain("Retry original cash-sale request");
    expect(ui).toContain("Do not collect sample cash twice");
    expect(ui).toContain("setSaleAttempt(null); setSaleStatusUncertain(false)");
    expect(ui).not.toContain("localStorage.setItem(");
    expect(ui).not.toContain("sessionStorage.setItem(");
  });
});
