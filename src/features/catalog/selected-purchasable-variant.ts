/**
 * Resolve the exact shopper-selected variant.
 *
 * Never silently substitute another size or pack when the selected SKU is
 * removed, reserved, expired or sold out. Requiring an explicit new choice
 * protects stock, price and customer intent across catalogue refreshes.
 */
export function selectedPurchasableVariant<
  T extends { id: string; isAvailable: boolean },
>(variants: readonly T[], selectedId: string): T | null {
  const selected = variants.find((variant) => variant.id === selectedId);
  return selected?.isAvailable ? selected : null;
}
