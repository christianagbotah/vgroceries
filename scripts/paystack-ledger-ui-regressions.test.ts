/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { normalizePaymentLedgerResponse } from "../src/services/payment-ledger";

describe("payments admin live ledger adapter", () => {
  test("normalizes the production paginated payment ledger and preserves the verified settled channel", () => {
    const rows = normalizePaymentLedgerResponse({
      page: 1,
      perPage: 25,
      total: 1,
      items: [{
        attemptId: "attempt-1",
        orderId: "order-1",
        orderReference: "VG-1001",
        provider: "paystack",
        method: "hosted_checkout",
        settledChannel: "mobile_money",
        currency: "GHS",
        amountMinor: 12345,
        status: "succeeded",
        initiationState: "accepted",
        settlementState: "reconciled",
        callbackCount: 1,
        providerReference: "VG-PAY-ONE",
        createdAt: "2026-10-28T08:00:00.000Z",
        updatedAt: "2026-10-28T08:01:00.000Z",
        resolvedAt: "2026-10-28T08:01:00.000Z",
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "attempt-1",
      orderId: "order-1",
      orderReference: "VG-1001",
      method: "hosted_checkout",
      settledChannel: "mobile_money",
      amountLabel: "₵123.45",
      providerRef: "VG-PAY-ONE",
    });
  });

  test("keeps the existing demo-array response compatible", () => {
    const demo = [{
      id: "pay-demo",
      orderId: "ord-demo",
      orderReference: "VG-DEMO",
      channel: "online",
      method: "mobile_money",
      amountLabel: "₵20.00",
      status: "pending",
      settlementState: "unsettled",
      callbackCount: 0,
      createdAtLabel: "28 Oct, 08:00",
    }];
    expect(normalizePaymentLedgerResponse(demo)).toEqual(demo);
  });
  test("payments screen shows the verified settled rail separately from hosted checkout", () => {
    const page = readFileSync("src/app/admin/payments/page.tsx", "utf8");
    expect(page).toContain("p.settledChannel");
    expect(page).toContain("Settled via");
  });

});
