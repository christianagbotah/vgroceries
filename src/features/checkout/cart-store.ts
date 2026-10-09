"use client";

/**
 * Client-side cart. NON-AUTHORITATIVE: it preserves convenience across
 * visits, but stock, prices and totals are always revalidated by the
 * service at quote/checkout. Browser storage is not stock truth.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "@/types/domain";
import { addQty, subQty } from "@/lib/quantity";

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, "addedAt">) => void;
  setQty: (variantId: string, quantity: string) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  count: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      add: (line) =>
        set((s) => {
          const existing = s.lines.find((l) => l.variantId === line.variantId);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.variantId === line.variantId
                  ? { ...l, quantity: addQty(l.quantity, line.quantity), name: line.name, image: line.image, priceMinor: line.priceMinor }
                  : l
              ),
            };
          }
          return {
            lines: [...s.lines, { ...line, addedAt: new Date().toISOString() }],
          };
        }),
      setQty: (variantId, quantity) =>
        set((s) => ({
          lines:
            quantity === "0"
              ? s.lines.filter((l) => l.variantId !== variantId)
              : s.lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)),
        })),
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
