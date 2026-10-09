/**
 * Variety Groceries — shared domain types.
 *
 * Conventions (proposed application contracts, see docs/API_CONTRACTS.md):
 * - IDs are stable strings prefixed by entity (e.g. "prd_", "var_", "ord_").
 * - Timestamps are UTC ISO-8601 strings.
 * - Money is an integer in GHS minor units (pesewas). Currency code "GHS", visible "₵".
 * - Quantities are decimal strings (e.g. "1.5") or integers for piece-counted SKUs.
 *   Floating point is never used as stock authority.
 * - Payment, fulfilment, delivery, return, and refund statuses are separate dimensions.
 */

export type CurrencyCode = "GHS";

export type UnitKind = "piece" | "pack" | "carton" | "kg" | "litre" | "bag" | "bunch";

export interface UnitConversion {
  id: string;
  /** canonical sellable SKU unit, e.g. "piece" */
  baseUnit: UnitKind;
  /** alternate purchasing/selling unit, e.g. "carton" */
  altUnit: UnitKind;
  /** how many base units are in one alt unit (decimal string) */
  factor: string;
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** accent colour key used by product tiles */
  tint: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  /** e.g. "500 g", "1 L", "Pack of 6" */
  name: string;
  unit: UnitKind;
  /** sale unit size description used in stock math (base units per sale unit) */
  unitSize: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
  barcode?: string;
  /** purchasing unit (e.g. carton of 12) with explicit conversion factor */
  purchaseUnit?: UnitConversion;
  safetyStock: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  /** simple keyword bag for the shopping assistant; no invented ingredients */
  tags: string[];
  variants: string[]; // variant ids
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export type LotKind = "regular" | "returns_quarantine" | "damaged" | "disposal";

export interface StockLot {
  id: string;
  variantId: string;
  locationId: string;
  lotNumber: string;
  kind: LotKind;
  /** physical quantity currently held in this lot (decimal string) */
  quantity: string;
  receivedAt: string;
  expiryDate?: string;
  supplierId?: string;
  purchaseOrderId?: string;
  /** true while a stocktake or inspection holds the lot out of sale */
  isQuarantined: boolean;
  notes?: string;
}

export type MovementReason =
  | "received"
  | "sale"
  | "sale_reversal"
  | "adjustment"
  | "wastage"
  | "return_restock"
  | "quarantine"
  | "disposal"
  | "stocktake_correction"
  | "reservation_release";

export interface StockMovement {
  id: string;
  variantId: string;
  locationId: string;
  lotId?: string;
  /** signed decimal string; negative removes stock */
  delta: string;
  resultingQty: string;
  reason: MovementReason;
  reference?: string; // order id, return id, adjustment id…
  actorId: string;
  note?: string;
  at: string;
}

export interface Reservation {
  id: string;
  variantId: string;
  orderId: string;
  quantity: string;
  channel: "online" | "pos";
  createdAt: string;
  /** reservations hold until this instant; expiry releases the hold */
  expiresAt: string;
  /** consumed when the single depletion event happens (dispatch/collect) */
  consumedAt?: string;
  releasedAt?: string;
  releasedReason?: "expired" | "cancelled" | "checkout_abandoned";
}

export interface StockAdjustment {
  id: string;
  variantId: string;
  lotId: string;
  delta: string;
  reason: string;
  note?: string;
  status: "draft" | "pending_approval" | "approved" | "rejected";
  requestedBy: string;
  approvedBy?: string;
  at: string;
}

export interface Stocktake {
  id: string;
  reference: string;
  status: "open" | "counting" | "review" | "closed";
  locationId: string;
  openedAt: string;
  closedAt?: string;
  lines: StocktakeLine[];
  openedBy: string;
}

export interface StocktakeLine {
  variantId: string;
  expectedQty: string;
  countedQty?: string;
  variance?: string;
  status: "uncounted" | "counted" | "variance";
}

export interface Location {
  id: string;
  name: string;
  kind: "store" | "backroom" | "quarantine";
  address: string;
  isActive: boolean;
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export interface Address {
  id: string;
  customerId?: string; // absent for one-off guest addresses
  label: string;
  recipientName: string;
  phone: string; // +233 format
  locality: string;
  street: string;
  landmark?: string;
  ghanaPostGps?: string; // GhanaPostGPS digital address, not geocoded
  zoneId?: string;
  isDefault?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  addressIds: string[];
  isDemo: boolean;
  supportNotes: string[];
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export type OrderChannel = "online" | "pos";

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

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "received"
  | "inspected"
  | "resolved";

export type RefundStatus =
  | "requested"
  | "awaiting_approval"
  | "processing"
  | "succeeded"
  | "failed"
  | "requires_review";

export type PaymentMethod =
  | "mobile_money"
  | "card_hosted"
  | "bank_transfer"
  | "cash_counter"
  | "cash_on_delivery";

export interface OrderLine {
  id: string;
  orderId: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  unit: UnitKind;
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** allocated lot-level picks (suggested FEFO) */
  allocations: Allocation[];
  substitutionOfLineId?: string;
  note?: string;
}

export interface Allocation {
  lotId: string;
  quantity: string;
}

export interface OrderEvent {
  at: string;
  actor: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  note?: string;
}

export interface Order {
  id: string;
  reference: string; // e.g. VG-2C7K9Q shown to customer
  channel: OrderChannel;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  addressId?: string;
  fulfilment: "delivery" | "collection";
  zoneId?: string;
  slotId?: string;
  slotLabel?: string;
  lines: string[]; // OrderLine ids
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  fulfilmentStatus: FulfilmentStatus;
  deliveryStatus: DeliveryStatus;
  notes: { at: string; by: string; text: string; internalOnly: boolean }[];
  events: OrderEvent[];
  posSessionId?: string;
  posReceiptNo?: string;
  /** set once stock has been consumed by the single depletion event */
  stockConsumedAt?: string;
  createdAt: string;
  /** secret needed together with the reference for guest tracking */
  verificationCode?: string;
}

export interface PaymentAttempt {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amountMinor: number;
  status: "initiated" | "pending" | "succeeded" | "failed" | "expired";
  providerRef?: string;
  idempotencyKey: string;
  callbackCount: number;
  settlementState: "unsettled" | "settled" | "reconciled" | "exception";
  failureReason?: string;
  createdAt: string;
  resolvedAt?: string;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* POS                                                                 */
/* ------------------------------------------------------------------ */

export interface CashierSession {
  id: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingFloatMinor: number;
  status: "open" | "closed";
  movements: { at: string; kind: "cash_in" | "cash_out" | "drop"; amountMinor: number; note?: string }[];
  expectedCashMinor?: number;
  countedCashMinor?: number;
  differenceMinor?: number;
  closeNote?: string;
}

export interface HeldDraftSale {
  id: string;
  sessionId: string;
  cashierId: string;
  label: string;
  lines: { variantId: string; quantity: string; unitPriceMinor: number }[];
  createdAt: string;
  reservationIds: string[];
  expiresAt: string;
}

export interface PosTransaction {
  orderId: string;
  receiptNo: string;
  at: string;
  method: PaymentMethod;
  totalMinor: number;
  cashierName: string;
}

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

export interface DeliveryZone {
  id: string;
  name: string;
  areas: string[];
  feeMinor: number;
  minimumOrderMinor: number;
  serviceHours: string;
  cutoff: string;
  /** slot capacity per slot; owner-configurable */
  slotsPerDay: number;
  isActive: boolean;
}

export interface DeliverySlot {
  id: string;
  zoneId: string;
  date: string;
  window: string;
  capacity: number;
  booked: number;
}

export interface Rider {
  id: string;
  name: string;
  phone: string;
  kind: "in_house" | "contracted";
  vehicle: "motorcycle" | "bicycle" | "car";
  zoneIds: string[];
  isAvailable: boolean;
  activeJobId?: string;
  /** last location update if permission granted; demo-labelled */
  lastLocationAt?: string;
  lastLocationLabel?: string;
  isDemo: boolean;
}

export interface DeliveryProvider {
  id: string;
  name: string;
  /** capabilities claimed in the adapter contract; not live integrations */
  capabilities: ("quote" | "book" | "cancel" | "status" | "webhook" | "proof_of_delivery")[];
  status: "not_connected" | "configured";
  notes: string;
}

export interface DeliveryJob {
  id: string;
  orderId: string;
  zoneId: string;
  status: DeliveryStatus;
  riderId?: string;
  providerId?: string;
  isManualBooking?: boolean;
  assignedAt?: string;
  addressId?: string;
  instructions?: string;
  /** cash to collect for COD orders (independent of delivery completion) */
  cashToCollectMinor?: number;
  cashCollectedAt?: string;
  remittedAt?: string;
  proof?: { method: "pin" | "signature" | "photo_note"; detail: string; at: string };
  events: { at: string; actor: string; action: string; note?: string }[];
  failureReason?: string;
  rescheduledFor?: string;
}

/* ------------------------------------------------------------------ */
/* Returns & refunds                                                   */
/* ------------------------------------------------------------------ */

export interface ReturnLine {
  id: string;
  returnId: string;
  orderLineId: string;
  quantity: string;
  reason: string;
  requestedRefundMinor: number;
  approvedRefundMinor?: number;
}

export interface ReturnRequest {
  id: string;
  reference: string;
  orderId: string;
  channel: OrderChannel;
  customerId?: string;
  requestedBy: "customer" | "staff";
  lines: string[]; // ReturnLine ids
  status: ReturnStatus;
  evidenceNote?: string;
  receivedAt?: string;
  inspectedAt?: string;
  disposition?: {
    kind: "restock_saleable" | "damaged_unsaleable" | "quarantine_pending" | "not_returned";
    /** Every credited lot and its original quantity, for complete, guarded reversal. */
    stockLots?: { lotId: string; quantity: string }[];
    /** First credited lot, retained for existing clients. */
    lotId?: string;
    note: string;
    by: string;
    at: string;
  };
  createdAt: string;
}

export interface Refund {
  id: string;
  /** undefined for cancellation refunds (paid orders cancelled before physical return) */
  returnId?: string;
  orderId: string;
  amountMinor: number;
  status: RefundStatus;
  method: PaymentMethod | "manual_recording";
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  providerRef?: string;
  /** transfer state is only known once execution starts; not a transfer before that */
  providerTransferState?: "not_a_transfer" | "pending" | "succeeded" | "failed";
  retryCount: number;
  createdAt: string;
  resolvedAt?: string;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Suppliers & purchasing                                              */
/* ------------------------------------------------------------------ */

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes: string;
  isActive: boolean;
}

export interface PurchaseOrder {
  id: string;
  reference: string;
  supplierId: string;
  status: "draft" | "sent" | "partially_received" | "received" | "cancelled";
  lines: { variantId: string; quantity: string; unitCostMinor: number }[];
  expectedAt?: string;
  createdAt: string;
  note?: string;
}

export interface GoodsReceipt {
  id: string;
  purchaseOrderId?: string;
  supplierId: string;
  lines: { variantId: string; lotNumber: string; quantity: string; expiryDate?: string }[];
  receivedAt: string;
  receivedBy: string;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* People, audit, AI                                                   */
/* ------------------------------------------------------------------ */

export type StaffRole =
  | "owner_admin"
  | "operations_manager"
  | "inventory_officer"
  | "cashier"
  | "picker_packer"
  | "dispatcher"
  | "finance_reviewer"
  | "rider";

export interface StaffUser {
  id: string;
  name: string;
  role: StaffRole;
  phone: string;
  isDemo: boolean;
}

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  reason?: string;
  before?: string;
  after?: string;
}

export interface AISuggestion {
  id: string;
  kind:
    | "shopping_answer"
    | "budget_basket"
    | "alternative"
    | "replenishment"
    | "expiry_promotion"
    | "dispatch_grouping"
    | "operations_explanation"
    | "business_answer"
    | "exception_flag";
  title: string;
  detail: string;
  evidence: string[];
  dataPeriod: string;
  status: "suggested" | "reviewed" | "dismissed";
  requiresRole: StaffRole[];
  createdAt: string;
  /** always deterministic in the prototype */
  source: "deterministic_demo";
}

/* ------------------------------------------------------------------ */
/* Labels (human-readable)                                             */
/* ------------------------------------------------------------------ */

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  pending: "Payment pending",
  succeeded: "Paid",
  failed: "Payment failed",
  expired: "Payment expired",
  partially_refunded: "Partially refunded",
  refund_pending: "Refund pending",
  refunded: "Refunded",
  requires_review: "Needs review",
};

export const FULFILMENT_LABELS: Record<FulfilmentStatus, string> = {
  awaiting_confirmation: "Awaiting confirmation",
  confirmed: "Confirmed",
  picking: "Picking",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  ready_for_collection: "Ready for collection",
  collected: "Collected",
  cancelled: "Cancelled",
};

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  accepted: "Accepted",
  picked_up: "Picked up",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed: "Failed",
  rescheduled: "Rescheduled",
  return_to_store: "Return to store",
};

export const RETURN_LABELS: Record<ReturnStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  received: "Received",
  inspected: "Inspected",
  resolved: "Resolved",
};

export const REFUND_LABELS: Record<RefundStatus, string> = {
  requested: "Requested",
  awaiting_approval: "Awaiting approval",
  processing: "Processing",
  succeeded: "Succeeded",
  failed: "Failed",
  requires_review: "Needs review",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mobile_money: "Mobile Money",
  card_hosted: "Card (hosted checkout)",
  bank_transfer: "Bank transfer (verified)",
  cash_counter: "Cash at counter",
  cash_on_delivery: "Cash on delivery",
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner_admin: "Owner / Admin",
  operations_manager: "Operations Manager",
  inventory_officer: "Inventory Officer",
  cashier: "Cashier",
  picker_packer: "Picker / Packer",
  dispatcher: "Dispatcher",
  finance_reviewer: "Finance / Refund Reviewer",
  rider: "Rider",
};

/* ------------------------------------------------------------------ */
/* Cart (client-side, non-authoritative)                               */
/* ------------------------------------------------------------------ */

export interface CartLine {
  variantId: string;
  productId: string;
  quantity: string;
  addedAt: string;
  /** display-only snapshot; price/availability always revalidated by the service */
  name: string;
  image: string;
  priceMinor: number;
}
