/**
 * Inventory engine — lot-level consumption, goods receiving, reasoned
 * adjustments with approval, stocktakes, quarantine and disposal.
 */

import type { GoodsReceipt, StockAdjustment, StockLot, StockMovement, Stocktake } from "@/types/domain";
import { addQty, cmpQty, qtyToScaled, scaledToQty, subQty } from "@/lib/quantity";
import { nextId, nowIso } from "@/lib/id";
import type { VgStore } from "../store";
import { fefoLots, sellableLots } from "./availability";
import { OpError, audit } from "./orders";

/**
 * Consume quantity across eligible lots, FEFO first. Creates movements.
 * Used by the single depletion event (dispatch handover / POS completion)
 * and never for picking or packing.
 */
export function consumeLots(
  store: VgStore,
  variantId: string,
  quantity: string,
  reference: string,
  actor: string,
  reason: StockMovement["reason"]
): void {
  let remaining = quantity;
  for (const lot of fefoLots(store, variantId)) {
    if (cmpQty(remaining, "0") <= 0) break;
    const take = cmpQty(lot.quantity, remaining) >= 0 ? remaining : lot.quantity;
    if (cmpQty(take, "0") <= 0) continue;
    lot.quantity = subQty(lot.quantity, take);
    remaining = subQty(remaining, take);
    store.movements.push({
      id: nextId("mov"),
      variantId,
      locationId: lot.locationId,
      lotId: lot.id,
      delta: `-${take}`,
      resultingQty: lot.quantity,
      reason,
      reference,
      actorId: actor,
      at: nowIso(),
    });
  }
  if (cmpQty(remaining, "0") > 0) {
    // Physical shortfall versus the recorded reservation: record an
    // exception movement rather than silently under-consuming.
    store.movements.push({
      id: nextId("mov"),
      variantId,
      locationId: "loc_store",
      delta: `-${remaining}`,
      resultingQty: "—",
      reason: "adjustment",
      reference,
      actorId: actor,
      note: "Consumption exceeded recorded sellable lots — flagged for stocktake",
      at: nowIso(),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Goods receiving                                                     */
/* ------------------------------------------------------------------ */

export interface ReceiveInput {
  supplierId: string;
  purchaseOrderId?: string;
  lines: { variantId: string; lotNumber: string; quantity: string; expiryDate?: string }[];
  note?: string;
  actor: string;
}

export function receiveGoods(store: VgStore, input: ReceiveInput): GoodsReceipt {
  if (!input.lines.length) throw new OpError("VALIDATION_FAILED", "At least one received line is required.");
  const supplier = store.suppliers.find((s) => s.id === input.supplierId);
  if (!supplier) throw new OpError("VALIDATION_FAILED", "Unknown supplier.");
  const receipt: GoodsReceipt = {
    id: nextId("gr"),
    purchaseOrderId: input.purchaseOrderId,
    supplierId: input.supplierId,
    lines: [],
    receivedAt: nowIso(),
    receivedBy: input.actor,
    note: input.note,
  };
  for (const l of input.lines) {
    const variant = store.variants.find((v) => v.id === l.variantId);
    if (!variant) throw new OpError("VALIDATION_FAILED", `Unknown variant ${l.variantId}.`);
    if (!/^[^-]\d+(\.\d+)?$/.test(l.quantity) || cmpQty(l.quantity, "0") <= 0) {
      throw new OpError("VALIDATION_FAILED", "Quantities must be positive decimal strings.");
    }
    if (l.expiryDate && new Date(l.expiryDate).toISOString() <= nowIso()) {
      throw new OpError("VALIDATION_FAILED", "Expiry date must be in the future for a received lot.");
    }
    const lot: StockLot = {
      id: nextId("lot"),
      variantId: l.variantId,
      locationId: "loc_store",
      lotNumber: l.lotNumber,
      kind: "regular",
      quantity: l.quantity,
      receivedAt: nowIso(),
      expiryDate: l.expiryDate,
      supplierId: input.supplierId,
      purchaseOrderId: input.purchaseOrderId,
      isQuarantined: false,
    };
    store.lots.push(lot);
    receipt.lines.push({ variantId: l.variantId, lotNumber: l.lotNumber, quantity: l.quantity, expiryDate: l.expiryDate });
    store.movements.push({
      id: nextId("mov"),
      variantId: l.variantId,
      locationId: "loc_store",
      lotId: lot.id,
      delta: `+${l.quantity}`,
      resultingQty: l.quantity,
      reason: "received",
      reference: receipt.id,
      actorId: input.actor,
      at: nowIso(),
    });
  }
  if (input.purchaseOrderId) {
    const po = store.purchaseOrders.find((p) => p.id === input.purchaseOrderId);
    if (po && po.status !== "cancelled") {
      const allReceived = po.lines.every((pl) => {
        const receivedForVariant = receipt.lines
          .filter((rl) => rl.variantId === pl.variantId)
          .reduce((a, rl) => addQty(a, rl.quantity), "0");
        return cmpQty(receivedForVariant, pl.quantity) >= 0;
      });
      po.status = allReceived ? "received" : "partially_received";
    }
  }
  store.goodsReceipts.unshift(receipt);
  audit(store, input.actor, "inventory.goods_received", "GoodsReceipt", receipt.id, { after: `${receipt.lines.length} lots` });
  return receipt;
}

/* ------------------------------------------------------------------ */
/* Adjustments (reasoned, approval-gated)                              */
/* ------------------------------------------------------------------ */

export interface AdjustInput {
  variantId: string;
  lotId: string;
  delta: string; // signed decimal string
  reason: string;
  note?: string;
  actor: string;
}

export function requestAdjustment(store: VgStore, input: AdjustInput): StockAdjustment {
  const lot = store.lots.find((l) => l.id === input.lotId);
  if (!lot || lot.variantId !== input.variantId) throw new OpError("VALIDATION_FAILED", "Lot not found for this variant.");
  if (!/^[+-]?\d+(\.\d+)?$/.test(input.delta) || cmpQty(input.delta, "0") === 0) {
    throw new OpError("VALIDATION_FAILED", "Delta must be a non-zero decimal string.");
  }
  if (!input.reason.trim()) throw new OpError("VALIDATION_FAILED", "A reason is required for stock adjustments.");
  const resulting = addQty(lot.quantity, input.delta);
  if (cmpQty(resulting, "0") < 0) throw new OpError("VALIDATION_FAILED", "Adjustment would take the lot below zero.");
  const adjustment: StockAdjustment = {
    id: nextId("adj"),
    variantId: input.variantId,
    lotId: input.lotId,
    delta: input.delta,
    reason: input.reason,
    note: input.note,
    status: "pending_approval",
    requestedBy: input.actor,
    at: nowIso(),
  };
  store.adjustments.unshift(adjustment);
  audit(store, input.actor, "inventory.adjustment_requested", "StockAdjustment", adjustment.id, { reason: input.reason, before: lot.quantity, after: resulting });
  return adjustment;
}

export function decideAdjustment(store: VgStore, adjustmentId: string, decision: "approve" | "reject", actor: string): StockAdjustment {
  const adj = store.adjustments.find((a) => a.id === adjustmentId);
  if (!adj) throw new OpError("VALIDATION_FAILED", "Adjustment not found.");
  if (adj.status !== "pending_approval") throw new OpError("VALIDATION_FAILED", "Adjustment is already decided.");
  const lot = store.lots.find((l) => l.id === adj.lotId)!;
  if (decision === "approve") {
    lot.quantity = addQty(lot.quantity, adj.delta);
    store.movements.push({
      id: nextId("mov"),
      variantId: adj.variantId,
      locationId: lot.locationId,
      lotId: lot.id,
      delta: adj.delta.startsWith("-") ? adj.delta : `+${adj.delta}`,
      resultingQty: lot.quantity,
      reason: "adjustment",
      reference: adj.id,
      actorId: actor,
      note: adj.reason,
      at: nowIso(),
    });
    adj.status = "approved";
    adj.approvedBy = actor;
    audit(store, actor, "inventory.adjustment_approved", "StockAdjustment", adj.id, { before: "pending_approval", after: "approved", reason: adj.reason });
  } else {
    adj.status = "rejected";
    adj.approvedBy = actor;
    audit(store, actor, "inventory.adjustment_rejected", "StockAdjustment", adj.id, { before: "pending_approval", after: "rejected" });
  }
  return adj;
}

/* ------------------------------------------------------------------ */
/* Stocktakes                                                          */
/* ------------------------------------------------------------------ */

export function openStocktake(store: VgStore, locationId: string, variantIds: string[], actor: string): Stocktake {
  if (!variantIds.length) throw new OpError("VALIDATION_FAILED", "Select at least one item to count.");
  const stocktake: Stocktake = {
    id: nextId("stk"),
    reference: `ST-${String(store.sequences.stk).padStart(4, "0")}`,
    status: "open",
    locationId,
    openedAt: nowIso(),
    openedBy: actor,
    lines: variantIds.map((variantId) => ({
      variantId,
      expectedQty: sellableLots(store, variantId).reduce((a, l) => addQty(a, l.quantity), "0"),
      status: "uncounted" as const,
    })),
  };
  store.sequences.stk += 1;
  store.stocktakes.unshift(stocktake);
  audit(store, actor, "inventory.stocktake_opened", "Stocktake", stocktake.id);
  return stocktake;
}

export function recordCounts(store: VgStore, stocktakeId: string, counts: Record<string, string>, actor: string): Stocktake {
  const stk = store.stocktakes.find((s) => s.id === stocktakeId);
  if (!stk) throw new OpError("VALIDATION_FAILED", "Stocktake not found.");
  if (stk.status === "closed") throw new OpError("VALIDATION_FAILED", "Stocktake is closed.");
  stk.status = "review";
  for (const line of stk.lines) {
    const counted = counts[line.variantId];
    if (counted === undefined) continue;
    if (!/^\d+(\.\d+)?$/.test(counted)) throw new OpError("VALIDATION_FAILED", "Counts must be non-negative decimal strings.");
    line.countedQty = counted;
    const variance = qtyToScaled(counted) - qtyToScaled(line.expectedQty);
    line.variance = scaledToQty(variance);
    line.status = variance === 0 ? "counted" : "variance";
  }
  audit(store, actor, "inventory.stocktake_counted", "Stocktake", stk.id);
  return stk;
}

export function closeStocktake(store: VgStore, stocktakeId: string, applyCorrections: boolean, actor: string): Stocktake {
  const stk = store.stocktakes.find((s) => s.id === stocktakeId);
  if (!stk) throw new OpError("VALIDATION_FAILED", "Stocktake not found.");
  if (stk.status === "closed") throw new OpError("VALIDATION_FAILED", "Stocktake already closed.");
  if (stk.lines.some((l) => l.status === "uncounted")) {
    throw new OpError("VALIDATION_FAILED", "Some lines are still uncounted.");
  }
  if (applyCorrections) {
    for (const line of stk.lines.filter((l) => l.status === "variance")) {
      // apply the correction to the variant's eligible lots (newest lot absorbs the difference)
      const lots = fefoLots(store, line.variantId).slice().reverse();
      let diff = line.variance!;
      for (const lot of lots) {
        if (cmpQty(diff, "0") === 0) break;
        if (cmpQty(diff, "0") > 0) {
          lot.quantity = addQty(lot.quantity, diff);
          store.movements.push({
            id: nextId("mov"), variantId: line.variantId, locationId: lot.locationId, lotId: lot.id,
            delta: `+${diff}`, resultingQty: lot.quantity, reason: "stocktake_correction", reference: stk.id, actorId: actor, at: nowIso(),
          });
          diff = "0";
        } else {
          const take = cmpQty(lot.quantity, diff) >= 0 ? diff : lot.quantity;
          lot.quantity = subQty(lot.quantity, take);
          store.movements.push({
            id: nextId("mov"), variantId: line.variantId, locationId: lot.locationId, lotId: lot.id,
            delta: `-${take}`, resultingQty: lot.quantity, reason: "stocktake_correction", reference: stk.id, actorId: actor, at: nowIso(),
          });
          diff = subQty(diff, take);
        }
      }
    }
  }
  stk.status = "closed";
  stk.closedAt = nowIso();
  audit(store, actor, "inventory.stocktake_closed", "Stocktake", stk.id, { reason: applyCorrections ? "Corrections applied" : "Closed without corrections" });
  return stk;
}

/* ------------------------------------------------------------------ */
/* Quarantine & disposal                                               */
/* ------------------------------------------------------------------ */

export function setLotQuarantine(store: VgStore, lotId: string, quarantined: boolean, actor: string, note?: string): StockLot {
  const lot = store.lots.find((l) => l.id === lotId);
  if (!lot) throw new OpError("VALIDATION_FAILED", "Lot not found.");
  lot.isQuarantined = quarantined;
  if (quarantined) lot.locationId = "loc_quarantine";
  else lot.locationId = "loc_store";
  store.movements.push({
    id: nextId("mov"), variantId: lot.variantId, locationId: lot.locationId, lotId: lot.id,
    delta: "0", resultingQty: lot.quantity, reason: quarantined ? "quarantine" : "reservation_release",
    actorId: actor, note: note ?? (quarantined ? "Lot quarantined" : "Lot released from quarantine"), at: nowIso(),
  });
  audit(store, actor, quarantined ? "inventory.lot_quarantined" : "inventory.lot_released", "StockLot", lot.id, { reason: note });
  return lot;
}

export function disposeLot(store: VgStore, lotId: string, actor: string, reason: string): StockLot {
  const lot = store.lots.find((l) => l.id === lotId);
  if (!lot) throw new OpError("VALIDATION_FAILED", "Lot not found.");
  if (!reason.trim()) throw new OpError("VALIDATION_FAILED", "A disposal reason is required.");
  const qty = lot.quantity;
  lot.kind = "disposal";
  lot.quantity = "0";
  store.movements.push({
    id: nextId("mov"), variantId: lot.variantId, locationId: lot.locationId, lotId: lot.id,
    delta: `-${qty}`, resultingQty: "0", reason: "disposal", actorId: actor, note: reason, at: nowIso(),
  });
  audit(store, actor, "inventory.lot_disposed", "StockLot", lot.id, { reason, before: qty, after: "0" });
  return lot;
}

/** Expiry overview rows for the admin screen. */
export function expiryOverview(store: VgStore): {
  expired: StockLot[];
  soon: { lot: StockLot; daysLeft: number }[];
  quarantined: StockLot[];
  damaged: StockLot[];
} {
  const now = Date.now();
  const soon: { lot: StockLot; daysLeft: number }[] = [];
  const expired: StockLot[] = [];
  for (const lot of store.lots) {
    if (!lot.expiryDate || lot.quantity === "0") continue;
    const days = Math.round((new Date(lot.expiryDate).getTime() - now) / 86_400_000);
    if (days < 0 && lot.kind === "regular" && !lot.isQuarantined) expired.push(lot);
    else if (days >= 0 && days <= 7 && lot.kind === "regular" && !lot.isQuarantined) soon.push({ lot, daysLeft: days });
  }
  return {
    expired,
    soon: soon.sort((a, b) => a.daysLeft - b.daysLeft),
    quarantined: store.lots.filter((l) => l.isQuarantined && l.quantity !== "0"),
    damaged: store.lots.filter((l) => l.kind === "damaged" && l.quantity !== "0"),
  };
}
