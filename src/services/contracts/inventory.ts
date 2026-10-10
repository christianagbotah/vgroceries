/**
 * Shared API contracts — inventory (lots, movements, receiving, adjustments,
 * stocktakes, expiry, quarantine). Stock authority lives behind the service:
 * pages never compute availability themselves.
 * Proposed REST rendering: /api/v1/inventory/* (see docs/openapi.yaml).
 */

export interface InventoryOverviewRow {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  unit: string;
  sellablePhysical: string;
  reserved: string;
  safetyStock: string;
  availableToSell: string;
  isAvailable: boolean;
  nextExpiry?: string;
  lotCount: number;
  lastMovement?: string;
  lastMovementAt?: string;
  image: string;
}

export interface InventoryOverviewResponse {
  rows: InventoryOverviewRow[];
  total: number;
}

export interface LotRow {
  id: string;
  productName: string;
  variantName: string;
  lotNumber: string;
  quantity: string;
  kind: string;
  isQuarantined: boolean;
  expired: boolean;
  expiryDate?: string;
  location: string;
  supplierName?: string;
  notes?: string;
  variantId: string;
}

export interface ReceiveLineInput {
  variantId: string;
  quantity: string;
  lotNumber?: string;
  expiryDate?: string;
  unitCostMinor?: number;
  location?: string;
}

export interface ReceiveRequest {
  supplierId?: string;
  poRef?: string;
  lines: ReceiveLineInput[];
  note?: string;
  actor?: string;
}

export interface ReceiveResponse {
  receiptId: string;
}

export interface ReceiptRow {
  id: string;
  supplierName?: string;
  poRef?: string;
  lines: { productName?: string; variantName?: string; lotNumber: string; quantity: string; expiryDate?: string }[];
  receivedAtLabel: string;
  receivedBy?: string;
  note?: string;
}

export interface AdjustmentRow {
  id: string;
  productName: string;
  variantName: string;
  lotNumber?: string;
  delta: string;
  reason: string;
  note?: string;
  status: string;
  requestedBy?: string;
  approvedBy?: string;
  atLabel: string;
}

export interface AdjustmentCreateRequest {
  lines: { variantId: string; lotId?: string; delta: string; reason: string; note?: string }[];
  actor?: string;
}

export interface AdjustmentCreateResponse {
  adjustmentId: string;
  status: string;
}

export interface AdjustmentDecideRequest {
  adjustmentId: string;
  decision: "approve" | "reject";
  actor?: string;
}

export interface StocktakeRow {
  id: string;
  reference: string;
  status: string;
  openedAtLabel: string;
  closedAt?: string;
  openedBy?: string;
  lines: { variantId: string; productName: string; variantName: string; expectedQty: string; countedQty?: string; variance?: string; status: string }[];
}

export interface StocktakeOpenRequest {
  variantIds: string[];
  actor?: string;
}

export interface StocktakeOpenResponse {
  stocktakeId: string;
  reference: string;
}

export interface StocktakeCountRequest {
  stocktakeId: string;
  /** variantId → counted quantity (decimal string). */
  counts: Record<string, string>;
}

export interface StocktakeCloseRequest {
  stocktakeId: string;
  applyCorrections: boolean;
}

/** Lot row on the expiry overview screen. */
export interface ExpiryLotRow {
  id: string;
  productName: string;
  variantName: string;
  lotNumber: string;
  quantity: string;
  expiryDate?: string;
  notes?: string;
  variantId: string;
  kind: string;
  isQuarantined: boolean;
  location: string;
}

export interface ExpiryResponse {
  expired: ExpiryLotRow[];
  soon: (ExpiryLotRow & { daysLeft: number })[];
  quarantined: ExpiryLotRow[];
  damaged: ExpiryLotRow[];
}

export interface LotQuarantineRequest {
  lotId: string;
  quarantine: boolean;
  note?: string;
  actor?: string;
}

export interface LotDisposeRequest {
  lotId: string;
  reason: string;
  actor?: string;
}
