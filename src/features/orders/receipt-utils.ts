import type { PublicOrder } from "@/services/contracts";
import { formatMoney } from "@/lib/money";

export function receiptStatus(order: Pick<PublicOrder, "paymentStatus">): {
  title: string;
  statusText: string;
  confirmed: boolean;
} {
  switch (order.paymentStatus) {
    case "succeeded":
      return { title: "Purchase receipt", statusText: "Payment verified", confirmed: true };
    case "partially_refunded":
      return { title: "Purchase receipt · adjusted", statusText: "Payment verified; partial refund recorded", confirmed: true };
    case "refunded":
      return { title: "Order summary · refunded", statusText: "Original payment refunded", confirmed: false };
    case "requires_review":
      return { title: "Order summary · review", statusText: "Payment needs verification", confirmed: false };
    case "failed":
      return { title: "Order summary · unpaid", statusText: "Payment failed", confirmed: false };
    default:
      return { title: "Order summary · pending", statusText: "Payment not yet verified", confirmed: false };
  }
}

export function authenticatedOrderQrUrl(orderId: string, origin: string): string {
  if (!orderId || orderId.length > 128) throw new Error("Invalid order reference for QR link");
  const base = new URL(origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if ((base.protocol !== "https:" && !(local && base.protocol === "http:")) ||
    base.username || base.password || base.search || base.hash ||
    base.pathname !== "/") {
    throw new Error("A trusted storefront origin is required");
  }
  const url = new URL("/account/orders/" + encodeURIComponent(orderId), base);
  return url.toString();
}

const clean = (value: string) => value.replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function receiptPlainText(order: PublicOrder): string {
  const state = receiptStatus(order);
  return [
    "VARIETY GROCERIES",
    state.title.toUpperCase(),
    "Reference: " + order.reference,
    "Placed (UTC): " + order.createdAt,
    "Customer: " + order.customerName,
    "Payment: " + state.statusText,
    "Fulfilment: " + order.fulfilmentStatus,
    "--------------------------------",
    ...order.lines.map(line =>
      line.productName + " (" + line.variantName + ") x " +
      line.quantity + "  " + formatMoney(line.lineTotalMinor)
    ),
    "--------------------------------",
    "Subtotal: " + formatMoney(order.subtotalMinor),
    "Discount: " + formatMoney(order.discountMinor),
    "Delivery / pickup: " + formatMoney(order.deliveryFeeMinor),
    "TOTAL: " + formatMoney(order.totalMinor),
    "--------------------------------",
    state.confirmed ? "Payment state from the verified order record." :
      "NOT PROOF OF PAYMENT. Payment has not been verified.",
    "Not a tax invoice. Verify fulfilment separately.",
    "For order details, sign in to varietygroceries.com.",
  ].join("\n");
}

/**
 * Standalone offline HTML export; no scripts, external resources,
 * customer phone numbers, verification codes or embedded QR tokens.
 * It is a record of the current server-returned order state, not
 * a tax invoice or authoritative payment settlement certificate.
 */
export function receiptDownloadHtml(order: PublicOrder): string {
  const status = receiptStatus(order);
  const lines = order.lines.map(line =>
    "<tr><td>" + clean(line.productName) + "<small>" + clean(line.variantName) +
    " · " + clean(line.quantity) + "</small></td><td>" +
    clean(formatMoney(line.lineTotalMinor)) + "</td></tr>"
  ).join("");
  const amount = (label: string, value: number) =>
    "<div class='row'><span>" + clean(label) + "</span><strong>" +
    clean(formatMoney(value)) + "</strong></div>";
  return [
    "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width,initial-scale=1'>",
    "<title>Variety Groceries · " + clean(order.reference) + "</title>",
    "<style>@page{size:80mm auto;margin:5mm}body{font:12px system-ui,Arial;color:#183b29;margin:0;background:#f5f5f0;padding:20px}",
    "main{box-sizing:border-box;max-width:88mm;background:#fff;margin:0 auto;padding:16px;box-shadow:0 8px 28px #0002}",
    "h1{text-align:center;font-size:17px;margin:0}h2{text-align:center;font-size:12px;letter-spacing:.08em;text-transform:uppercase}",
    "p{line-height:1.5}table{width:100%;border-collapse:collapse;font-size:11px}td{padding:8px 0;border-bottom:1px dashed #ddd}",
    "td:last-child{text-align:right;white-space:nowrap}small{display:block;color:#777}.row{display:flex;justify-content:space-between;gap:10px;margin:7px 0}",
    ".total{border-top:2px solid #183b29;padding-top:8px;font-size:14px}footer{font-size:10px;text-align:center;color:#5b695c;margin-top:16px}",
    "@media print{body{padding:0;background:white}main{box-shadow:none;padding:0}}",
    "</style></head><body><main><h1>VARIETY GROCERIES</h1><h2>" + clean(status.title) + "</h2>",
    "<p><b>Order:</b> " + clean(order.reference) + "<br><b>Placed:</b> " +
      clean(order.createdAt) + " UTC<br><b>Customer:</b> " + clean(order.customerName) +
      "<br><b>Payment:</b> " + clean(status.statusText) + "</p>",
    "<table><tbody>" + lines + "</tbody></table>",
    amount("Subtotal", order.subtotalMinor),
    amount("Discount", order.discountMinor),
    amount("Delivery / pickup", order.deliveryFeeMinor),
    "<div class='total'>" + amount("Total", order.totalMinor) + "</div>",
    "<footer>" + (status.confirmed ? "Payment state is from the server record." :
      "NOT PROOF OF PAYMENT. Payment has not been verified.") +
      "<br>Not a tax invoice · Keep your order reference for enquiries</footer>",
    "</main></body></html>",
  ].join("");
}
