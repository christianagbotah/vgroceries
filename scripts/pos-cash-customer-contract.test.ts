import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  posCashSaleCompleteSchema,
  posCashSaleViewSchema,
} from "../packages/contracts/src/pos-cash-sales";
import { renderPosCashReceiptHtml } from "../apps/api/src/cashier-tills/pos-receipt-html";

const order = {
  holdId: "00000000-0000-4000-8000-000000000001",
  cashReceivedMinor: 600,
  cashCountConfirmed: true,
  goodsHandedOver: true,
  handoverNote: "The customer paid the counted amount and collected all items.",
};

describe("immutable POS cash-sale customer identity contracts", () => {
  test("existing cash API remains backwards compatible with no customer mode", () => {
    const parsed = posCashSaleCompleteSchema.safeParse(order);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.customerMode).toBeUndefined();
  });

  test("registered customer requires an account key but cannot fake names or phone", () => {
    expect(posCashSaleCompleteSchema.safeParse({
      ...order, customerMode: "existing", customerUserId: "customer-a",
    }).success).toBe(true);
    for (const extra of [
      { customerMode: "existing" },
      { customerMode: "existing", customerUserId: "customer-a", customerName: "Fake" },
      { customerMode: "existing", customerUserId: "customer-a", customerPhone: "0240000000" },
      { customerMode: "walk_in", customerUserId: "customer-a" },
      { customerMode: "walk_in", customerName: "Fake" },
      { customerMode: "named", customerUserId: "customer-a", customerName: "Fake" },
    ]) expect(posCashSaleCompleteSchema.safeParse({ ...order, ...extra }).success).toBe(false);
  });

  test("name-only walk-in never claims customer account or payment method", () => {
    const result = posCashSaleCompleteSchema.safeParse({
      ...order, customerMode: "named", customerName: "  Ama Mensah  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.customerName).toBe("Ama Mensah");
    for (const extra of [
      { customerMode: "named" },
      { customerMode: "named", customerName: "A" },
      { customerMode: "named", customerName: "A".repeat(121) },
      { customerMode: "named", customerName: "Ama", email: "email@example.invalid" },
      { customerMode: "named", customerName: "Ama", method: "mobile_money" },
    ]) expect(posCashSaleCompleteSchema.safeParse({ ...order, ...extra }).success).toBe(false);
  });

  test("cash receipt escapes customer identity, never renders phone or scripts", () => {
    const result = renderPosCashReceiptHtml({
      reference: "VG-POS-FIXTURE",
      tillCode: "TEST-COUNTER",
      customerName: 'Ama <script>alert("one")</script> & Sons',
      createdAt: new Date("2026-11-16T12:00:00.000Z"),
      subtotalMinor: 523,
      cashReceivedMinor: 600,
      changeGivenMinor: 77,
      lines: [{
        productName: "Rice", variantName: "1kg", unit: "bag",
        quantity: "1", unitPriceMinor: 523, lineTotalMinor: 523,
      }],
    });
    expect(result).toContain('Ama &lt;script&gt;alert(&quot;one&quot;)&lt;/script&gt; &amp; Sons');
    expect(result).not.toContain("<script>alert");
    expect(result).not.toContain("0240000000");
    expect(result).toContain("NOT A TAX INVOICE");
  });

  test("production view schema requires frozen customer mode, identity and name", () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000002",
      reference: "VG-POS-FIXTURE",
      holdId: order.holdId,
      tillSessionId: "00000000-0000-4000-8000-000000000003",
      locationId: "branch-a",
      soldByUserId: "admin-a",
      stockDepletionId: "00000000-0000-4000-8000-000000000004",
      customerMode: "walk_in",
      customerUserId: null,
      customerName: "Walk-in Customer",
      subtotalMinor: 523,
      cashReceivedMinor: 600,
      changeGivenMinor: 77,
      paymentMethod: "cash",
      cashCountConfirmed: true,
      goodsHandedOver: true,
      handoverNote: order.handoverNote,
      createdAt: "2026-11-16T12:00:00.000Z",
      taxInvoiceIssued: false,
      electronicPaymentVerified: false,
      lines: [{
        variantId: "v-a", quantity: "1", unitPriceMinor: 523, lineTotalMinor: 523,
      }],
    };
    expect(posCashSaleViewSchema.safeParse(row).success).toBe(true);
    expect(posCashSaleViewSchema.safeParse({
      ...row, customerName: undefined,
    }).success).toBe(false);
    expect(posCashSaleViewSchema.safeParse({
      ...row, customerPhone: "+233241111111",
    }).success).toBe(false);
  });

  test("registered customer lookups lock the actual user row before depletion", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../apps/api/src/cashier-tills/pos-cash-sales.service.ts"), "utf8",
    );
    const validation = source.indexOf("FOR SHARE");
    const consumption = source.indexOf("this.depletion.consumeClaim");
    expect(validation).toBeGreaterThan(-1);
    expect(consumption).toBeGreaterThan(validation);
    expect(source).toContain('selected.role !== "customer"');
    expect(source).toContain("input.customerUserId!");
  });
});
