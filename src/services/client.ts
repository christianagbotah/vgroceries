/**
 * Typed client adapter — the browser-side half of the service boundary.
 *
 * Client components call `apiOps` / `api` only. Internals route through the
 * resolved browser adapter (src/services/adapters/browser.ts):
 *
 *   NEXT_PUBLIC_API_BASE_URL set  → production HTTP adapter (REST API)
 *   unset (development)           → this app's /api/mock/v1 mock route
 *
 * The operation surface (names, request bodies, response types) is the
 * CONTRACT shared with the future NestJS backend and native apps —
 * see src/services/contracts/ and docs/API_CONTRACTS.md. Pages never import
 * the mock store.
 */

import { clearBrowserCsrfToken, resolveClientAdapter, setBrowserCsrfToken } from "./adapters/browser";
import { normalizePaymentLedgerResponse } from "./payment-ledger";
import type { QueryValue, ServiceRequest } from "./adapters/types";
import type {
  AccountCancelResponse,
  AccountOrderRow,
  AccountProfileResponse,
  AccountProfileUpdateRequest,
  AccountReturnRow,
  AccountSummaryResponse,
  AdminCategoryRow,
  AdminOrderDetail,
  AdminOrderRow,
  AdminProductDetail,
  AdminProductRow,
  AdminProductMediaView,
  CreateGenerationRequest,
  CreateProductDraftRequest,
  ImageGenerationJobView,
  ProductMediaView,
  ProductBrandMode,
  AdminReturnRow,
  AdminRiderRow,
  AssistantResponse,
  BudgetBasketResponse,
  BusinessQuestionResponse,
  ByVariantsResponse,
  CompleteOrderRequest,
  CompleteOrderResponse,
  DashboardView,
  DoneResponse,
  DispatchQueueResponse,
  DispatchJobActionResponse,
  DispatchAssignResponse,
  ExpiryResponse,
  FulfilmentQueues,
  FulfilmentOrderCard,
  AiGenerateResponse,
  AiReviewResponse,
  PaymentInitiationResult,
  PaymentOutcomeResponse,
  PosCompleteRequest,
  PosCompleteResponse,
  PosDraftRow,
  PosHoldRequest,
  PosHoldResponse,
  PosReleaseDraftResponse,
  PosResumeResponse,
  PosSearchRow,
  ProductPageData,
  ProviderRow,
  PurchaseCreateResponse,
  PurchaseRow,
  PurchaseSendResponse,
  QuoteResponse,
  ReceiptLookupResponse,
  LegacyRefundActionResponse,
  RefundRow,
  ReturnActionResponse,
  ReturnDetailView,
  ReturnLineRow,
  RiderHistoryRow,
  RiderJobView,
  RiderJobsResponse,
  RiderLoginRow,
  RiderToggleResponse,
  SessionCloseResponse,
  SessionMovementResponse,
  SessionOpenResponse,
  CmsContentPageAdminView,
  CmsContentPageSlug,
  CmsHomepageAdminView,
  CmsOverviewView,
  SettingsView,
  ShopPageData,
  SlotView,
  StocktakeOpenResponse,
  SuggestionRow,
  SupplierRow,
  TeamRow,
  ZoneView,
  LogisticsNodeView,
  LogisticsLaneView,
  DeliveryWorkflowView,
  DeliveryWorkflowVersionView,
  DeliveryRouteRuleView,
  RouteSimulationRequest,
  RouteSimulationResponse,
  CreateLogisticsNodeRequest,
  UpdateLogisticsNodeRequest,
  CreateLogisticsLaneRequest,
  UpdateLogisticsLaneRequest,
  CreateDeliveryWorkflowRequest,
  SaveDeliveryWorkflowDraftRequest,
  PublishDeliveryWorkflowRequest,
  CreateDeliveryRouteRuleRequest,
  UpdateDeliveryRouteRuleRequest,
  ActivateDeliveryRouteRuleRequest,
  SessionLookupResponse,
  WebSessionResponse,
  UatDemoAccountView,
} from "./contracts";

export { ApiError } from "./adapters/types";
export type { QueryValue };

/* ------------------------------------------------------------------ */
/* Core transport helper                                               */
/* ------------------------------------------------------------------ */

export interface ApiCallOptions {
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  formData?: FormData;
  /** Retry-safety: forwarded as the Idempotency-Key header. */
  idempotencyKey?: string;
  /** Skip zod request validation (contract tests only). */
  skipValidation?: boolean;
}

/** Execute one operation through the resolved browser adapter. */
export async function api<T = unknown>(op: string, options?: ApiCallOptions): Promise<T> {
  const req: ServiceRequest = {
    op,
    query: options?.query,
    body: options?.body,
    formData: options?.formData,
    idempotencyKey: options?.idempotencyKey,
    skipValidation: options?.skipValidation,
  };
  return resolveClientAdapter().request<T>(req);
}

/* ------------------------------------------------------------------ */
/* Shared view re-exports (contract types)                             */
/* ------------------------------------------------------------------ */

export type {
  CatalogProduct,
  CatalogVariant,
  CategoryRow,
  CategoryView,
  ReportBundleView,
  ZoneView,
  SlotView,
  PublicOrder,
  SessionRow,
  ExpiryLotRow,
  SettingsView,
  RiderJobView,
} from "./contracts";
import type { CategoryRow, PublicOrder, SessionRow } from "./contracts";

/* ------------------------------------------------------------------ */
/* Typed operation surface — THE contract used by every client screen  */
/* ------------------------------------------------------------------ */

export const apiOps = {
  /* catalogue */
  catalogCategories: () => api<CategoryRow[]>("catalog.categories"),
  products: (p: { query?: string; category?: string; sort?: string; page?: number; perPage?: number }) =>
    api<ShopPageData>("catalog.list", { query: p as Record<string, QueryValue> }),
  product: (slug: string) => api<ProductPageData>("catalog.product", { query: { slug } }),
  byVariants: (variantIds: string[]) => api<ByVariantsResponse>("catalog.by-variants", { body: { variantIds } }),

  /* checkout */
  quote: (lines: { variantId: string; quantity: string }[], zoneId?: string) =>
    api<QuoteResponse>("checkout.quote", { body: { lines, zoneId } }),
  complete: (body: CompleteOrderRequest) =>
    api<CompleteOrderResponse>("checkout.complete", { body: body as unknown as Record<string, unknown> }),
  paymentInitiate: (orderId: string, payerPhone: string | undefined, idempotencyKey: string) =>
    api<PaymentInitiationResult>("payments.initiate", {
      query: { orderId },
      body: payerPhone ? { payerPhone } : {},
      idempotencyKey,
    }),
  paymentOutcome: (orderId: string, outcome: "succeeded" | "failed" | "pending") =>
    api<PaymentOutcomeResponse>("checkout.payment-outcome", { body: { orderId, outcome } }),
  orderStatus: (orderId: string) => api<PublicOrder>("checkout.status", { query: { orderId } }),
  track: (reference: string, code: string) => api<PublicOrder>("orders.track", { body: { reference, code } }),
  zones: () => api<ZoneView[]>("checkout.zones"),
  slots: (zoneId: string) => api<SlotView[]>("checkout.slots", { query: { zoneId } }),

  /* account */
  accountLogin: async (identifier: string, password: string) => {
    const identity = identifier.includes("@")
      ? { email: identifier.trim().toLowerCase() }
      : { phone: identifier.trim() };
    const session = await api<WebSessionResponse>("auth.login", { body: { ...identity, password, client: "web" } });
    setBrowserCsrfToken(session.csrfToken);
    return session;
  },
  accountSignup: async (name: string, phone: string, password: string, email?: string) => {
    const optionalEmail = email?.trim();
    const session = await api<WebSessionResponse>("auth.signup", {
      body: { name, phone, password, ...(optionalEmail ? { email: optionalEmail } : {}), client: "web" },
    });
    setBrowserCsrfToken(session.csrfToken);
    return session;
  },
  accountSession: async () => {
    const session = await api<SessionLookupResponse>("auth.me");
    if (session.csrfToken) setBrowserCsrfToken(session.csrfToken);
    return session;
  },
  accountSummary: (customerId?: string) => api<AccountSummaryResponse>("account.summary", { query: { customerId } }),
  accountProfile: () => api<AccountProfileResponse>("account.profile"),
  accountProfileUpdate: (body: AccountProfileUpdateRequest) =>
    api<AccountProfileResponse>("account.profile.update", { body: body as unknown as Record<string, unknown> }),
  accountLogout: async () => {
    try { return await api<DoneResponse>("account.logout", { body: {} }); }
    finally { clearBrowserCsrfToken(); }
  },
  accountOrders: (customerId?: string) => api<AccountOrderRow[]>("account.orders", { query: { customerId } }),
  accountCancel: (orderId: string, reason: string) =>
    api<AccountCancelResponse>("account.cancel", { body: { orderId, reason } }),
  returnLines: (orderId: string) => api<ReturnLineRow[]>("account.return-lines", { body: { orderId } }),
  createReturn: (body: { orderId: string; lines: { orderLineId: string; quantity: string; reason: string }[]; evidenceNote?: string; customerId?: string }) =>
    api<{ returnId: string; reference: string; status: string }>("account.create-return", { body: body as unknown as Record<string, unknown> }),
  accountReturns: (customerId?: string) => api<AccountReturnRow[]>("account.returns", { query: { customerId } }),
  returnDetail: (returnId: string) => api<ReturnDetailView>("returns.detail", { query: { returnId } }),

  /* AI (customer) */
  assistant: (question: string) => api<AssistantResponse>("ai.assistant", { body: { question } }),
  budgetBasket: (budgetMinor: number) => api<BudgetBasketResponse>("ai.budget-basket", { body: { budgetMinor } }),

  /* staff */
  staffDemoAccounts: () => api<UatDemoAccountView[]>("auth.demo-accounts"),
  staffDemoLogin: async (accountId: UatDemoAccountView["id"]) => {
    const session = await api<WebSessionResponse>("auth.demo-login", { body: { accountId } });
    setBrowserCsrfToken(session.csrfToken);
    return session;
  },
  staffLogin: async (email: string, password: string) => {
    const session = await api<WebSessionResponse>("auth.login", { body: { email, password, client: "web" } });
    setBrowserCsrfToken(session.csrfToken);
    return session;
  },
  staffSession: async () => {
    const session = await api<SessionLookupResponse>("auth.me");
    if (session.csrfToken) setBrowserCsrfToken(session.csrfToken);
    return session;
  },
  staffLogout: async () => {
    try { return await api<DoneResponse>("account.logout", { body: {} }); }
    finally { clearBrowserCsrfToken(); }
  },
  dashboard: () => api<DashboardView>("admin.dashboard"),
  orders: (f: { channel?: string; status?: string; payment?: string; q?: string }) =>
    api<AdminOrderRow[]>("admin.orders", { query: f as Record<string, QueryValue> }),
  order: (orderId: string) => api<AdminOrderDetail>("admin.order", { query: { orderId } }),
  orderAction: (body: Record<string, unknown>) => api<PublicOrder>("admin.order.action", { body }),
  fulfilment: () => api<FulfilmentQueues>("admin.fulfilment"),

  /* POS */
  posSearch: (q: string) => api<PosSearchRow[]>("admin.pos.search", { query: { q } }),
  posComplete: (body: PosCompleteRequest) =>
    api<PosCompleteResponse>("admin.pos.complete", { body: body as unknown as Record<string, unknown> }),
  posHold: (body: PosHoldRequest) =>
    api<PosHoldResponse>("admin.pos.hold", { body: body as unknown as Record<string, unknown> }),
  posDrafts: (sessionId: string) => api<PosDraftRow[]>("admin.pos.drafts", { query: { sessionId } }),
  posResume: (draftId: string) => api<PosResumeResponse>("admin.pos.resume", { body: { draftId } }),
  posReleaseDraft: (draftId: string) => api<PosReleaseDraftResponse>("admin.pos.release-draft", { body: { draftId } }),
  posReceiptLookup: (receiptNo: string) => api<ReceiptLookupResponse>("admin.pos.receipt-lookup", { query: { receiptNo } }),

  /* sessions */
  sessions: () => api<SessionRow[]>("admin.sessions"),
  sessionOpen: (cashierId: string, openingFloatMinor: number) =>
    api<SessionOpenResponse>("admin.sessions.open", { body: { cashierId, openingFloatMinor } }),
  sessionMovement: (sessionId: string, kind: "cash_in" | "cash_out" | "drop", amountMinor: number, note: string, actor?: string) =>
    api<SessionMovementResponse>("admin.sessions.movement", { body: { sessionId, kind, amountMinor, note, actor } }),
  sessionClose: (sessionId: string, countedCashMinor: number, note: string, actor?: string) =>
    api<SessionCloseResponse>("admin.sessions.close", { body: { sessionId, countedCashMinor, note, actor } }),

  /* inventory */
  inventory: (f: { q?: string; filter?: string }) =>
    api<import("./contracts").InventoryOverviewResponse>("admin.inventory.overview", {
      query: f as Record<string, QueryValue>,
    }),
  lots: (variantId?: string) => api<import("./contracts").LotRow[]>("admin.inventory.lots", { query: { variantId } }),
  lotQuarantine: (lotId: string, quarantine: boolean, note?: string, actor?: string) =>
    api<DoneResponse>("admin.inventory.lot.quarantine", { body: { lotId, quarantine, note, actor } }),
  lotDispose: (lotId: string, reason: string, actor?: string) =>
    api<DoneResponse>("admin.inventory.lot.dispose", { body: { lotId, reason, actor } }),
  receipts: () => api<import("./contracts").ReceiptRow[]>("admin.inventory.receipts"),
  receive: (body: Record<string, unknown>) => api<{ receiptId: string }>("admin.inventory.receive", { body }),
  adjustments: () => api<import("./contracts").AdjustmentRow[]>("admin.inventory.adjustments"),
  adjustmentCreate: (body: Record<string, unknown>) => api<{ adjustmentId: string; status: string }>("admin.inventory.adjustments.create", { body }),
  adjustmentDecide: (adjustmentId: string, decision: "approve" | "reject", actor?: string) =>
    api<{ status: string }>("admin.inventory.adjustments.decide", { body: { adjustmentId, decision, actor } }),
  stocktakes: () => api<import("./contracts").StocktakeRow[]>("admin.inventory.stocktakes"),
  stocktakeOpen: (variantIds: string[], actor?: string) =>
    api<StocktakeOpenResponse>("admin.inventory.stocktakes.open", { body: { variantIds, actor } }),
  stocktakeCount: (stocktakeId: string, counts: Record<string, string>) =>
    api<{ status: string }>("admin.inventory.stocktakes.count", { body: { stocktakeId, counts } }),
  stocktakeClose: (stocktakeId: string, applyCorrections: boolean) =>
    api<{ status: string }>("admin.inventory.stocktakes.close", { body: { stocktakeId, applyCorrections } }),
  expiry: () => api<ExpiryResponse>("admin.inventory.expiry"),

  /* catalogue admin */
  adminProducts: (q?: string) => api<AdminProductRow[]>("admin.products", { query: { q } }),
  adminProduct: (productId: string) => api<AdminProductDetail>("admin.product", { query: { productId } }),
  productUpdate: (body: Record<string, unknown>) => api<DoneResponse>("admin.product.update", { body }),
  productDraftCreate: (body: CreateProductDraftRequest) =>
    api<{ productId: string; editorPath: string }>("admin.product.create", { body: body as unknown as Record<string, unknown> }),
  productMedia: (productId: string) =>
    api<AdminProductMediaView>("admin.product-media", { query: { productId } }),
  productMediaUpload: (productId: string, formData: FormData) =>
    api<ProductMediaView>("admin.product-media.upload", { query: { productId }, formData }),
  productMediaGenerate: (productId: string, body: CreateGenerationRequest, idempotencyKey: string) =>
    api<ImageGenerationJobView>("admin.product-media.generate", { query: { productId }, body: body as unknown as Record<string, unknown>, idempotencyKey }),
  productMediaGeneration: (jobId: string) =>
    api<ImageGenerationJobView>("admin.product-media.generation", { query: { jobId } }),
  productMediaApprove: (mediaId: string) =>
    api<ProductMediaView>("admin.product-media.approve", { query: { mediaId }, body: {} }),
  productMediaReject: (mediaId: string) =>
    api<ProductMediaView>("admin.product-media.reject", { query: { mediaId }, body: {} }),
  productMediaArchive: (mediaId: string, replacementFeaturedMediaId?: string | null) =>
    api<ProductMediaView>("admin.product-media.archive", { query: { mediaId }, body: replacementFeaturedMediaId === undefined ? {} : { replacementFeaturedMediaId } }),
  productMediaSetFeatured: (productId: string, mediaId: string | null) =>
    api<AdminProductMediaView>("admin.product-media.featured", { query: { productId }, body: { mediaId } }),
  productMediaReorder: (productId: string, orderedMediaIds: string[]) =>
    api<AdminProductMediaView>("admin.product-media.reorder", { query: { productId }, body: { orderedMediaIds } }),
  productMediaBrandMode: (productId: string, brandMode: ProductBrandMode) =>
    api<AdminProductMediaView>("admin.product-media.brand-mode", { query: { productId }, body: { brandMode } }),
  variantUpdate: (body: Record<string, unknown>) => api<DoneResponse>("admin.variant.update", { body }),
  categories: () => api<AdminCategoryRow[]>("admin.categories"),
  categoryUpdate: (body: Record<string, unknown>) => api<DoneResponse>("admin.categories.update", { body }),
  suppliers: () => api<SupplierRow[]>("admin.suppliers"),
  purchases: () => api<PurchaseRow[]>("admin.purchases"),
  purchaseCreate: (body: Record<string, unknown>) => api<PurchaseCreateResponse>("admin.purchases.create", { body }),
  purchaseSend: (poId: string) => api<PurchaseSendResponse>("admin.purchases.send", { body: { poId } }),


  /* logistics configuration — L1 plans/config only, not shipment execution */
  logisticsNodes: (query: { q?: string; kind?: string; active?: boolean } = {}) =>
    api<LogisticsNodeView[]>("admin.logistics.nodes", { query }),
  logisticsNode: (nodeId: string) =>
    api<LogisticsNodeView>("admin.logistics.node", { query: { nodeId } }),
  logisticsNodeCreate: (body: CreateLogisticsNodeRequest, idempotencyKey: string) =>
    api<LogisticsNodeView>("admin.logistics.node.create", { body: body as unknown as Record<string, unknown>, idempotencyKey }),
  logisticsNodeUpdate: (nodeId: string, body: UpdateLogisticsNodeRequest, idempotencyKey: string) =>
    api<LogisticsNodeView>("admin.logistics.node.update", { query: { nodeId }, body: body as unknown as Record<string, unknown>, idempotencyKey }),

  logisticsLanes: (query: { q?: string; mode?: string; originNodeId?: string; destinationNodeId?: string; active?: boolean } = {}) =>
    api<LogisticsLaneView[]>("admin.logistics.lanes", { query }),
  logisticsLane: (laneId: string) =>
    api<LogisticsLaneView>("admin.logistics.lane", { query: { laneId } }),
  logisticsLaneCreate: (body: CreateLogisticsLaneRequest, idempotencyKey: string) =>
    api<LogisticsLaneView>("admin.logistics.lane.create", { body: body as unknown as Record<string, unknown>, idempotencyKey }),
  logisticsLaneUpdate: (laneId: string, body: UpdateLogisticsLaneRequest, idempotencyKey: string) =>
    api<LogisticsLaneView>("admin.logistics.lane.update", { query: { laneId }, body: body as unknown as Record<string, unknown>, idempotencyKey }),

  logisticsWorkflows: () => api<DeliveryWorkflowView[]>("admin.logistics.workflows"),
  logisticsWorkflow: (templateId: string) =>
    api<DeliveryWorkflowView>("admin.logistics.workflow", { query: { templateId } }),
  logisticsWorkflowCreate: (body: CreateDeliveryWorkflowRequest, idempotencyKey: string) =>
    api<DeliveryWorkflowView>("admin.logistics.workflow.create", { body: body as unknown as Record<string, unknown>, idempotencyKey }),
  logisticsWorkflowDraft: (templateId: string, idempotencyKey: string) =>
    api<DeliveryWorkflowVersionView>("admin.logistics.workflow.draft", { query: { templateId }, body: {}, idempotencyKey }),
  logisticsWorkflowSave: (templateId: string, versionId: string, body: SaveDeliveryWorkflowDraftRequest, idempotencyKey: string) =>
    api<DeliveryWorkflowVersionView>("admin.logistics.workflow.save", { query: { templateId, versionId }, body: body as unknown as Record<string, unknown>, idempotencyKey }),
  logisticsWorkflowPublish: (templateId: string, body: PublishDeliveryWorkflowRequest, idempotencyKey: string) =>
    api<DeliveryWorkflowView>("admin.logistics.workflow.publish", { query: { templateId }, body: body as unknown as Record<string, unknown>, idempotencyKey }),

  logisticsRouteRules: (query: { active?: boolean; originNodeId?: string; fulfilment?: "delivery" | "collection"; destinationKind?: "doorstep" | "pickup_point" } = {}) =>
    api<DeliveryRouteRuleView[]>("admin.logistics.route-rules", { query }),
  logisticsRouteRule: (ruleId: string) =>
    api<DeliveryRouteRuleView>("admin.logistics.route-rule", { query: { ruleId } }),
  logisticsRouteRuleCreate: (body: CreateDeliveryRouteRuleRequest, idempotencyKey: string) =>
    api<DeliveryRouteRuleView>("admin.logistics.route-rule.create", { body: body as unknown as Record<string, unknown>, idempotencyKey }),
  logisticsRouteRuleUpdate: (ruleId: string, body: UpdateDeliveryRouteRuleRequest, idempotencyKey: string) =>
    api<DeliveryRouteRuleView>("admin.logistics.route-rule.update", { query: { ruleId }, body: body as unknown as Record<string, unknown>, idempotencyKey }),
  logisticsRouteRuleActivate: (ruleId: string, body: ActivateDeliveryRouteRuleRequest, idempotencyKey: string) =>
    api<DeliveryRouteRuleView>("admin.logistics.route-rule.activate", { query: { ruleId }, body: body as unknown as Record<string, unknown>, idempotencyKey }),
  logisticsRouteRuleSimulate: (body: RouteSimulationRequest) =>
    api<RouteSimulationResponse>("admin.logistics.route-rule.simulate", { body: body as unknown as Record<string, unknown> }),

  /* dispatch */
  dispatchQueue: () => api<DispatchQueueResponse>("admin.dispatch.queue"),
  dispatchAssign: (orderId: string, target: { riderId?: string; providerId?: string; manual?: boolean }, actor?: string) =>
    api<DispatchAssignResponse>("admin.dispatch.assign", { body: { orderId, ...target, actor } }),
  dispatchJobAction: (body: Record<string, unknown>) => api<DispatchJobActionResponse>("admin.dispatch.job.action", { body }),
  riders: () => api<AdminRiderRow[]>("admin.riders"),
  riderToggle: (riderId: string, available: boolean, actor?: string) =>
    api<RiderToggleResponse>("admin.riders.toggle", { body: { riderId, available, actor } }),
  providers: () => api<ProviderRow[]>("admin.providers"),

  /* returns & refunds & payments & customers */
  adminReturns: () => api<AdminReturnRow[]>("admin.returns"),
  returnAction: (body: Record<string, unknown>) => api<ReturnActionResponse>("admin.return.action", { body }),
  refunds: () => api<RefundRow[]>("admin.refunds"),
  refundAction: (refundId: string, action: "approve" | "execute" | "retry", actor?: string) =>
    api<LegacyRefundActionResponse>("admin.refund.action", { body: { refundId, action, actor } }),
  payments: async () => normalizePaymentLedgerResponse(await api<unknown>("admin.payments")),
  customers: () => api<import("./contracts").CustomerRow[]>("admin.customers"),
  customer: (customerId: string) => api<import("./contracts").CustomerDetailResponse>("admin.customer", { query: { customerId } }),

  /* reports, ai, team, audit, settings */
  reports: () => api<import("./contracts").ReportBundleView>("admin.reports"),
  aiSuggestions: () => api<SuggestionRow[]>("admin.ai.suggestions"),
  aiGenerate: () => api<AiGenerateResponse>("admin.ai.generate", { body: {} }),
  aiReview: (suggestionId: string, decision: "reviewed" | "dismissed") =>
    api<AiReviewResponse>("admin.ai.review", { body: { suggestionId, decision } }),
  aiBusinessQuestion: (question: string) => api<BusinessQuestionResponse>("admin.ai.business-question", { body: { question } }),
  team: () => api<TeamRow[]>("admin.team"),
  auditEvents: (q?: string) => api<import("./contracts").AuditRow[]>("admin.audit", { query: { q } }),
  cmsOverview: () => api<CmsOverviewView>("admin.content.overview"),
  cmsHomepage: () => api<CmsHomepageAdminView>("admin.content.homepage"),
  cmsHomepageUpdate: (body: Record<string, unknown>) => api<CmsHomepageAdminView>("admin.content.homepage.update", { body }),
  cmsHomepagePublish: () => api<CmsHomepageAdminView>("admin.content.homepage.publish", { body: {} }),
  cmsContentPage: (slug: CmsContentPageSlug) => api<CmsContentPageAdminView>("admin.content.page", { query: { slug } }),
  cmsContentPageUpdate: (slug: CmsContentPageSlug, body: Record<string, unknown>) => api<CmsContentPageAdminView>("admin.content.page.update", { query: { slug }, body }),
  cmsContentPagePublish: (slug: CmsContentPageSlug) => api<CmsContentPageAdminView>("admin.content.page.publish", { query: { slug }, body: {} }),
  settings: () => api<SettingsView>("admin.settings"),
  settingsUpdate: (body: Record<string, unknown>) => api<SettingsView>("admin.settings.update", { body }),

  /* rider */
  riderLogin: () => api<RiderLoginRow[]>("rider.login"),
  riderJobs: (riderId: string) => api<RiderJobsResponse>("rider.jobs", { query: { riderId } }),
  riderJob: (jobId: string) => api<RiderJobView>("rider.job", { query: { jobId } }),
  riderAction: (body: Record<string, unknown>) => api<RiderJobView>("rider.action", { body }),
  riderHistory: (riderId: string) => api<RiderHistoryRow[]>("rider.history", { query: { riderId } }),

  /* demo */
  demoReset: () => api<{ reset: boolean; seededAt: string }>("demo.reset", { body: {} }),
  demoFlags: (body: Record<string, unknown>) => api<{ latencyMs: number; forcePaymentFailure: boolean; offlineMode: boolean }>("demo.flags", { body }),
  demoScenario: (scenario: string) => api<Record<string, unknown>>("demo.scenario", { body: { scenario } }),
};

/* Contract request types re-exported for callers that build payloads
   programmatically (future React Native clients reuse these directly). */
export type {
  AiGenerateResponse,
  AiReviewResponse,
  AssistantResponse,
  BudgetBasketResponse,
  FulfilmentOrderCard,
  CompleteOrderRequest,
  PaymentOutcomeRequest,
  PosCompleteRequest,
  PosHoldRequest,
  StocktakeCountRequest,
  StocktakeOpenRequest,
  StocktakeCloseRequest,
  SessionOpenRequest,
  SessionMovementRequest,
  SessionCloseRequest,
  ReceiveRequest,
  AdjustmentCreateRequest,
  DispatchAssignRequest,
  DispatchJobActionRequest,
  ReturnActionRequest,
  RefundActionRequest,
  RiderActionRequest,
  PurchaseCreateRequest,
  RiderToggleRequest,
  AiReviewRequest,
  CreateReturnRequest,
  CartLineInput,
  QuoteResponse,
} from "./contracts";
