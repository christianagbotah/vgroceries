"use client";

/**
 * Client-side cart. NON-AUTHORITATIVE: it preserves convenience across
 * visits, but stock, prices and totals are always revalidated by the
 * service at quote/checkout. Browser storage is not stock truth.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "@/types/domain";
import { addQty, cmpQty, qtyToScaled, subQty } from "@/lib/quantity";

interface CartState {
  lines: CartLine[];
  /** Fail closed unless a real catalog available-to-sell cap is supplied. */
  add: (line: Omit<CartLine, "addedAt">, availableToSell: string) => boolean;
  setQty: (variantId: string, quantity: string, availableToSell: string) => boolean;
  remove: (variantId: string) => void;
  clear: () => void;
  count: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      add: (line, availableToSell) => {
        let accepted = false;
        try {
          // Browser values are for UX only. Every real checkout obtains a new
          // transaction-locked allocation from PostgreSQL.
          if (qtyToScaled(line.quantity) <= 0 || qtyToScaled(availableToSell) <= 0) return false;
          set((state) => {
            const existing = state.lines.find((item) => item.variantId === line.variantId);
            const total = existing ? addQty(existing.quantity, line.quantity) : line.quantity;
            if (cmpQty(total, availableToSell) > 0) return state;
            accepted = true;
            return existing
              ? { lines: state.lines.map((item) => item.variantId === line.variantId
                  ? { ...item, quantity: total, name: line.name, image: line.image, priceMinor: line.priceMinor }
                  : item) }
              : { lines: [...state.lines, { ...line, addedAt: new Date().toISOString() }] };
          });
        } catch { return false; }
        return accepted;
      },
      setQty: (variantId, quantity, availableToSell) => {
        let accepted = false;
        try {
          if (qtyToScaled(quantity) < 0 || qtyToScaled(availableToSell) < 0 ||
              cmpQty(quantity, availableToSell) > 0) return false;
          set((state) => {
            if (!state.lines.some((line) => line.variantId === variantId)) return state;
            accepted = true;
            return { lines: quantity === "0"
              ? state.lines.filter((line) => line.variantId !== variantId)
              : state.lines.map((line) => line.variantId === variantId ? { ...line, quantity } : line) };
          });
        } catch { return false; }
        return accepted;
      },
      remove: (variantId) => set((s) => ({ lines: s.lines.filter((l) => l.variantId !== variantId) })),
      clear: () => set({ lines: [] }),
      count: () => get().lines.length,
    }),
    { name: "vg-cart-v1" }
  )
);

export function cartTotalQuantity(lines: CartLine[]): number {
  return lines.reduce((a, l) => a + Number(l.quantity), 0);
}

export function subtractCartQuantity(lines: CartLine[], variantId: string, qty: string): CartLine[] {
  const line = lines.find((l) => l.variantId === variantId);
  if (!line) return lines;
  const next = subQty(line.quantity, qty);
  if (Number(next) <= 0) return lines.filter((l) => l.variantId !== variantId);
  return lines.map((l) => (l.variantId === variantId ? { ...l, quantity: next } : l));
}
