/**
 * Shared API contracts — POS (counter sales, holds, receipts).
 * POS completion is idempotent (reused key replays the receipt); quantities
 * are validated positive before any reservation is created.
 * Proposed REST rendering: /api/v1/pos/* (see docs/openapi.yaml).
 */

import type { CartLineInput, CheckoutPaymentMethod } from "./checkout";

export interface PosSearchRow {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  unit: string;
  priceMinor: number;
  priceLabel: string;
  barcode?: string;
  image: string;
  availableToSell: string;
  isAvailable: boolean;
}

export interface PosCompleteRequest {
  sessionId: string;
  cashierId?: string;
  lines: CartLineInput[];
  method: CheckoutPaymentMethod;
  discountMinor?: number;
  customerName?: string;
  customerPhone?: string;
  /** Required for cash sales; drives change calculation. */
  cashReceivedMinor?: number;
  /** Retry-safety: same key replays the original receipt. */
  idempotencyKey?: string;
}

export interface PosCompleteResponse {
  orderId: string;
  reference: string;
  receiptNo: string;
  totalMinor: number;
  totalLabel: string;
  changeMinor: number;
  changeLabel: string;
  lines: { productName: string; variantName: string; quantity: string; unitPriceMinor: number; lineTotalMinor: number }[];
  businessName: string;
  at: string;
}

export interface PosHoldRequest {
  sessionId: string;
  cashierId?: string;
  label?: string;
  lines: CartLineInput[];
}

export interface PosHoldResponse {
  draftId: string;
  label: string;
  expiresAt: string;
}

export interface PosDraftRow {
  id: string;
  label: string;
  createdAtLabel: string;
  expiresAt: string;
  lineCount: number;
  totalMinor: number;
  lines: { variantId: string; quantity: string; unitPriceMinor: number }[];
}

export interface PosResumeResponse {
  id: string;
  label: string;
  lines: { variantId: string; quantity: string; unitPriceMinor: number }[];
}

export interface PosReleaseDraftResponse {
  released: boolean;
}

export interface ReceiptLookupResponse {
  receiptNo: string;
  atLabel: string;
  method: string;
  totalMinor: number;
  totalLabel: string;
  cashierName: string;
  orderId: string;
  orderReference: string;
  lines: { id: string; productName: string; variantName: string; quantity: string; unitPriceMinor: number; unitTotal: number }[];
  returnable: { lineId: string; productName: string; variantName: string; eligible: string; unitPriceMinor: number }[];
}
