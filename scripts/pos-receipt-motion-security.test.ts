import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PublicOrder } from "../src/services/contracts";
import { authenticatedOrderQrUrl, receiptDownloadHtml, receiptPlainText, receiptStatus } from "../src/features/orders/receipt-utils";

const root = resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
function sample(status: string): PublicOrder {
  return {
    id: "mock-private-order-id",
    reference: "VG-MOCK-0001",
    customerName: "<img src=x onerror=alert(1)>",
    createdAt: "2026-11-17T00:00:00Z",
    createdAtLabel: "17 Nov 2026",
    paymentStatus: status,
    fulfilmentStatus: "placed",
    lines: [{
      id: "line1",
      productName: "<script>alert(1)</script> local rice",
      variantName: "5 kg",
      quantity: "2",
      unitPriceMinor: 1200,
      lineTotalMinor: 2400,
    }],
    subtotalMinor: 2400,
    discountMinor: 0,
    deliveryFeeMinor: 300,
    totalMinor: 2700,
  } as unknown as PublicOrder;
}

describe("POS-integrated receipt roll, truthful payment state and private QR", () => {
  test("pending/failed/review/refunded orders never claim verified payment", () => {
    for (const status of ["pending", "failed", "requires_review", "refunded"]) {
      expect(receiptStatus(sample(status)).confirmed).toBe(false);
      expect(receiptPlainText(sample(status))).toContain("NOT PROOF OF PAYMENT");
      expect(receiptDownloadHtml(sample(status))).toContain("NOT PROOF OF PAYMENT");
    }
    expect(receiptStatus(sample("succeeded")).confirmed).toBe(true);
    expect(receiptStatus(sample("partially_refunded")).confirmed).toBe(true);
    expect(receiptStatus(sample("refunded")).statusText.toLowerCase()).toContain("refunded");
  });

  test("HTML receipt escapes user-supplied text and has no scripts or external assets", () => {
    const html = receiptDownloadHtml(sample("pending"));
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("@media print");
    expect(html).toContain("80mm");
    expect(html).toContain("Not a tax invoice");
  });

  test("QR opens own authenticated order screen, not a provider or pickup code", () => {
    expect(authenticatedOrderQrUrl("ord 123", "https://portal.varietygroceries.com/"))
      .toBe("https://portal.varietygroceries.com/account/orders/ord%20123");
    expect(authenticatedOrderQrUrl("mock", "http://127.0.0.1:4197/"))
      .toBe("http://127.0.0.1:4197/account/orders/mock");
    for (const origin of [
      "http://evil.example/", "https://user:pass@portal.varietygroceries.com/",
      "https://portal.varietygroceries.com/prefix", "https://portal.varietygroceries.com/?access=1",
    ]) {
      expect(() => authenticatedOrderQrUrl("ord", origin)).toThrow();
    }
    expect(() => authenticatedOrderQrUrl("", "https://portal.varietygroceries.com/")).toThrow();
  });

  test("the receipt rolls visually with reduced-motion support and four real export actions", () => {
    const component = read("src/features/orders/order-receipt-experience.tsx");
    for (const term of [
      "motion.div", "useReducedMotion", "Print / Save as PDF", "Download full receipt",
      "Download text", "Download QR image", "authenticatedOrderQrUrl",
      "receiptDownloadHtml", "receiptPlainText", 'import("qrcode")',
      "Payment state", "NOT PROOF OF PAYMENT",
    ]) expect(component).toContain(term);
    expect(component).not.toContain("api.qrserver.com");
    expect(component).not.toContain("qr-code-generator.com");
    expect(component).not.toContain("paymentStatus: \"succeeded\"");
  });

  test("both real server-returned order routes render the same receipt experience", () => {
    for (const path of [
      "src/app/(storefront)/checkout/status/[id]/page.tsx",
      "src/app/(storefront)/account/orders/[id]/page.tsx",
    ]) {
      const page = read(path);
      expect(page).toContain("OrderReceiptExperience");
      expect(page).toContain("<OrderReceiptExperience order={order} />");
      expect(page).toContain("type PublicOrder");
    }
  });

  test("checkout authority, stock guard and official logo survive the receipt-only port", () => {
    expect(read("src/services/client.ts")).toContain("withFreshGuestCheckoutRetry");
    expect(read("src/features/catalog/product-purchase-panel.tsx")).toContain("apiOps.byVariants");
    expect(read("src/components/layout/storefront-shell.tsx")).toContain("/brand/variety-lockup.svg");
  });
});
