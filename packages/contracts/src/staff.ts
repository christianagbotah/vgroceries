/**
 * Shared API contracts — staff back office (dashboard, orders, fulfilment,
 * cashier sessions, customers, team, audit, settings, suppliers, purchases,
 * reports). Proposed REST rendering: /api/v1/admin/* and /api/v1/reports/*
 * (see docs/openapi.yaml).
 */

import type { Customer, Refund, StaffRole } from "./domain";
import type { PublicOrder } from "./checkout";
import type { AddressView } from "./account";

/* ---------------- dashboard ---------------- */

export interface DashboardActionable {
  awaitingConfirmation: number;
  readyToPick: number;
  picking: number;
  readyToDispatch: number;
  pendingPayments: number;
  returnsPending: number;
  refundsAttention: number;
  lowStock: number;
  expiringSoon: number;
  unassignedJobs: number;
  openSessions: number;
}

export interface DashboardRecentOrder {
  id: string;
  reference: string;
  customer: string;
  channel: string;
  total: number;
  paymentStatus: string;
  fulfilmentStatus: string;
  at: string;
  atLabel: string;
  totalLabel: string;
}

export interface SalesByDayRow {
  date: string;
  onlineMinor: number;
  posMinor: number;
  orders: number;
}

/** Reports bundle shared by the admin reports screen and the client adapter. */
export interface ReportBundleView {
  salesByDay: SalesByDayRow[];
  topProducts: { name: string; variant: string; qty: number; revenueMinor: number }[];
  fulfilmentCounts: Record<string, number>;
  deliveryCounts: Record<string, number>;
  returnsSummary: { total: number; pending: number; resolved: number; refundedMinor: number };
  cashSummary: { openSessions: number; expectedMinor: number; lastClosedDiffMinor: number };
  stockValue: { costBasisMinor: number; sellableUnits: number; zeroVariants: number; lowVariants: number };
  paymentsReconciliation: { settled: number; unsettled: number; exceptions: number };
}

export interface DashboardView {
  today: SalesByDayRow;
  actionable: DashboardActionable;
  recentOrders: DashboardRecentOrder[];
  reports: ReportBundleView;
}

/* ---------------- orders list + detail ---------------- */

export interface AdminOrderRow {
  id: string;
  reference: string;
  channel: string;
  customerName: string;
  customerPhone: string;
  fulfilment: string;
  totalLabel: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  deliveryStatus: string;
  lineCount: number;
  createdAtLabel: string;
  posReceiptNo?: string;
}

export interface AdminOrderFilters {
  channel?: string;
  status?: string;
  payment?: string;
  q?: string;
}

export interface OrderReservationView {
  id: string;
  quantity: string;
  expiresAt: string;
  consumedAt?: string;
  releasedAt?: string;
  releasedReason?: string;
  variantId: string;
}

export interface AdminOrderInternal {
  address?: AddressView;
  zone?: { id: string; name: string };
  customerId?: string;
  customerNotes: { at: string; by: string; text: string; internalOnly: boolean }[];
  reservations: OrderReservationView[];
  suggestions: { id: string; name: string; priceLabel: string; availableToSell: string }[];
  refunds: (Refund & { amountLabel: string })[];
}

export interface AdminOrderDetail {
  order: PublicOrder;
  internal: AdminOrderInternal;
}

export interface OrderActionRequest {
  orderId: string;
  action:
    | "confirm"
    | "picking"
    | "packed"
    | "ready_for_collection"
    | "collect"
    | "dispatch"
    | "deliver"
    | "cancel"
    | "note"
    | "substitute"
    | "resolve_review";
  note?: string;
  reason?: string;
  internalOnly?: boolean;
  lineId?: string;
  newVariantId?: string;
  permissionNote?: string;
  decision?: "fulfil" | "cancel_refund";
  actor?: string;
}

/* ---------------- fulfilment queues ---------------- */

export interface FulfilmentLineCard {
  id: string;
  productName: string;
  variantName: string;
  unit: string;
  quantity: string;
  note?: string;
  allocations: { lotId: string; lotNumber: string; quantity: string; expiry?: string }[];
  availableToSell: string;
  /** Total quantity allocated across lots (may be less than `quantity` on shortage). Optional: backend fulfilment authority may omit before picking starts. */
  allocatedQty?: string;
  /** `quantity − allocatedQty`, present only when a shortage exists. */
  shortageQty?: string;
  /** This line replaced an original ordered line (substitution outcome). */
  isSubstitution?: boolean;
}

export interface FulfilmentOrderCard {
  id: string;
  reference: string;
  customerName: string;
  channel: string;
  fulfilment: string;
  slotLabel?: string;
  totalLabel: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  lines: FulfilmentLineCard[];
  /** Staff member currently assigned to picking (latest "Picking started" actor). */
  pickerName?: string;
  /** When picking started (ISO + human label). */
  pickingStartedAt?: string;
  pickingStartedAtLabel?: string;
  /** Lines with allocations vs total lines — picking progress. */
  linesAllocated?: number;
  linesTotal?: number;
  /** True when any line has a shortage or pending substitution state. */
  hasExceptions?: boolean;
  /** Actor who packed the order (packed / handover queues). */
  packedByName?: string;
  packedAtLabel?: string;
  /**
   * Backend-provided permitted actions for this order in its current state.
   * The frontend renders actions it recognises and never invents transitions;
   * while the demo adapter drives this, the list mirrors the mock state machine.
   */
  allowedActions?: string[];
  /** Recent order events (timestamps + actor) surfaced for the handover trail. */
  events?: { atLabel: string; actor: string; action: string }[];
}

export interface FulfilmentQueues {
  confirm: { id: string; reference: string; customerName: string; paymentStatus: string; paymentMethod: string; fulfilment: string; totalLabel: string; createdAtLabel: string; lineCount: number }[];
  /** Orders confirmed and ready to start picking. */
  pick: FulfilmentOrderCard[];
  /** Orders with picking actively in progress. */
  picking: FulfilmentOrderCard[];
  /** Orders with line-level shortages or unresolved substitutions across active states. */
  exceptions: FulfilmentOrderCard[];
  /** Picking complete — waiting for packing confirmation. */
  pack: FulfilmentOrderCard[];
  dispatch: { id: string; reference: string; zone?: string; totalLabel: string; paymentStatus: string; paymentMethod: string; lineCount: number; slotLabel?: string; customerName?: string; packedAtLabel?: string; packedByName?: string }[];
  collection: { id: string; reference: string; customerName: string; fulfilmentStatus: string; paymentStatus: string; paymentMethod: string; totalLabel: string; lineCount: number; packedAtLabel?: string; packedByName?: string }[];
}

/* ---------------- cashier sessions ---------------- */

/** Cashier session row exactly as `admin.sessions` returns it. */
export interface SessionRow {
  id: string;
  cashierName: string;
  openedAt: string;
  openedAtLabel: string;
  closedAt?: string;
  closedAtLabel?: string;
  status: string;
  openingFloatMinor: number;
  openingFloatLabel: string;
  expectedMinor: number;
  expectedLabel: string;
  countedCashMinor?: number;
  countedLabel?: string;
  differenceMinor?: number;
  differenceLabel?: string;
  closeNote?: string;
  movements: { at: string; atLabel: string; kind: "cash_in" | "cash_out" | "drop"; amountMinor: number; amountLabel: string; note?: string }[];
  cashSales: number;
}

export interface SessionOpenRequest {
  cashierId: string;
  openingFloatMinor: number;
}

export interface SessionOpenResponse {
  sessionId: string;
}

export interface SessionMovementRequest {
  sessionId: string;
  kind: "cash_in" | "cash_out" | "drop";
  amountMinor: number;
  note: string;
  actor?: string;
}

export interface SessionMovementResponse {
  movements: number;
}

export interface SessionCloseRequest {
  sessionId: string;
  countedCashMinor: number;
  note: string;
  actor?: string;
}

export interface SessionCloseResponse {
  differenceMinor: number;
  differenceLabel?: string;
}

/* ---------------- customers, team, audit ---------------- */

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email?: string;
  isDemo: boolean;
  supportNotes: string[];
  createdAt: string;
  orderCount: number;
  spendLabel: string;
  returnCount: number;
  addressCount: number;
}

export interface CustomerDetailResponse {
  customer: Customer;
  addresses: AddressView[];
  orders: { id: string; reference: string; totalLabel: string; channel: string; fulfilmentStatus: string; paymentStatus: string; createdAtLabel: string }[];
  returns: { id: string; reference: string; status: string }[];
}

export interface TeamRow {
  id: string;
  name: string;
  role: StaffRole;
  phone: string;
  isDemo: boolean;
  openSessions: number;
}

export interface AuditRow {
  id: string;
  atLabel: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  reason?: string;
  before?: string;
  after?: string;
}

/* ---------------- settings ---------------- */

/** Business settings returned by `admin.settings`. */
export interface SettingsView {
  businessName: string;
  supportPhone: string;
  supportEmail: string;
  deliveryEnabled: boolean;
  collectionEnabled: boolean;
  reservationTtlMinutes: number;
  currency: string;
  lowStockThreshold: string;
  refundsRequireApproval: boolean;
  codEnabled: boolean;
}

/* ---------------- storefront CMS ---------------- */

export type CmsContentPageSlug = "help" | "returns-policy" | "privacy" | "terms";

export interface CmsContentSection {
  heading: string;
  body: string;
}

export interface CmsHomepageContent {
  badge: string;
  headline: string;
  emphasis: string;
  body: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
}

export interface CmsHomepageView extends CmsHomepageContent {}

export interface CmsContentPageView {
  slug: CmsContentPageSlug;
  title: string;
  intro: string;
  sections: CmsContentSection[];
}

export interface CmsHomepageAdminView {
  published: CmsHomepageContent;
  draft: CmsHomepageContent;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
  publishedAt: string;
}

export interface CmsContentPageAdminView {
  published: CmsContentPageView;
  draft: CmsContentPageView;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
  publishedAt: string;
}

export interface CmsOverviewView {
  homepage: {
    title: string;
    href: string;
    previewHref: string;
    hasUnpublishedChanges: boolean;
    updatedAt: string;
    publishedAt: string;
  };
  pages: {
    slug: CmsContentPageSlug;
    title: string;
    href: string;
    previewHref: string;
    hasUnpublishedChanges: boolean;
    updatedAt: string;
    publishedAt: string;
  }[];
}

/* ---------------- suppliers & purchasing ---------------- */

export interface SupplierRow {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes: string;
  isActive: boolean;
  poCount: number;
  openPoCount: number;
}

export interface PurchaseRow {
  id: string;
  reference: string;
  supplierName?: string;
  status: string;
  expectedLabel?: string;
  createdAtLabel: string;
  note?: string;
  lines: { productName: string; variantName: string; quantity: string; unitCostLabel: string }[];
}

export interface PurchaseCreateRequest {
  supplierId: string;
  expectedOn?: string;
  note?: string;
  lines: { variantId: string; quantity: string; unitCostMinor: number }[];
}

export interface PurchaseCreateResponse {
  poId: string;
  reference: string;
}

export interface PurchaseSendResponse {
  status: string;
}
