import { describe, expect, test } from "bun:test";
import { renderPosCashReceiptHtml } from "../apps/api/src/cashier-tills/pos-receipt-html";

const fixture = {
  reference: "VG-POS-PRINT-101",
  tillCode: "COUNTER-A",
  customerName: "Ama Mensah",
  createdAt: new Date("2026-11-16T12:00:00Z"),
  subtotalMinor: 123400,
  cashReceivedMinor: 125000,
  changeGivenMinor: 1600,
  lines: [{
    productName: "Premium rice",
    variantName: "25kg bag",
    unit: "bag",
    quantity: "1",
    unitPriceMinor: 123400,
    lineTotalMinor: 123400,
  }],
};

describe("POS 80mm physical receipt browser animation", () => {
  test("a decorative printer dispenses paper on screen and vanishes in print", () => {
    const html = renderPosCashReceiptHtml(fixture);
    expect(html).toContain("class='printer-shell'");
    expect(html).toContain("class='printer-slot'");
    expect(html).toContain("animation:vg-paper-feed");
    expect(html).toContain("@keyframes vg-paper-feed");
    expect(html).toContain("@media print");
    expect(html).toContain(".printer-shell{display:none!important}");
    expect(html).toContain("animation:none!important");
    expect(html).toContain("clip-path:none!important");
  });

  test("reduced-motion users receive a stable receipt and no scripts", () => {
    const html = renderPosCashReceiptHtml(fixture);
    expect(html).toContain("@media(prefers-reduced-motion:reduce)");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick=");
    expect(html).not.toContain("https://");
    expect(html).toContain("aria-hidden='true'");
  });

  test("receipt is money-accurate and formats Ghana cedi amounts with commas", () => {
    const html = renderPosCashReceiptHtml(fixture);
    expect(html).toContain("₵1,234.00");
    expect(html).toContain("₵1,250.00");
    expect(html).toContain("₵16.00");
    expect(html).toContain("NOT A TAX INVOICE");
    expect(html).toContain("Ghana time");
  });

  test("hostile customer names and product text remain escaped", () => {
    const html = renderPosCashReceiptHtml({
      ...fixture,
      customerName: "<script>alert('one')</script>",
      lines: [{ ...fixture.lines[0], productName: '<img src=x onerror="alert(1)">' }],
    });
    expect(html).toContain("&lt;script&gt;alert(&#39;one&#39;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
  });

  test("printer animation cannot bypass immutable cash or item total checks", () => {
    expect(() => renderPosCashReceiptHtml({
      ...fixture, changeGivenMinor: 100,
    })).toThrow();
    expect(() => renderPosCashReceiptHtml({
      ...fixture, lines: [],
    })).toThrow();
    expect(() => renderPosCashReceiptHtml({
      ...fixture, subtotalMinor: 100,
    })).toThrow();
  });
});
