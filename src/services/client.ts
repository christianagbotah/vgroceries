/**
 * Typed client adapter for the mock API — THE swap point for the real
 * backend. Pages call these functions only; replacing this module's
 * fetch with a real API client (same operation contracts) requires no
 * page rewrites. See docs/API_CONTRACTS.md.
 */

export class ApiError extends Error {
  code: string;
  details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

type QueryValue = string | number | boolean | undefined | null;

export async function api<T = unknown>(
  op: string,
  options?: { query?: Record<string, QueryValue>; body?: Record<string, unknown> }
): Promise<T> {
  const method = options?.body !== undefined ? "POST" : "GET";
  let url = `/api/mock/v1/${op.replace(/\./g, "/")}`;
  if (options?.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(options?.body ?? {}) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("NETWORK", "Could not reach the service. Check your connection and try again.");
  }
  let json: { ok?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new ApiError("BAD_RESPONSE", "The service returned an unreadable response.");
  }
  if (!res.ok || !json.ok || json.error) {
    throw new ApiError(json.error?.code ?? "HTTP_" + res.status, json.error?.message ?? "Request failed.", json.error?.details);
  }
  return json.data as T;
}

/* Typed operation helpers used across the app ------------------------ */

import type {
  AISuggestion,
  CashierSession,
  Category,
  Customer,
  DeliveryJob,
  Order,
  PaymentAttempt,
  Refund,
  ReturnRequest,
  StaffRole,
} from "@/types/domain";
import type { CatalogProduct, CatalogVariant, ReportBundleView, SlotView, ZoneView } from "@/services/views";

export type { CatalogProduct, CatalogVariant, ReportBundleView, ZoneView, SlotView };

export interface PublicOrder {
  id: string; reference: string; channel: "online" | "pos"; customerName: string; customerPhone: string;
  fulfilment: "delivery" | "collection"; slotLabel?: string; createdAt: string; createdAtLabel: string;
  subtotalMinor: number; discountMinor: number; deliveryFeeMinor: number; totalMinor: number; totalLabel: string;
  paymentMethod: Order["paymentMethod"]; paymentStatus: Order["paymentStatus"];
  fulfilmentStatus: Order["fulfilmentStatus"]; deliveryStatus: Order["deliveryStatus"];
  paymentAttempts: { id: string; method: string; status: string; amountMinor: number; amountLabel: string; callbackCount: number; providerRef?: string; settlementState: string; failureReason?: string; note?: string; createdAt: string }[];
  lines: { id: string; productName: string; variantName: string; unit: string; quantity: string; unitPriceMinor: number; unitPriceLabel: string; lineTotalMinor: number; lineTotalLabel: string; allocations: { lotId: string; quantity: string }[]; note?: string; substitutionOfLineId?: string; productId: string; variantId: string }[];
  notes: { at: string; by: string; text: string }[];
  events: { at: string; atLabel: string; actor: string; action: string; fromStatus?: string; toStatus?: string; note?: string }[];
  job?: { id: string; status: string; riderName?: string; proof?: { method: string; detail: string; at: string }; failureReason?: string; rescheduledFor?: string; cashToCollectMinor?: number; cashToCollectLabel?: string; cashCollectedAt?: string; remittedAt?: string };
  returns: { id: string; reference: string; status: string; createdAt: string }[];
  posReceiptNo?: string; stockConsumedAt?: string; verificationCode?: string;
}

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

export const apiOps = {
  /* catalogue */
  catalogCategories: () => api<(Category & { availableProducts: number })[]>("catalog.categories"),
  products: (p: { query?: string; category?: string; sort?: string; page?: number; perPage?: number }) =>
    api<{ items: CatalogProduct[]; total: number; page: number; pages: number; perPage: number }>("catalog.list", { query: p as Record<string, QueryValue> }),
  product: (slug: string) =>
    api<{ product: CatalogProduct; related: CatalogProduct[]; purchasable: boolean }>("catalog.product", { query: { slug } }),
  byVariants: (variantIds: string[]) => api<CatalogProduct[]>("catalog.by-variants", { body: { variantIds } }),

  /* checkout */
  quote: (lines: { variantId: string; quantity: string }[], zoneId?: string) =>
    api<{ ok: boolean; lines: unknown[]; subtotalMinor: number; deliveryFeeMinor: number; totalMinor: number; minOrderMinor: number; meetsMinimum: boolean; conflicts: { variantId: string; productName: string; variantName: string; requested: string; available: string }[] }>("checkout.quote", { body: { lines, zoneId } }),
  complete: (body: Record<string, unknown>) =>
    api<{ orderId: string; reference: string; verificationCode: string; paymentRequired: boolean }>("checkout.complete", { body }),
  paymentOutcome: (orderId: string, outcome: "succeeded" | "failed" | "pending") =>
    api<{ duplicate: boolean; paymentStatus: string }>("checkout.payment-outcome", { body: { orderId, outcome } }),
  orderStatus: (orderId: string) => api<PublicOrder>("checkout.status", { query: { orderId } }),
  track: (reference: string, code: string) => api<PublicOrder>("orders.track", { body: { reference, code } }),
  zones: () => api<ZoneView[]>("checkout.zones"),
  slots: (zoneId: string) => api<SlotView[]>("checkout.slots", { query: { zoneId } }),

  /* account */
  accountSummary: (customerId?: string) => api<{
    customer: Customer; addresses: { id: string; label: string; recipientName: string; phone: string; locality: string; street: string; landmark?: string; ghanaPostGps?: string; isDefault?: boolean }[];
    ordersCount: number; openOrders: number; returnsCount: number;
    recentOrders: { id: string; reference: string; totalLabel: string; fulfilmentStatus: string; paymentStatus: string; createdAtLabel: string }[];
  }>("account.summary", { query: { customerId } }),
  accountOrders: (customerId?: string) => api<{ id: string; reference: string; totalLabel: string; fulfilmentStatus: string; paymentStatus: string; fulfilment: string; createdAtLabel: string; lineCount: number }[]>("account.orders", { query: { customerId } }),
  accountCancel: (orderId: string, reason: string) => api<{ fulfilmentStatus: string }>("account.cancel", { body: { orderId, reason } }),
  returnLines: (orderId: string) => api<{ lineId: string; productName: string; variantName: string; quantity: string; returnedSoFar: string; eligible: string; unitPriceMinor: number; unitPriceLabel: string; maxRefundMinor: number; maxRefundLabel: string }[]>("account.return-lines", { body: { orderId } }),
  createReturn: (body: Record<string, unknown>) => api<{ returnId: string; reference: string; status: string }>("account.create-return", { body }),
  accountReturns: (customerId?: string) => api<{
    id: string; reference: string; orderId: string; orderReference?: string; status: string; createdAtLabel: string;
    lines: { productName: string; quantity: string; reason: string; refundLabel: string }[];
    refund?: { id: string; status: string; amountMinor: number; method: string };
  }[]>("account.returns", { query: { customerId } }),
  returnDetail: (returnId: string) => api<{
    id: string; reference: string; orderId: string; orderReference?: string; channel: string; status: string; requestedBy: string; evidenceNote?: string;
    createdAtLabel: string; receivedAt?: string; inspectedAt?: string;
    disposition?: { kind: string; note: string; by: string; at: string };
    lines: { id: string; productName: string; variantName: string; quantity: string; reason: string; requestedRefundLabel: string; approvedRefundLabel?: string }[];
    refunds: { id: string; status: string; amountLabel: string; method: string; providerRef?: string; retryCount: number }[];
  }>("returns.detail", { query: { returnId } }),

  /* AI (customer) */
  assistant: (question: string) => api<{ answer: string; evidence: string[]; suggestions: { productId: string; variantId: string; label: string; priceMinor: number; available: string }[] }>("ai.assistant", { body: { question } }),
  budgetBasket: (budgetMinor: number) => api<{ items: { productId: string; variantId: string; label: string; priceMinor: number; available: string }[]; totalMinor: number; note: string }>("ai.budget-basket", { body: { budgetMinor } }),

  /* staff */
  dashboard: () => api<ReturnType<typeof import("@/services/mock/engine/reports").dashboardSummary>>("admin.dashboard"),
  orders: (f: { channel?: string; status?: string; payment?: string; q?: string }) =>
    api<{ id: string; reference: string; channel: string; customerName: string; customerPhone: string; fulfilment: string; totalLabel: string; paymentStatus: string; fulfilmentStatus: string; deliveryStatus: string; lineCount: number; createdAtLabel: string; posReceiptNo?: string }[]>("admin.orders", { query: f as Record<string, QueryValue> }),
  order: (orderId: string) => api<{ order: PublicOrder; internal: { address?: { id: string; label?: string; recipientName: string; phone: string; locality: string; street: string; landmark?: string; ghanaPostGps?: string; zoneId?: string; isDefault?: boolean }; zone?: { id: string; name: string }; customerId?: string; customerNotes: { at: string; by: string; text: string; internalOnly: boolean }[]; reservations: { id: string; quantity: string; expiresAt: string; consumedAt?: string; releasedAt?: string; releasedReason?: string; variantId: string }[]; suggestions: { id: string; name: string; priceLabel: string; availableToSell: string }[]; refunds: (Refund & { amountLabel: string })[] } }>("admin.order", { query: { orderId } }),
  orderAction: (body: Record<string, unknown>) => api<PublicOrder>("admin.order.action", { body }),
  fulfilment: () => api<{
    confirm: { id: string; reference: string; customerName: string; paymentStatus: string; paymentMethod: string; fulfilment: string; totalLabel: string; createdAtLabel: string; lineCount: number }[];
    pick: { id: string; reference: string; customerName: string; channel: string; fulfilment: string; slotLabel?: string; totalLabel: string; paymentStatus: string; fulfilmentStatus: string; lines: { id: string; productName: string; variantName: string; unit: string; quantity: string; note?: string; allocations: { lotId: string; lotNumber: string; quantity: string; expiry?: string }[]; availableToSell: string }[] }[];
    pack: { id: string; reference: string; customerName: string; channel: string; fulfilment: string; slotLabel?: string; totalLabel: string; paymentStatus: string; fulfilmentStatus: string; lines: { id: string; productName: string; variantName: string; unit: string; quantity: string; note?: string; allocations: { lotId: string; lotNumber: string; quantity: string; expiry?: string }[]; availableToSell: string }[] }[];
    dispatch: { id: string; reference: string; zone?: string; totalLabel: string; paymentStatus: string; paymentMethod: string; lineCount: number }[];
    collection: { id: string; reference: string; customerName: string; fulfilmentStatus: string; paymentStatus: string; paymentMethod: string; totalLabel: string; lineCount: number }[];
  }>("admin.fulfilment"),

  /* POS */
  posSearch: (q: string) => api<{ variantId: string; productId: string; productName: string; variantName: string; unit: string; priceMinor: number; priceLabel: string; barcode?: string; image: string; availableToSell: string; isAvailable: boolean }[]>("admin.pos.search", { query: { q } }),
  posComplete: (body: Record<string, unknown>) => api<{ orderId: string; reference: string; receiptNo: string; totalMinor: number; totalLabel: string; changeMinor: number; changeLabel: string; lines: { productName: string; variantName: string; quantity: string; unitPriceMinor: number; lineTotalMinor: number }[]; businessName: string; at: string }>("admin.pos.complete", { body }),
  posHold: (body: Record<string, unknown>) => api<{ draftId: string; label: string; expiresAt: string }>("admin.pos.hold", { body }),
  posDrafts: (sessionId: string) => api<{ id: string; label: string; createdAtLabel: string; expiresAt: string; lineCount: number; totalMinor: number; lines: { variantId: string; quantity: string; unitPriceMinor: number }[] }[]>("admin.pos.drafts", { query: { sessionId } }),
  posResume: (draftId: string) => api<{ id: string; label: string; lines: { variantId: string; quantity: string; unitPriceMinor: number }[] }>("admin.pos.resume", { body: { draftId } }),
  posReleaseDraft: (draftId: string) => api<{ released: boolean }>("admin.pos.release-draft", { body: { draftId } }),
  posReceiptLookup: (receiptNo: string) => api<{
    receiptNo: string; atLabel: string; method: string; totalMinor: number; totalLabel: string; cashierName: string; orderId: string; orderReference: string;
    lines: { id: string; productName: string; variantName: string; quantity: string; unitPriceMinor: number; unitTotal: number }[];
    returnable: { lineId: string; productName: string; variantName: string; eligible: string; unitPriceMinor: number }[];
  }>("admin.pos.receipt-lookup", { query: { receiptNo } }),

  /* sessions */
  sessions: () => api<SessionRow[]>("admin.sessions"),
  sessionOpen: (cashierId: string, openingFloatMinor: number) => api<{ sessionId: string }>("admin.sessions.open", { body: { cashierId, openingFloatMinor } }),
  sessionMovement: (sessionId: string, kind: "cash_in" | "cash_out" | "drop", amountMinor: number, note: string, actor?: string) => api<{ movements: number }>("admin.sessions.movement", { body: { sessionId, kind, amountMinor, note, actor } }),
  sessionClose: (sessionId: string, countedCashMinor: number, note: string, actor?: string) => api<{ differenceMinor: number; differenceLabel?: string }>("admin.sessions.close", { body: { sessionId, countedCashMinor, note, actor } }),

  /* inventory */
  inventory: (f: { q?: string; filter?: string }) => api<{ rows: { variantId: string; productId: string; productName: string; variantName: string; unit: string; sellablePhysical: string; reserved: string; safetyStock: string; availableToSell: string; isAvailable: boolean; nextExpiry?: string; lotCount: number; lastMovement?: string; lastMovementAt?: string; image: string }[]; total: number }>("admin.inventory.overview", { query: f as Record<string, QueryValue> }),
  lots: (variantId?: string) => api<{ id: string; productName: string; variantName: string; lotNumber: string; quantity: string; kind: string; isQuarantined: boolean; expired: boolean; expiryDate?: string; location: string; supplierName?: string; notes?: string; variantId: string }[]>("admin.inventory.lots", { query: { variantId } }),
  lotQuarantine: (lotId: string, quarantine: boolean, note?: string, actor?: string) => api<{ done: boolean }>("admin.inventory.lot.quarantine", { body: { lotId, quarantine, note, actor } }),
  lotDispose: (lotId: string, reason: string, actor?: string) => api<{ done: boolean }>("admin.inventory.lot.dispose", { body: { lotId, reason, actor } }),
  receipts: () => api<{ id: string; supplierName?: string; poRef?: string; lines: { productName?: string; variantName?: string; lotNumber: string; quantity: string; expiryDate?: string }[]; receivedAtLabel: string; receivedBy?: string; note?: string }[]>("admin.inventory.receipts"),
  receive: (body: Record<string, unknown>) => api<{ receiptId: string }>("admin.inventory.receive", { body }),
  adjustments: () => api<{ id: string; productName: string; variantName: string; lotNumber?: string; delta: string; reason: string; note?: string; status: string; requestedBy?: string; approvedBy?: string; atLabel: string }[]>("admin.inventory.adjustments"),
  adjustmentCreate: (body: Record<string, unknown>) => api<{ adjustmentId: string; status: string }>("admin.inventory.adjustments.create", { body }),
  adjustmentDecide: (adjustmentId: string, decision: "approve" | "reject", actor?: string) => api<{ status: string }>("admin.inventory.adjustments.decide", { body: { adjustmentId, decision, actor } }),
  stocktakes: () => api<{ id: string; reference: string; status: string; openedAtLabel: string; closedAt?: string; openedBy?: string; lines: { variantId: string; productName: string; variantName: string; expectedQty: string; countedQty?: string; variance?: string; status: string }[] }[]>("admin.inventory.stocktakes"),
  stocktakeOpen: (variantIds: string[], actor?: string) => api<{ stocktakeId: string; reference: string }>("admin.inventory.stocktakes.open", { body: { variantIds, actor } }),
  stocktakeCount: (stocktakeId: string, counts: Record<string, string>) => api<{ status: string }>("admin.inventory.stocktakes.count", { body: { stocktakeId, counts } }),
  stocktakeClose: (stocktakeId: string, applyCorrections: boolean) => api<{ status: string }>("admin.inventory.stocktakes.close", { body: { stocktakeId, applyCorrections } }),
  expiry: () => api<{
    expired: ExpiryLotRow[];
    soon: (ExpiryLotRow & { daysLeft: number })[];
    quarantined: ExpiryLotRow[];
    damaged: ExpiryLotRow[];
  }>("admin.inventory.expiry"),

  /* catalogue admin */
  adminProducts: (q?: string) => api<{ id: string; name: string; slug: string; categoryName?: string; categoryId: string; isPublished: boolean; shortDescription: string; image: string; variants: { id: string; name: string; priceLabel: string; priceMinor: number; barcode?: string; unit: string; availableToSell: string; isAvailable: boolean; purchaseUnit?: { altUnit: string; factor: string }; safetyStock: string; isActive: boolean }[]; anyAvailable: boolean }[]>("admin.products", { query: { q } }),
  adminProduct: (productId: string) => api<{
    id: string; name: string; slug: string; description: string; shortDescription: string; tags: string[]; isPublished: boolean;
    categoryName?: string; image: string;
    variants: { id: string; name: string; unit: string; unitSize: string; priceMinor: number; priceLabel: string; compareAtPriceMinor?: number; barcode?: string; purchaseUnit?: { altUnit: string; factor: string; baseUnit: string }; safetyStock: string; isActive: boolean; availability: { sellablePhysical: string; reserved: string; availableToSell: string; isAvailable: boolean }; lots: { lotId: string; lotNumber: string; quantity: string; expiryDate?: string; quarantined: boolean; kind: string }[] }[];
    lots: { id: string; lotNumber: string; quantity: string; kind: string; expiryDate?: string; isQuarantined: boolean }[];
    movements: { id: string; delta: string; reason: string; atLabel: string; note?: string; resultingQty: string }[];
  }>("admin.product", { query: { productId } }),
  productUpdate: (body: Record<string, unknown>) => api<{ done: boolean }>("admin.product.update", { body }),
  variantUpdate: (body: Record<string, unknown>) => api<{ done: boolean }>("admin.variant.update", { body }),
  categories: () => api<{ id: string; slug: string; name: string; description: string; isActive: boolean; sortOrder: number; productCount: number; availableCount: number }[]>("admin.categories"),
  categoryUpdate: (body: Record<string, unknown>) => api<{ done: boolean }>("admin.categories.update", { body }),
  suppliers: () => api<{ id: string; name: string; phone: string; email?: string; notes: string; isActive: boolean; poCount: number; openPoCount: number }[]>("admin.suppliers"),
  purchases: () => api<{ id: string; reference: string; supplierName?: string; status: string; expectedLabel?: string; createdAtLabel: string; note?: string; lines: { productName: string; variantName: string; quantity: string; unitCostLabel: string }[] }[]>("admin.purchases"),
  purchaseCreate: (body: Record<string, unknown>) => api<{ poId: string; reference: string }>("admin.purchases.create", { body }),
  purchaseSend: (poId: string) => api<{ status: string }>("admin.purchases.send", { body: { poId } }),

  /* dispatch */
  dispatchQueue: () => api<{
    ready: { id: string; reference: string; customerName: string; customerPhone: string; zone?: string; zoneId?: string; slotLabel?: string; totalLabel: string; paymentMethod: string; paymentStatus: string; codAmountMinor: number; lineCount: number }[];
    jobs: { id: string; orderId: string; orderReference?: string; customerName?: string; status: string; riderName?: string; providerName?: string; zone?: string; failureReason?: string; rescheduledFor?: string; cashToCollectLabel?: string; cashCollectedAt?: string; remittedAt?: string; proof?: { method: string; detail: string; at: string }; instructions?: string; events: { atLabel: string; actor: string; action: string; note?: string }[] }[];
    riders: { id: string; name: string; phone: string; kind: string; vehicle: string; isAvailable: boolean; activeJobId?: string; zones: string[]; pendingRemittanceMinor: number; pendingRemittanceLabel: string }[];
    providers: { id: string; name: string; capabilities: string[]; status: string; notes: string }[];
  }>("admin.dispatch.queue"),
  dispatchAssign: (orderId: string, target: { riderId?: string; providerId?: string; manual?: boolean }, actor?: string) => api<{ jobId: string; status: string }>("admin.dispatch.assign", { body: { orderId, ...target, actor } }),
  dispatchJobAction: (body: Record<string, unknown>) => api<{ done: boolean }>("admin.dispatch.job.action", { body }),
  riders: () => api<{ id: string; name: string; phone: string; kind: string; vehicle: string; zoneNames: string; isAvailable: boolean; activeJobId?: string; lastLocationAt?: string; lastLocationLabel?: string; isDemo: boolean; pendingRemittanceLabel: string; completedJobs: number }[]>("admin.riders"),
  riderToggle: (riderId: string, available: boolean, actor?: string) => api<{ isAvailable: boolean }>("admin.riders.toggle", { body: { riderId, available, actor } }),
  providers: () => api<{ id: string; name: string; capabilities: string[]; status: string; notes: string; capabilitiesNote: string; isConfigured: boolean }[]>("admin.providers"),

  /* returns & refunds & payments & customers */
  adminReturns: () => api<{ id: string; reference: string; orderId: string; orderReference?: string; channel: string; customerName?: string; requestedBy: string; status: string; createdAtLabel: string; lines: { productName: string; variantName: string; quantity: string; reason: string; refundLabel: string }[]; disposition?: { kind: string; note: string }; evidenceNote?: string; refundStatus?: string; refundableMinor: number }[]>("admin.returns"),
  returnAction: (body: Record<string, unknown>) => api<{ done: boolean }>("admin.return.action", { body }),
  refunds: () => api<{ id: string; returnReference?: string; orderReference?: string; amountLabel: string; status: string; method: string; reason: string; requestedBy: string; approvedBy?: string; providerRef?: string; providerTransferState: string; retryCount: number; createdAtLabel: string }[]>("admin.refunds"),
  refundAction: (refundId: string, action: "approve" | "execute" | "retry", actor?: string) => api<{ done: boolean }>("admin.refund.action", { body: { refundId, action, actor } }),
  payments: () => api<{ id: string; orderReference?: string; channel?: string; method: string; amountLabel: string; status: string; providerRef?: string; settlementState: string; callbackCount: number; failureReason?: string; note?: string; createdAtLabel: string; orderId: string }[]>("admin.payments"),
  customers: () => api<{ id: string; name: string; phone: string; email?: string; isDemo: boolean; supportNotes: string[]; createdAt: string; orderCount: number; spendLabel: string; returnCount: number; addressCount: number }[]>("admin.customers"),
  customer: (customerId: string) => api<{ customer: Customer; addresses: unknown[]; orders: { id: string; reference: string; totalLabel: string; channel: string; fulfilmentStatus: string; paymentStatus: string; createdAtLabel: string }[]; returns: { id: string; reference: string; status: string }[] }>("admin.customer", { query: { customerId } }),

  /* reports, ai, team, audit, settings */
  reports: () => api<ReportBundleView>("admin.reports"),
  aiSuggestions: () => api<(AISuggestion & { createdAtLabel: string })[]>("admin.ai.suggestions"),
  aiGenerate: () => api<{ generated: number }>("admin.ai.generate", { body: {} }),
  aiReview: (suggestionId: string, decision: "reviewed" | "dismissed") => api<{ status: string }>("admin.ai.review", { body: { suggestionId, decision } }),
  aiBusinessQuestion: (question: string) => api<{ answer: string; evidence: string[] }>("admin.ai.business-question", { body: { question } }),
  team: () => api<{ id: string; name: string; role: StaffRole; phone: string; isDemo: boolean; openSessions: number }[]>("admin.team"),
  auditEvents: (q?: string) => api<{ id: string; atLabel: string; actorName: string; action: string; entity: string; entityId: string; reason?: string; before?: string; after?: string }[]>("admin.audit", { query: { q } }),
  settings: () => api<SettingsView>("admin.settings"),
  settingsUpdate: (body: Record<string, unknown>) => api<SettingsView>("admin.settings.update", { body }),

  /* rider */
  riderLogin: () => api<{ id: string; name: string; kind: string; vehicle: string; isDemo: boolean }[]>("rider.login"),
  riderJobs: (riderId: string) => api<{
    jobs: RiderJobView[]; rider: { id: string; name: string; phone: string; isAvailable: boolean; lastLocationAt?: string; lastLocationLabel?: string } | null;
    remittance: { jobs: DeliveryJob[]; totalMinor: number; totalLabel: string };
  }>("rider.jobs", { query: { riderId } }),
  riderJob: (jobId: string) => api<RiderJobView>("rider.job", { query: { jobId } }),
  riderAction: (body: Record<string, unknown>) => api<RiderJobView>("rider.action", { body }),
  riderHistory: (riderId: string) => api<{ jobId: string; orderReference?: string; status: string; deliveredAtLabel: string; cashToCollectMinor?: number; cashCollected: boolean; remitted: boolean; proof?: { method: string; detail: string } }[]>("rider.history", { query: { riderId } }),

  /* demo */
  demoReset: () => api<{ reset: boolean; seededAt: string }>("demo.reset", { body: {} }),
  demoFlags: (body: Record<string, unknown>) => api<{ latencyMs: number; forcePaymentFailure: boolean; offlineMode: boolean }>("demo.flags", { body }),
  demoScenario: (scenario: string) => api<Record<string, unknown>>("demo.scenario", { body: { scenario } }),
};

export interface RiderJobView {
  id: string; orderId: string; orderReference?: string; status: string; zone?: string;
  riderId?: string; instructions?: string; customerName?: string; customerPhone?: string;
  address?: { recipientName: string; phone: string; line1: string; landmark?: string; ghanaPostGps?: string };
  items: string[]; cashToCollectLabel?: string; cashToCollectMinor?: number;
  cashCollectedAt?: string; remittedAt?: string;
  proof?: { method: string; detail: string; at: string };
  failureReason?: string; rescheduledFor?: string;
  events: { atLabel: string; actor: string; action: string; note?: string }[];
}

export type { PaymentAttempt, ReturnRequest, Refund };
