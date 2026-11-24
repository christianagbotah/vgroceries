import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { publicBusinessContactSchema } from "../packages/contracts/src/business-contact";
import type { PublicOrder } from "../packages/contracts/src/checkout";
import { assembleProductMedia } from "../src/features/catalog/product-media-gallery";
import {
  authenticatedOrderQrUrl,
  receiptDownloadHtml,
  receiptPlainText,
  receiptStatus,
} from "../src/features/orders/receipt-utils";

const root = resolve(import.meta.dir, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

const order = {
  id: "00000000-0000-4000-8000-000000000001",
  reference: "VG-ORDER-2026-101",
  createdAt: "2026-11-16T12:00:00.000Z",
  createdAtLabel: "16 Nov 2026, 12:00",
  customerName: "Ama <img src=x onerror=alert(1)>",
  customerPhone: "0241234567",
  verificationCode: "PRIVATE-TRACKING-CODE",
  channel: "online",
  paymentStatus: "pending",
  paymentMethod: "mobile_money",
  fulfilmentStatus: "pending",
  subtotalMinor: 5100,
  discountMinor: 500,
  deliveryFeeMinor: 900,
  totalMinor: 5500,
  lines: [{
    id: "line-1",
    productName: "Fresh <script>alert('bad')</script> Tomatoes",
    variantName: "1kg",
    quantity: "2",
    unitPriceMinor: 2550,
    lineTotalMinor: 5100,
  }],
} as unknown as PublicOrder;

describe("Variety motion storefront and receipt safety", () => {
  test("approved images remain true, ordered and deduplicated; no invented gallery", () => {
    const photo = { id: "p-1", url: "/products/one.webp", altText: "SKU 1 front", width: 600, height: 600 };
    const side = { id: "p-2", url: "/products/two.webp", altText: "SKU 1 side", width: 600, height: 600 };
    expect(assembleProductMedia("Rice", photo, [photo, side, photo], "/legacy.jpg"))
      .toEqual([photo, side]);
    const fallback = assembleProductMedia("Rice", undefined, [], "/legacy.jpg");
    expect(fallback).toHaveLength(1);
    expect(fallback[0].url).toBe("/legacy.jpg");
    expect(fallback[0].isLegacyFallback).toBe(true);
  });

  test("unverified orders are summaries, never official payment receipts", () => {
    const state = receiptStatus(order);
    expect(state.confirmed).toBe(false);
    expect(state.title).toContain("Order summary");
    expect(state.statusText).toContain("not yet verified");
    const text = receiptPlainText(order);
    expect(text).toContain("NOT PROOF OF PAYMENT");
    expect(text).toContain("₵55.00");
    expect(text).not.toContain(order.customerPhone);
    expect(text).not.toContain(order.verificationCode as string);
  });

  test("server-verified paid, refunded and review outcomes remain distinct", () => {
    expect(receiptStatus({ paymentStatus: "succeeded" }).confirmed).toBe(true);
    expect(receiptStatus({ paymentStatus: "refunded" }).confirmed).toBe(false);
    expect(receiptStatus({ paymentStatus: "partially_refunded" }).statusText)
      .toContain("partial refund");
    expect(receiptStatus({ paymentStatus: "failed" }).title).toContain("summary");
    expect(receiptStatus({ paymentStatus: "requires_review" }).confirmed).toBe(false);
  });

  test("HTML download escapes product/customer HTML, exposes no phone or pickup secret", () => {
    const html = receiptDownloadHtml(order);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<script>alert(");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain(order.customerPhone);
    expect(html).not.toContain(order.verificationCode as string);
    expect(html).toContain("NOT PROOF OF PAYMENT");
    expect(html).toContain("₵55.00");
    expect(html).toContain("Not a tax invoice");
  });

  test("QR contains only the account-authenticated order route, no collection code", () => {
    const link = authenticatedOrderQrUrl(order.id, "https://varietygroceries.com/");
    expect(link).toBe("https://varietygroceries.com/account/orders/" + order.id);
    expect(link).not.toContain(order.verificationCode as string);
    expect(link).not.toContain(order.customerPhone);
    for (const origin of [
      "javascript:alert(1)", "http://varietygroceries.com/",
      "https://user:pass@varietygroceries.com/",
      "https://varietygroceries.com/?token=secret",
      "https://varietygroceries.com/other/path",
    ]) expect(() => authenticatedOrderQrUrl(order.id, origin)).toThrow();
    expect(authenticatedOrderQrUrl(order.id, "http://localhost:3000/"))
      .toContain("/account/orders/");
  });

  test("local QR encoder produces a real SVG for the authenticated order path", async () => {
    const QRCode = (await import("qrcode")).default;
    const link = authenticatedOrderQrUrl(order.id, "https://varietygroceries.com/");
    const image = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M" });
    expect(image).toContain("<svg");
    expect(image).toContain("<path");
    expect(image).not.toContain(order.verificationCode as string);
  });

  test("client only creates cart motion AFTER the real cart add action", () => {
    const card = source("src/features/catalog/product-tile.tsx");
    const panel = source("src/features/catalog/product-purchase-panel.tsx");
    expect(card.indexOf("add({")).toBeLessThan(card.indexOf("flyProductToCart("));
    expect(panel.indexOf("add({")).toBeLessThan(panel.indexOf("flyProductToCart("));
    expect(panel).toContain('setQuantity("1")');
    expect(panel).toContain("AnimatePresence");
    const motion = source("src/features/checkout/cart-motion.ts");
    expect(motion).toContain("prefers-reduced-motion: reduce");
    expect(motion).toContain("document.visibilityState");
    expect(motion).toContain("CART_IMPACT_EVENT");
    expect(motion).toContain("animation.finished");
    expect(motion).not.toContain("useCart.setState");
  });

  test("both header and mobile cart targets react; accessibility stays available", () => {
    const icon = source("src/features/checkout/motion-cart-icon.tsx");
    const shell = source("src/components/layout/storefront-shell.tsx");
    expect(icon).toContain('mobile ? "mobile" : "header"');
    expect(shell).toContain("<MotionCartIcon count={itemCount} />");
    expect(shell).toContain("<MotionCartIcon count={itemCount} mobile />");
    expect(icon).toContain("useReducedMotion");
    expect(shell).toContain("aria-label={");
  });

  test("gallery supports swipe, zoom, arrow navigation and reduced motion", () => {
    const gallery = source("src/features/catalog/product-media-gallery.tsx");
    expect(gallery).toContain("onTouchStart");
    expect(gallery).toContain("onTouchEnd");
    expect(gallery).toContain('event.key === "ArrowLeft"');
    expect(gallery).toContain('event.key === "ArrowRight"');
    expect(gallery).toContain("useReducedMotion");
    expect(gallery).toContain("<Dialog");
    expect(gallery).toContain("data-vg-product-hero");
  });

  test("receipt UI is bound to real order states, not payment-success callbacks", () => {
    const receipt = source("src/features/orders/order-receipt-experience.tsx");
    const account = source("src/app/(storefront)/account/orders/[id]/page.tsx");
    const status = source("src/app/(storefront)/checkout/status/[id]/page.tsx");
    expect(receipt).toContain('import("qrcode")');
    expect(receipt).toContain("Download QR image");
    expect(receipt).toContain("Print / Save as PDF");
    expect(receipt).toContain("clipPath");
    expect(receipt).toContain("receiptStatus(order)");
    expect(account).toContain("<OrderReceiptExperience order={order} />");
    expect(status).toContain("<OrderReceiptExperience order={order} />");
    for (const forbidden of ["paymentInitiate(", "paymentSucceeded(", "paymentStatus: \"succeeded\""]) {
      expect(receipt).not.toContain(forbidden);
    }
  });
});

test("public support projection excludes private fields and receipt exports escape current support text", () => {
 const contact = {supportPhone:"+233241111111",supportEmail:"help@example.test",address:"Accra",operatingHours:"Mon-Sat",receiptFooter:"<script>unsafe</script>"};
 expect(publicBusinessContactSchema.safeParse(contact).success).toBe(true);
 expect(publicBusinessContactSchema.safeParse({...contact,ciphertext:"private"}).success).toBe(false);
 expect(publicBusinessContactSchema.safeParse({...contact,supportEmail:"invalid"}).success).toBe(false);
 expect(receiptPlainText(order,contact)).toContain("Current support information:");
 const html=receiptDownloadHtml(order,contact);
 expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
 expect(html).not.toContain("<script>unsafe</script>");
 expect(html).toContain("NOT PROOF OF PAYMENT");
 expect(html).not.toContain(order.verificationCode as string);
 expect(receiptDownloadHtml(order,null)).not.toContain("Current support information:");
});
