/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { classifyPickupAppointmentWindow } from "../src/features/logistics/pickup-appointment-window";

const card = readFileSync("src/features/catalog/product-tile.tsx", "utf8");

describe("Canonical UAT portal product cards preserve live POS-stock safeguards", () => {
  test("does not display fabricated reviews or pretend there are verified ratings", () => {
    expect(card).not.toContain("Popular product preview");
    expect(card).not.toContain('Star className="size-3 fill-current"');
    expect(card).not.toContain('>demo</span>');
  });
  test("never substitutes an alternate variant when the chosen SKU is unavailable", () => {
    expect(card).toContain("product.variants.find((v) => v.id === variantId);");
    expect(card).not.toContain("product.variants.find((v) => v.id === variantId) ?? available[0]");
    expect(card).toContain("Selected size unavailable. Choose another available size.");
    expect(card).toContain("if (!chosen?.isAvailable || !stockRemaining || adding) return;");
  });
  test("does not regress server authoritative stock rechecks or cart stock limits", () => {
    expect(card).toContain("await apiOps.byVariants([chosen.id])");
    expect(card).toContain("const fresh = products.flatMap");
    expect(card).toContain("const nowRemaining = subQty(latestQty, alreadyInCart)");
    expect(card).toContain("const accepted = add({");
    expect(card).toContain("}, latestQty);");
    expect(card).toContain("disabled={!stockRemaining || adding}");
  });
  test("both variant selector and Add to cart respect 44px minimum touch target", () => {
    expect(card).toContain('className="mt-2 h-11 min-h-11 w-full');
    expect(card).toContain('className="min-h-11" disabled=');
    expect(card).toContain('className="h-11 w-full rounded-xl');
  });
  test("pickup elapsed classification remains advisory", () => {
    const booking = { status: "booked", startsAt: "2026-11-15T10:00:00Z", endsAt: "2026-11-15T10:30:00Z" };
    expect(classifyPickupAppointmentWindow(booking, Date.parse(booking.endsAt))).toBe("elapsed");
    expect(classifyPickupAppointmentWindow({ ...booking, status: "completed" }, Date.parse(booking.startsAt))).toBe("completed");
  });
});
