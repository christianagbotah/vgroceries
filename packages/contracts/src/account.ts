/**
 * Shared API contracts — customer account area (orders, returns, addresses).
 * Proposed REST rendering: /api/v1/account/* (see docs/openapi.yaml).
 */

import type { Customer } from "./domain";
import type { FulfilmentStatus, PaymentStatus } from "./checkout";

export interface AddressView {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  locality: string;
  street: string;
  landmark?: string;
  ghanaPostGps?: string;
  isDefault?: boolean;
}

export interface AccountRecentOrderRow {
  id: string;
  reference: string;
  totalLabel: string;
  fulfilmentStatus: string;
  paymentStatus: string;
  createdAtLabel: string;
}

export interface AccountSummaryResponse {
  customer: Customer;
  addresses: AddressView[];
  ordersCount: number;
  openOrders: number;
  returnsCount: number;
  recentOrders: AccountRecentOrderRow[];
}

export interface AccountOrderRow {
  id: string;
  reference: string;
  totalLabel: string;
  fulfilmentStatus: string;
  paymentStatus: string;
  fulfilment: string;
  createdAtLabel: string;
  lineCount: number;
}

export interface AccountCancelResponse {
  fulfilmentStatus: FulfilmentStatus | string;
}

/** Eligible quantity + refund ceiling for one original order line. */
export interface ReturnLineRow {
  lineId: string;
  productName: string;
  variantName: string;
  quantity: string;
  returnedSoFar: string;
  eligible: string;
  unitPriceMinor: number;
  unitPriceLabel: string;
  maxRefundMinor: number;
  maxRefundLabel: string;
}

export interface ReturnLineInput {
  orderLineId: string;
  /** Decimal string quantity; aggregated per order line and capped at the
   *  remaining eligible balance (duplicate lines are summed, not bypassed). */
  quantity: string;
  reason: string;
}

export interface CreateReturnRequest {
  orderId: string;
  requestedBy: string;
  lines: ReturnLineInput[];
  note?: string;
}

export interface CreateReturnResponse {
  returnId: string;
  reference: string;
  status: string;
}

export interface AccountReturnRow {
  id: string;
  reference: string;
  orderId: string;
  orderReference?: string;
  status: string;
  createdAtLabel: string;
  lines: { productName: string; quantity: string; reason: string; refundLabel: string }[];
  refund?: { id: string; status: string; amountMinor: number; method: string };
}
