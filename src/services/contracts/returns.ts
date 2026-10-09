/**
 * Shared API contracts — returns, refunds, payments (account + staff views).
 * Refund and payment states are tracked SEPARATELY from order payment status;
 * an order only becomes "refunded" after a confirmed provider transfer.
 * Proposed REST rendering: /api/v1/returns/*, /api/v1/refunds/*, /api/v1/payments/*.
 */

/* ---------------- return detail (shared by account + staff) ---------------- */

export interface ReturnDetailView {
  id: string;
  reference: string;
  orderId: string;
  orderReference?: string;
  channel: string;
  status: string;
  requestedBy: string;
  evidenceNote?: string;
  createdAtLabel: string;
  receivedAt?: string;
  inspectedAt?: string;
  disposition?: { kind: string; note: string; by: string; at: string };
  lines: {
    id: string;
    productName: string;
    variantName: string;
    quantity: string;
    reason: string;
    requestedRefundLabel: string;
    approvedRefundLabel?: string;
  }[];
  refunds: { id: string; status: string; amountLabel: string; method: string; providerRef?: string; retryCount: number }[];
}

/* ---------------- staff returns list ---------------- */

export interface AdminReturnRow {
  id: string;
  reference: string;
  orderId: string;
  orderReference?: string;
  channel: string;
  customerName?: string;
  requestedBy: string;
  status: string;
  createdAtLabel: string;
  lines: { productName: string; variantName: string; quantity: string; reason: string; refundLabel: string }[];
  disposition?: { kind: string; note: string };
  evidenceNote?: string;
  refundStatus?: string;
  /** Remaining refundable amount for this return (committed attempts deducted). */
  refundableMinor: number;
}

export interface ReturnActionRequest {
  returnId: string;
  action: "approve" | "reject" | "receive" | "inspect" | "request_refund" | "retry_refund";
  actor?: string;
  /** "restock_saleable" | "restock_quarantine" | "dispose" for inspect. */
  disposition?: string;
  note?: string;
  /** Refund method when requesting a refund. */
  method?: string;
}

export interface ReturnActionResponse {
  done: boolean;
}

/* ---------------- refunds ledger ---------------- */

export interface RefundRow {
  id: string;
  returnReference?: string;
  orderReference?: string;
  amountLabel: string;
  status: string;
  method: string;
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  providerRef?: string;
  /** Only known once provider execution starts; undefined before that. */
  providerTransferState?: string;
  retryCount: number;
  createdAtLabel: string;
}

export interface RefundActionRequest {
  refundId: string;
  action: "approve" | "execute" | "retry";
  actor?: string;
}

export interface RefundActionResponse {
  done: boolean;
}

/* ---------------- payments ledger ---------------- */

export interface PaymentRow {
  id: string;
  orderReference?: string;
  channel?: string;
  method: string;
  amountLabel: string;
  status: string;
  providerRef?: string;
  settlementState: string;
  callbackCount: number;
  failureReason?: string;
  note?: string;
  createdAtLabel: string;
  orderId: string;
}
