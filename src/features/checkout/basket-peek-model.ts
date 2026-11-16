import type { CartLine } from "@/types/domain";

/**
 * Estimate only. These are browser-persisted display snapshots, never a
 * valid checkout quote, inventory allocation or payable amount.
 */
export function basketSnapshotSubtotal(
  lines: ReadonlyArray<Pick<CartLine, "priceMinor" | "quantity">>,
): number | null {
  let total = 0;
  for (const line of lines) {
    const quantity = line.quantity;
    if (typeof quantity !== "string" ||
        !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(quantity)) return null;
    const amount = Number(quantity);
    if (!(amount > 0) || !Number.isSafeInteger(line.priceMinor) || line.priceMinor < 0)
      return null;
    const extended = Math.round(line.priceMinor * amount);
    if (!Number.isSafeInteger(extended) || extended < 0) return null;
    total += extended;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

export const OPEN_BASKET_PEEK_EVENT = "vg:open-basket-peek";

export function openBasketPeek(): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(OPEN_BASKET_PEEK_EVENT));
}
