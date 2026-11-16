import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { basketSnapshotSubtotal, openBasketPeek, OPEN_BASKET_PEEK_EVENT } from "../src/features/checkout/basket-peek-model";

const root = resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("non-authoritative basket peek", () => {
  test("uses exact display snapshot unit price and accepts fractional grocery quantities", () => {
    expect(basketSnapshotSubtotal([])).toBe(0);
    expect(basketSnapshotSubtotal([
      { quantity: "2", priceMinor: 12345 },
      { quantity: "1.5", priceMinor: 201 },
    ])).toBe(24992);
    expect(basketSnapshotSubtotal([{ quantity: "0.125", priceMinor: 800 }])).toBe(100);
  });

  test("rejects untrusted local-storage prices, broken quantities and overflow", () => {
    for (const [quantity, priceMinor] of [
      ["0", 100], ["-1", 100], ["NaN", 100], ["Infinity", 100],
      ["1.9999", 100], ["1e8", 100], ["9999999999", 100],
      ["1", -25], ["1", 1.5], ["1", Number.MAX_SAFE_INTEGER + 1],
      ["999999999", Number.MAX_SAFE_INTEGER - 1],
    ] as const) {
      expect(basketSnapshotSubtotal([{ quantity, priceMinor }])).toBeNull();
    }
    expect(basketSnapshotSubtotal([{ quantity: "1", priceMinor: 1e15 },
      { quantity: "9", priceMinor: 1e15 }])).toBeNull();
  });

  test("event bus opens the preview without touching anything server side", () => {
    expect(OPEN_BASKET_PEEK_EVENT).toBe("vg:open-basket-peek");
    expect(() => openBasketPeek()).not.toThrow(); // safe on server
    const model = read("src/features/checkout/basket-peek-model.ts");
    expect(model).not.toContain("fetch(");
    expect(model).not.toContain("paymentInitiate(");
  });

  test("there is one dock in the storefront layout; full cart remains accessible", () => {
    const layout = read("src/app/(storefront)/layout.tsx");
    const shell = read("src/components/layout/storefront-shell.tsx");
    expect(layout.match(/<BasketPeekDock/g)?.length).toBe(1);
    expect(shell).toContain("onClick={openBasketPeek}");
    expect(shell).toContain('href="/cart"');
    expect(shell).toContain("MotionCartIcon");
    expect(shell).toContain("StorefrontMobileNav");
  });

  test("cart remains source of truth for the peek, not an invented UAT basket", () => {
    const src = read("src/features/checkout/basket-peek.tsx");
    expect(src).toContain("useCart(state => state.lines)");
    expect(src).toContain("useCart(state => state.remove)");
    expect(src).toContain("basketSnapshotSubtotal(lines)");
    expect(src).toContain("CART_IMPACT_EVENT");
    expect(src).toContain("OPEN_BASKET_PEEK_EVENT");
    expect(src).not.toContain("useCart.setState");
    for(const forbidden of [
      "apiOps.", "payments.initiate", "pos.verified", "stockConsume", "reserveStock",
      "localStorage.setItem(", "onClick={() => clear()}", "setQty(", "placeOrder(",
    ]) expect(src).not.toContain(forbidden);
  });

  test("drawer has accessible headings and controls, reduced motion and no forced checkout", () => {
    const src = read("src/features/checkout/basket-peek.tsx");
    expect(src).toContain("<SheetTitle");
    expect(src).toContain("<SheetDescription");
    expect(src).toContain('aria-label="Basket selections"');
    expect(src).toContain("useReducedMotion");
    expect(src).toContain("role=\"status\"");
    expect(src).toContain("Dismiss basket notification");
    expect(src).toContain("aria-label={\"Remove \" + line.name + \" from basket\"}");
    expect(src).toContain('href="/shop"');
    expect(src).toContain('href="/cart"');
    expect(src).toContain('href="/checkout"');
  });

  test("all displayed prices explicitly remain estimates and stock unreserved", () => {
    const src = read("src/features/checkout/basket-peek.tsx");
    expect(src).toContain("Indicative subtotal");
    expect(src).toContain("Basket items are not reserved.");
    expect(src).toContain("checked again at checkout");
    expect(src).toContain("snapshot prices");
    expect(src).toContain("Checkout independently confirms sellable stock");
  });

  test("add-to-cart has one accessible confirmation, not overlapping generic toasts", () => {
    const card = read("src/features/catalog/product-tile.tsx");
    const detail = read("src/features/catalog/product-purchase-panel.tsx");
    const preview = read("src/features/checkout/basket-peek.tsx");
    const shell = read("src/components/layout/storefront-shell.tsx");
    expect(card).toContain("flyProductToCart(");
    expect(detail).toContain("flyProductToCart(");
    expect(card).not.toContain("useToast");
    expect(detail).not.toContain("useToast");
    expect(preview).toContain("Added to your basket");
    expect(preview).toContain('totalQuantity === 1 ? "unit" : "units"');
    expect(shell).toContain('itemCount === 1 ? " item" : " items"');
  });

  test("cart-flight event remains decorative after the real cart mutation", () => {
    const flight = read("src/features/checkout/cart-motion.ts");
    const tile = read("src/features/catalog/product-tile.tsx");
    expect(flight).toContain("announceCartImpact()");
    expect(tile.indexOf("add({")).toBeLessThan(tile.indexOf("flyProductToCart("));
  });
});
