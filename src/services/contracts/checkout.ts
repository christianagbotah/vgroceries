/**
 * Shared API contracts — checkout, payment status, public order tracking.
 * Status dimensions stay SEPARATE (payment / fulfilment / delivery) per the
 * domain conventions; the proposed REST rendering is /api/v1/checkout/*,
 * /api/v1/orders/* in docs/openapi.yaml.
 */

/* ---------------- delivery configuration (public) ---------------- */

export interface ZoneView {
  id: string;
  name: string;
  areas: string[];
  feeMinor: number;
  minimumOrderMinor: number;
  serviceHours: string;
  cutoff: string;
  slotsPerDay: number;
  isActive: boolean;
}

export interface SlotView {
  id: string;
  zoneId: string;
  date: string;
  window: string;
  capacity: number;
  booked: number;
}

/* ---------------- quote ---------------- */

/** One cart line as the client sends it (and the quote echoes back). */
export interface CartLineInput {
  variantId: string;
  /** Decimal string quantity, e.g. "1" or "1.5". */
  quantity: string;
}

export interface QuoteLineResult {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  unit: string;
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  available: string;
  availableNow: boolean;
}

export interface QuoteConflict {
  variantId: string;
  productName: string;
  variantName: string;
  requested: string;
  available: string;
}

export interface QuoteResponse {
  ok: boolean;
  lines: QuoteLineResult[];
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  minOrderMinor: number;
  meetsMinimum: boolean;
  conflicts: QuoteConflict[];
}

/* ---------------- order creation ---------------- */

export type CheckoutFulfilment = "delivery" | "collection";
export type CheckoutPaymentMethod =
  | "mobile_money"
  | "card_hosted"
  | "bank_transfer"
  | "cash_counter"
  | "cash_on_delivery";

export interface GuestAddressInput {
  label?: string;
  recipientName: string;
  phone: string;
  locality: string;
  street: string;
  landmark?: string;
  ghanaPostGps?: string;
}

export interface CompleteOrderRequest {
  lines: CartLineInput[];
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerId?: string;
  addressId?: string;
  guestAddress?: GuestAddressInput;
  fulfilment: CheckoutFulfilment;
  zoneId?: string;
  slotId?: string;
  paymentMethod: CheckoutPaymentMethod;
  note?: string;
  /** Retry-safety: same key + same input replays the original order. */
  idempotencyKey: string;
}

export interface CompleteOrderResponse {
  orderId: string;
  reference: string;
  verificationCode: string;
  paymentRequired: boolean;
}

/* ---------------- payment provider outcome (webhook shape) ---------------- */

export interface PaymentOutcomeRequest {
  orderId: string;
  outcome: "succeeded" | "failed" | "pending";
  /** Providers send a reference; the mock accepts a duplicate-safe replay. */
  providerRef?: string;
}

export interface PaymentOutcomeResponse {
  duplicate: boolean;
  paymentStatus: PaymentStatus;
}

/* ---------------- public order view (status / tracking) ---------------- */

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "succeeded"
  | "failed"
  | "expired"
  | "partially_refunded"
  | "refund_pending"
  | "refunded"
  | "requires_review";

export type FulfilmentStatus =
  | "awaiting_confirmation"
  | "confirmed"
  | "picking"
  | "packed"
  | "dispatched"
  | "delivered"
  | "ready_for_collection"
  | "collected"
  | "cancelled";

export type DeliveryStatus =
  | "unassigned"
  | "assigned"
  | "accepted"
  | "picked_up"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "rescheduled"
  | "return_to_store";

export interface OrderEventView {
  at: string;
  atLabel: string;
  actor: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  note?: string;
}

export interface PublicOrderNote {
  at: string;
  by: string;
  text: string;
}

export interface PaymentAttemptView {
  id: string;
  method: string;
  status: string;
  amountMinor: number;
  amountLabel: string;
  callbackCount: number;
  providerRef?: string;
  settlementState: string;
  failureReason?: string;
  note?: string;
  createdAt: string;
}

export interface OrderLineView {
  id: string;
  productName: string;
  variantName: string;
  unit: string;
  quantity: string;
  unitPriceMinor: number;
  unitPriceLabel: string;
  lineTotalMinor: number;
  lineTotalLabel: string;
  allocations: { lotId: string; quantity: string }[];
  note?: string;
  substitutionOfLineId?: string;
  productId: string;
  variantId: string;
}

export interface OrderJobView {
  id: string;
  status: string;
  riderName?: string;
  proof?: { method: string; detail: string; at: string };
  failureReason?: string;
  rescheduledFor?: string;
  cashToCollectMinor?: number;
  cashToCollectLabel?: string;
  cashCollectedAt?: string;
  remittedAt?: string;
}

/** The customer-safe order projection shared by status + tracking screens. */
export interface PublicOrder {
  id: string;
  reference: string;
  channel: "online" | "pos";
  customerName: string;
  customerPhone: string;
  fulfilment: CheckoutFulfilment;
  slotLabel?: string;
  createdAt: string;
  createdAtLabel: string;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  totalLabel: string;
  paymentMethod: CheckoutPaymentMethod;
  paymentStatus: PaymentStatus;
  fulfilmentStatus: FulfilmentStatus;
  deliveryStatus: DeliveryStatus;
  paymentAttempts: PaymentAttemptView[];
  lines: OrderLineView[];
  notes: PublicOrderNote[];
  events: OrderEventView[];
  job?: OrderJobView;
  returns: { id: string; reference: string; status: string; createdAt: string }[];
  posReceiptNo?: string;
  stockConsumedAt?: string;
  verificationCode?: string;
}

export interface TrackRequest {
  reference: string;
  code: string;
}
