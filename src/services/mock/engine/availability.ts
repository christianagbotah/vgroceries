/**
 * Availability engine — the central business invariant.
 *
 *   availableToSell = sellablePhysical − activeReservations − safetyStock
 *
 * - sellablePhysical counts only regular, unquarantined, unexpired lots
 *   at the sell location(s). Expired, damaged, quarantined and disposal
 *   lots are excluded. The same held quantity is never subtracted twice
 *   because reservations are counted separately from lot quantities.
 * - Active reservations are unconsumed and unreleased.
 * - Reservation expiry is swept lazily on every read.
 */

import type { Reservation, StockLot } from "@/types/domain";
import { addQty, cmpQty, subQty } from "@/lib/quantity";
import { getStore, type VgStore } from "../store";
import { nowIso } from "@/lib/id";

export function sweepExpiredReservations(store: VgStore): string[] {
  const now = nowIso();
  const released: string[] = [];
  for (const r of store.reservations) {
    if (!r.consumedAt && !r.releasedAt && r.expiresAt <= now) {
      r.releasedAt = now;
      r.releasedReason = "expired";
      released.push(r.id);
    }
  }
  return released;
}

export function sellableLots(store: VgStore, variantId: string): StockLot[] {
  const now = nowIso();
  return store.lots.filter(
    (l) =>
      l.variantId === variantId &&
      l.kind === "regular" &&
      !l.isQuarantined &&
      (!l.expiryDate || l.expiryDate > now)
  );
}

/** Suggested first-expiring eligible lots (FEFO). */
export function fefoLots(store: VgStore, variantId: string): StockLot[] {
  return sellableLots(store, variantId)
    .slice()
    .sort((a, b) => (a.expiryDate ?? "9999") < (b.expiryDate ?? "9999") ? -1 : 1);
}

export function sellablePhysical(store: VgStore, variantId: string): string {
  return sellableLots(store, variantId).reduce((sum, l) => addQty(sum, l.quantity), "0");
}

export function activeReservations(store: VgStore, variantId: string): Reservation[] {
  sweepExpiredReservations(store);
  return store.reservations.filter((r) => r.variantId === variantId && !r.consumedAt && !r.releasedAt);
}

export function reservedQty(store: VgStore, variantId: string): string {
  return activeReservations(store, variantId).reduce((sum, r) => addQty(sum, r.quantity), "0");
}

export interface VariantAvailability {
  variantId: string;
  sellablePhysical: string;
  reserved: string;
  safetyStock: string;
  availableToSell: string;
  isAvailable: boolean;
  nextExpiry?: string;
  lots: { lotId: string; lotNumber: string; quantity: string; expiryDate?: string; quarantined: boolean; kind: StockLot["kind"] }[];
}

export function availability(store: VgStore, variantId: string): VariantAvailability {
  const variant = store.variants.find((v) => v.id === variantId);
  const physical = sellablePhysical(store, variantId);
  const reserved = reservedQty(store, variantId);
  const safety = variant?.safetyStock ?? "0";
  let available = subQty(subQty(physical, reserved), safety);
  if (cmpQty(available, "0") < 0) available = "0";
  const lots = fefoLots(store, variantId);
  return {
    variantId,
    sellablePhysical: physical,
    reserved,
    safetyStock: safety,
    availableToSell: available,
    isAvailable: cmpQty(available, "0") > 0,
    nextExpiry: lots[0]?.expiryDate,
    lots: store.lots
      .filter((l) => l.variantId === variantId)
      .map((l) => ({ lotId: l.id, lotNumber: l.lotNumber, quantity: l.quantity, expiryDate: l.expiryDate, quarantined: l.isQuarantined, kind: l.kind })),
  };
}

export function productAvailability(store: VgStore, productId: string): VariantAvailability[] {
  const product = store.products.find((p) => p.id === productId);
  if (!product) return [];
  return product.variants.map((vid) => availability(store, vid));
}

/** Product is discoverable in storefront lists only if published and some variant is available. */
export function isProductPurchasable(store: VgStore, productId: string): boolean {
  const product = store.products.find((p) => p.id === productId);
  if (!product || !product.isPublished) return false;
  return product.variants.some((vid) => availability(store, vid).isAvailable);
}

export interface StockConflict {
  variantId: string;
  productName: string;
  variantName: string;
  requested: string;
  available: string;
}

/**
 * Atomic multi-line availability check. Returns line-level conflicts
 * WITHOUT creating any holds — no stray partial reservations.
 */
export function checkAvailability(
  store: VgStore,
  lines: { variantId: string; quantity: string }[]
): { ok: boolean; conflicts: StockConflict[] } {
  const conflicts: StockConflict[] = [];
  // aggregate duplicate lines first
  const merged = new Map<string, string>();
  for (const l of lines) {
    merged.set(l.variantId, addQty(merged.get(l.variantId) ?? "0", l.quantity));
  }
  for (const [variantId, quantity] of merged) {
    const avail = availability(store, variantId);
    if (cmpQty(quantity, avail.availableToSell) > 0) {
      const variant = store.variants.find((v) => v.id === variantId);
      const product = variant ? store.products.find((p) => p.id === variant.productId) : undefined;
      conflicts.push({
        variantId,
        productName: product?.name ?? variantId,
        variantName: variant?.name ?? "",
        requested: quantity,
        available: avail.availableToSell,
      });
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}
