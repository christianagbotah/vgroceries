import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type {
  SchemaObject,
  ParameterObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import {
  catalogProductSchema,
  shopPageDataSchema,
  foundationCategorySchema,
  foundationHomeSchema,
  foundationProductDetailSchema,
  foundationInventoryRowSchema,
  foundationInventoryOverviewSchema,
  sessionActorSchema,
  webSessionResponseSchema,
  nativeSessionResponseSchema,
  sessionLookupResponseSchema,
  loginRequestSchema,
  registerRequestSchema,
  refreshRequestSchema,
  byVariantsRequestSchema,
  stockReceiveRequestSchema,
  zoneViewSchema,
  slotViewSchema,
  quoteResponseSchema,
  checkoutQuoteRequestSchema,
  checkoutCompleteRestRequestSchema,
  publicOrderSchema,
  trackRequestSchema,
  accountCancelPathRequestSchema,
  accountProfileUpdateRequestSchema,
  paymentInitiationRequestSchema,
  paymentInitiationResultSchema,
  paymentProviderEventResponseSchema,
  paymentListResponseSchema,
  paymentReconcileResponseSchema,
  refundActionRequestSchema,
  refundActionResponseSchema,
  refundListResponseSchema,
  adminOrderFinancialActionRequestSchema,
  adminOrderFinancialActionResponseSchema,
  ghanaMealPlanRequestSchema,
} from "@variety/contracts";
import { z } from "zod";

export function foundationOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Variety Groceries production API")
    .setVersion("0.1.0")
    .setDescription(
      "Implemented production subset: identity, catalogue, inventory receiving, delivery configuration, authoritative checkout/orders, provider-neutral Payments Authority and provider-neutral Refunds Authority. Stock handover, physical returns, fulfilment/dispatch, POS and public storefront cutover remain closed.",
    )
    .addCookieAuth("vg_session", { type: "apiKey", in: "cookie" }, "cookieAuth")
    .addCookieAuth("vg_guest", { type: "apiKey", in: "cookie" }, "guestAuth")
    .addBearerAuth({ type: "http", scheme: "bearer" }, "bearerAuth")
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  // Express needs an escaped literal colon; consumers use the unescaped URL.
  doc.paths = Object.fromEntries(
    Object.entries(doc.paths).map(([path, item]) => [
      path.replaceAll("\\:", ":"),
      item,
    ]),
  );
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const json = (schema: z.ZodType): SchemaObject =>
    z.toJSONSchema(schema, { target: "openapi-3.0" }) as SchemaObject;
  const schemas: Record<string, SchemaObject> = {
    LiveResponse: json(z.object({ status: z.literal("ok") })),
    ReadyResponse: json(
      z.object({ status: z.literal("ok"), database: z.literal("up") }),
    ),
    SessionActor: json(sessionActorSchema),
    WebSessionResponse: json(webSessionResponseSchema),
    NativeSessionResponse: json(nativeSessionResponseSchema),
    SessionResponse: {
      oneOf: [ref("WebSessionResponse"), ref("NativeSessionResponse")],
    },
    SessionLookupResponse: json(sessionLookupResponseSchema),
    LogoutResponse: json(z.object({ done: z.literal(true) })),
    CatalogProduct: json(catalogProductSchema),
    CatalogProductsResponse: json(shopPageDataSchema),
    Category: json(foundationCategorySchema),
    CategoriesResponse: { type: "array", items: ref("Category") },
    HomeResponse: json(foundationHomeSchema),
    ProductDetailResponse: json(foundationProductDetailSchema),
    ByVariantsResponse: { type: "array", items: ref("CatalogProduct") },
    InventoryRow: json(foundationInventoryRowSchema),
    InventoryOverviewResponse: json(foundationInventoryOverviewSchema),
    ReceiveResponse: json(z.object({ receiptId: z.string() })),
    ZoneView: json(zoneViewSchema),
    ZoneListResponse: { type: "array", items: ref("ZoneView") },
    SlotView: json(slotViewSchema),
    SlotListResponse: { type: "array", items: ref("SlotView") },
    CheckoutCapabilitiesResponse: json(z.object({ electronicPaymentAvailable: z.boolean() })),
    QuoteResponse: json(quoteResponseSchema),
    CheckoutQuoteRequest: json(checkoutQuoteRequestSchema),
    CheckoutCompleteRequest: json(checkoutCompleteRestRequestSchema),
    CompleteOrderResponse: json(z.object({ orderId:z.string(), reference:z.string(), verificationCode:z.string(), paymentRequired:z.boolean() })),
    PublicOrder: json(publicOrderSchema),
    AccountCustomer: json(z.object({ id:z.string(), name:z.string(), phone:z.string(), email:z.string().email().optional(), addressIds:z.array(z.string()), isDemo:z.boolean(), supportNotes:z.array(z.string()), createdAt:z.iso.datetime() })),
    AccountAddress: json(z.object({ id:z.string(), label:z.string(), recipientName:z.string(), phone:z.string(), locality:z.string(), street:z.string(), landmark:z.string().optional(), ghanaPostGps:z.string().optional(), latitude:z.number().min(-90).max(90).optional(), longitude:z.number().min(-180).max(180).optional(), locationSource:z.enum(["device_gps","map_pin"]).optional(), isDefault:z.boolean().optional() })),
    AccountRecentOrder: json(z.object({ id:z.string(), reference:z.string(), totalLabel:z.string(), fulfilmentStatus:z.string(), paymentStatus:z.string(), createdAtLabel:z.string() })),
    AccountSummaryResponse: { type:"object", required:["customer","addresses","ordersCount","openOrders","returnsCount","recentOrders"], additionalProperties:false, properties:{ customer:ref("AccountCustomer"), addresses:{type:"array",items:ref("AccountAddress")}, ordersCount:{type:"integer",minimum:0}, openOrders:{type:"integer",minimum:0}, returnsCount:{type:"integer",minimum:0}, recentOrders:{type:"array",items:ref("AccountRecentOrder")} } },
    AccountProfileResponse: { type:"object", required:["customer"], additionalProperties:false, properties:{ customer:ref("AccountCustomer") } },
    AccountProfileUpdateRequest: json(accountProfileUpdateRequestSchema),
    AccountOrderRow: json(z.object({ id:z.string(), reference:z.string(), totalLabel:z.string(), fulfilmentStatus:z.string(), paymentStatus:z.string(), fulfilment:z.string(), createdAtLabel:z.string(), lineCount:z.number().int().nonnegative() })),
    AccountOrderListResponse: { type:"array", items:ref("AccountOrderRow") },
    TrackRequest: json(trackRequestSchema),
    AccountCancelRequest: json(accountCancelPathRequestSchema),
    AccountCancelResponse: json(z.object({ fulfilmentStatus:z.string() })),
    PaymentInitiationRequest: json(paymentInitiationRequestSchema),
    PaymentInitiationResponse: json(paymentInitiationResultSchema),
    PaymentProviderEventResponse: json(paymentProviderEventResponseSchema),
    PaymentListResponse: json(paymentListResponseSchema),
    PaymentReconcileResponse: json(paymentReconcileResponseSchema),
    RefundListResponse: json(refundListResponseSchema),
    RefundActionRequest: json(refundActionRequestSchema),
    RefundActionResponse: json(refundActionResponseSchema),
    HubtelRefundCallbackRequest: { type: "object", additionalProperties: true },
    HubtelRefundCallbackResponse: json(z.object({
      processingResult: z.enum(["applied", "pending", "failed", "exception", "duplicate"]),
      refundStatus: z.string(),
      executionStatus: z.string(),
      orderPaymentStatus: z.string(),
    })),
    AdminOrderFinancialActionRequest: json(adminOrderFinancialActionRequestSchema),
    AdminOrderFinancialActionResponse: json(adminOrderFinancialActionResponseSchema),
    GhanaMealPlanRequest: json(ghanaMealPlanRequestSchema),
    GhanaMealPlanResponse: json(z.object({
      requestText: z.string(),
      detectedLanguage: z.enum(["english", "twi", "ga", "ewe", "mixed", "unknown"]),
      servings: z.number().int().min(1).max(20),
      dishId: z.string().optional(),
      dishLabel: z.string().optional(),
      interpretation: z.enum(["template", "lexicon", "model"]),
      summary: z.string(),
      lines: z.array(z.object({
        conceptId: z.string(), conceptLabel: z.string(), matchedAlias: z.string().optional(),
        productId: z.string(), productName: z.string(), variantId: z.string(), variantName: z.string(), image: z.string(),
        unit: z.string(), unitSize: z.string(), quantity: z.string(), unitPriceMinor: z.number().int(), lineTotalMinor: z.number().int(),
        availableToSell: z.string(), availableNow: z.boolean(), note: z.string().optional(),
      })),
      unresolved: z.array(z.object({
        conceptId: z.string().optional(), term: z.string(), reason: z.enum(["not_in_catalogue", "out_of_stock", "not_understood"]), alternatives: z.array(z.string()).optional(),
      })),
      subtotalMinor: z.number().int().nonnegative(),
      confidence: z.number().min(0).max(1),
      warnings: z.array(z.string()),
      lexiconVersion: z.string(),
    })),
    AdminDashboardResponse: json(z.object({
      today: z.object({ date: z.string(), onlineMinor: z.number().int(), posMinor: z.number().int(), orders: z.number().int().nonnegative() }),
      actionable: z.object({
        awaitingConfirmation: z.number().int().nonnegative(), readyToPick: z.number().int().nonnegative(), picking: z.number().int().nonnegative(),
        readyToDispatch: z.number().int().nonnegative(), pendingPayments: z.number().int().nonnegative(), returnsPending: z.number().int().nonnegative(),
        refundsAttention: z.number().int().nonnegative(), lowStock: z.number().int().nonnegative(), expiringSoon: z.number().int().nonnegative(),
        unassignedJobs: z.number().int().nonnegative(), openSessions: z.number().int().nonnegative(),
      }),
      recentOrders: z.array(z.object({
        id: z.string(), reference: z.string(), customer: z.string(), channel: z.string(), total: z.number().int(),
        paymentStatus: z.string(), fulfilmentStatus: z.string(), at: z.string(), atLabel: z.string(), totalLabel: z.string(),
      })),
      reports: z.object({
        salesByDay: z.array(z.object({ date: z.string(), onlineMinor: z.number().int(), posMinor: z.number().int(), orders: z.number().int().nonnegative() })),
        topProducts: z.array(z.object({ name: z.string(), variant: z.string(), qty: z.number(), revenueMinor: z.number().int() })),
        fulfilmentCounts: z.record(z.string(), z.number().int().nonnegative()),
        deliveryCounts: z.record(z.string(), z.number().int().nonnegative()),
        returnsSummary: z.object({ total: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), resolved: z.number().int().nonnegative(), refundedMinor: z.number().int().nonnegative() }),
        cashSummary: z.object({ openSessions: z.number().int().nonnegative(), expectedMinor: z.number().int(), lastClosedDiffMinor: z.number().int() }),
        stockValue: z.object({ costBasisMinor: z.number().int().nonnegative(), sellableUnits: z.number().nonnegative(), zeroVariants: z.number().int().nonnegative(), lowVariants: z.number().int().nonnegative() }),
        paymentsReconciliation: z.object({ settled: z.number().int().nonnegative(), unsettled: z.number().int().nonnegative(), exceptions: z.number().int().nonnegative() }),
      }),
    })),
    AdminAiSuggestionsResponse: json(z.array(z.object({
      id: z.string(), kind: z.enum(["shopping_answer","budget_basket","alternative","replenishment","expiry_promotion","dispatch_grouping","operations_explanation","business_answer","exception_flag"]),
      title: z.string(), detail: z.string(), evidence: z.array(z.string()), dataPeriod: z.string(),
      status: z.enum(["suggested","reviewed","dismissed"]),
      requiresRole: z.array(z.enum(["owner_admin","operations_manager","inventory_officer","cashier","picker_packer","dispatcher","finance_reviewer","rider"])),
      createdAt: z.string(), createdAtLabel: z.string(), source: z.literal("deterministic_demo"), proposedAction: z.string().optional(),
    }))),
    GhanaCatalogueCoverageResponse: json(z.object({
      rows: z.array(z.object({
        conceptId: z.string(), label: z.string(), mealIds: z.array(z.string()), mealLabels: z.array(z.string()),
        mealCount: z.number().int().nonnegative(), status: z.enum(["available","out_of_stock","wrong_form_only","missing"]),
        matchingProducts: z.array(z.object({ productId: z.string(), productName: z.string(), anyAvailable: z.boolean(), minPriceLabel: z.string() })),
        wrongFormProducts: z.array(z.object({ productId: z.string(), productName: z.string(), anyAvailable: z.boolean(), minPriceLabel: z.string() })),
        suggestedProductName: z.string(),
      })),
      summary: z.object({
        total: z.number().int().nonnegative(), available: z.number().int().nonnegative(), outOfStock: z.number().int().nonnegative(),
        wrongFormOnly: z.number().int().nonnegative(), missing: z.number().int().nonnegative(),
      }),
    })),
    AiGenerateResponse: json(z.object({ generated: z.number().int().nonnegative() })),
    AiReviewRequest: json(z.strictObject({ suggestionId: z.string().min(1).max(128), decision: z.enum(["reviewed","dismissed"]) })),
    AiReviewResponse: json(z.object({ status: z.enum(["reviewed","dismissed"]) })),
    BusinessQuestionRequest: json(z.strictObject({ question: z.string().trim().min(2).max(1000) })),
    BusinessQuestionResponse: json(z.object({ answer: z.string(), evidence: z.array(z.string()) })),
    LoginRequest: json(loginRequestSchema),
    RegisterRequest: json(registerRequestSchema),
    RefreshRequest: json(refreshRequestSchema),
    ByVariantsRequest: json(byVariantsRequestSchema),
    ReceiveRequest: json(stockReceiveRequestSchema),
    ApiError: json(
      z.object({
        ok: z.literal(false),
        requestId: z.uuid(),
        error: z.object({ code: z.string(), message: z.string() }),
      }),
    ),
  };
  const redactPublicOrder = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (node.properties) {
      delete node.properties.verificationCode;
      delete node.properties.verificationCodeHash;
      delete node.properties.job;
      if (node.properties.allocations)
        node.properties.allocations = { type: "array", maxItems: 0, items: { type: "object", additionalProperties: false, properties: {} } };
      for (const child of Object.values(node.properties)) redactPublicOrder(child);
    }
    if (node.items) redactPublicOrder(node.items);
    for (const key of ["oneOf", "anyOf", "allOf"])
      if (Array.isArray(node[key])) for (const child of node[key]) redactPublicOrder(child);
  };
  redactPublicOrder(schemas.PublicOrder);
  for (const name of [
    "WebSessionResponse",
    "NativeSessionResponse",
    "SessionLookupResponse",
  ])
    schemas[name].properties!.actor = ref("SessionActor");
  schemas.CatalogProductsResponse.properties!.items = {
    type: "array",
    items: ref("CatalogProduct"),
  };
  schemas.HomeResponse.properties!.categories = {
    type: "array",
    items: ref("Category"),
  };
  for (const name of ["offers", "popular", "trendingNew"])
    schemas.HomeResponse.properties![name] = {
      type: "array",
      items: ref("CatalogProduct"),
    };
  schemas.ProductDetailResponse.properties!.product = ref("CatalogProduct");
  schemas.ProductDetailResponse.properties!.related = {
    type: "array",
    items: ref("CatalogProduct"),
  };
  schemas.InventoryOverviewResponse.properties!.rows = {
    type: "array",
    items: ref("InventoryRow"),
  };
  const responses: Record<string, string> = {
    "/health/live": "LiveResponse",
    "/health/ready": "ReadyResponse",
    "/auth/sessions": "SessionResponse",
    "/auth/register": "SessionResponse",
    "/auth/me": "SessionLookupResponse",
    "/auth/logout": "LogoutResponse",
    "/auth/refresh": "NativeSessionResponse",
    "/catalog/categories": "CategoriesResponse",
    "/catalog/home": "HomeResponse",
    "/catalog/products": "CatalogProductsResponse",
    "/catalog/products/{slug}": "ProductDetailResponse",
    "/catalog/products:by-variants": "ByVariantsResponse",
    "/ai/meal-plan": "GhanaMealPlanResponse",
    "/admin/dashboard": "AdminDashboardResponse",
    "/admin/ai/suggestions": "AdminAiSuggestionsResponse",
    "/admin/ai/ghana-catalogue-coverage": "GhanaCatalogueCoverageResponse",
    "/admin/ai/generate": "AiGenerateResponse",
    "/admin/ai/review": "AiReviewResponse",
    "/admin/ai/business-question": "BusinessQuestionResponse",
    "/inventory/overview": "InventoryOverviewResponse",
    "/inventory/receive": "ReceiveResponse",
    "/checkout/zones": "ZoneListResponse",
    "/checkout/zones/{zoneId}/slots": "SlotListResponse",
    "/checkout/capabilities": "CheckoutCapabilitiesResponse",
    "/checkout/quote": "QuoteResponse",
    "/checkout/complete": "CompleteOrderResponse",
    "/orders/{orderId}": "PublicOrder",
    "/orders/track": "PublicOrder",
    "/account/summary": "AccountSummaryResponse",
    "/account/profile": "AccountProfileResponse",
    "/account/orders": "AccountOrderListResponse",
    "/account/orders/{orderId}/cancel": "AccountCancelResponse",
    "/orders/{orderId}/payment-attempts": "PaymentInitiationResponse",
    "/payments/providers/{provider}/events": "PaymentProviderEventResponse",
    "/payments": "PaymentListResponse",
    "/payments/{attemptId}/reconcile": "PaymentReconcileResponse",
    "/refunds": "RefundListResponse",
    "/refunds/{refundId}/actions": "RefundActionResponse",
    "/refunds/providers/hubtel/callback/{secret}": "HubtelRefundCallbackResponse",
    "/admin/orders/{orderId}/actions": "AdminOrderFinancialActionResponse",
  };
  for (const name of new Set(Object.values(responses)))
    schemas[name + "Envelope"] = {
      type: "object",
      required: ["ok", "data"],
      additionalProperties: false,
      properties: { ok: { type: "boolean", enum: [true] }, data: ref(name) },
    };
  doc.components!.schemas = schemas;
  const requests: Record<string, string> = {
    "/auth/sessions": "LoginRequest",
    "/auth/register": "RegisterRequest",
    "/auth/refresh": "RefreshRequest",
    "/catalog/products:by-variants": "ByVariantsRequest",
    "/ai/meal-plan": "GhanaMealPlanRequest",
    "/admin/ai/review": "AiReviewRequest",
    "/admin/ai/business-question": "BusinessQuestionRequest",
    "/inventory/receive": "ReceiveRequest",
    "/checkout/quote": "CheckoutQuoteRequest",
    "/checkout/complete": "CheckoutCompleteRequest",
    "/orders/track": "TrackRequest",
    "/account/profile": "AccountProfileUpdateRequest",
    "/account/orders/{orderId}/cancel": "AccountCancelRequest",
    "/orders/{orderId}/payment-attempts": "PaymentInitiationRequest",
    "/refunds/{refundId}/actions": "RefundActionRequest",
    "/refunds/providers/hubtel/callback/{secret}": "HubtelRefundCallbackRequest",
    "/admin/orders/{orderId}/actions": "AdminOrderFinancialActionRequest",
  };
  for (const [path, item] of Object.entries(doc.paths)) {
    const suffix = path.slice("/api/v1".length);
    const name = responses[suffix];
    if (!name) {
      const productionExtension =
        suffix === "/admin/catalog/products" ||
        suffix.startsWith("/admin/catalog/products/") ||
        suffix.startsWith("/admin/catalog/media/");
      if (productionExtension) continue;
      throw new Error(`Undocumented foundation endpoint: ${path}`);
    }
    for (const method of ["get", "post"] as const) {
      const operation = item?.[method];
      if (!operation) continue;
      if (
        suffix.startsWith("/inventory/") ||
        suffix === "/auth/me" ||
        suffix === "/auth/logout" ||
        suffix === "/account/summary" ||
        suffix === "/account/profile" ||
        suffix.startsWith("/account/orders") ||
        suffix === "/payments" ||
        suffix === "/payments/{attemptId}/reconcile" ||
        suffix === "/refunds" ||
        suffix === "/refunds/{refundId}/actions" ||
        suffix === "/admin/orders/{orderId}/actions" ||
        suffix === "/admin/dashboard" ||
        suffix.startsWith("/admin/ai/")
      ) operation.security = [{ cookieAuth: [] }, { bearerAuth: [] }];
      if (suffix === "/refunds/providers/hubtel/callback/{secret}")
        operation.security = [];
      if (suffix === "/checkout/complete" || suffix === "/orders/{orderId}" || suffix === "/orders/{orderId}/payment-attempts")
        operation.security = [{ cookieAuth: [] }, { bearerAuth: [] }, { guestAuth: [] }];
      const successCode = method === "post" && !["/checkout/quote","/orders/track","/account/profile","/account/orders/{orderId}/cancel","/payments/providers/{provider}/events","/payments/{attemptId}/reconcile","/refunds/{refundId}/actions","/refunds/providers/hubtel/callback/{secret}","/admin/orders/{orderId}/actions","/admin/ai/generate","/admin/ai/review","/admin/ai/business-question"].includes(suffix) ? "201" : "200";
      operation.responses[successCode] = {
        description: "Successful response",
        content: { "application/json": { schema: ref(name + "Envelope") } },
      };
      if (requests[suffix])
        operation.requestBody = {
          required: true,
          content: { "application/json": { schema: ref(requests[suffix]) } },
        };
      for (const code of [
        "400",
        "401",
        "403",
        "404",
        "409",
        "413",
        "422",
        "429",
        "500",
        "503",
      ])
        operation.responses[code] = {
          description: "Safe error envelope",
          content: { "application/json": { schema: ref("ApiError") } },
        };
    }
  }
  const pagination: ParameterObject[] = [
    {
      name: "page",
      in: "query",
      schema: { type: "integer", minimum: 1, maximum: 1000000, default: 1 },
    },
    {
      name: "perPage",
      in: "query",
      schema: { type: "integer", minimum: 1, maximum: 100, default: 12 },
    },
  ];
  doc.paths["/api/v1/catalog/products"]!.get!.parameters = [
    { name: "q", in: "query", schema: { type: "string", maxLength: 200 } },
    {
      name: "category",
      in: "query",
      schema: { type: "string", maxLength: 128 },
    },
    ...pagination,
    {
      name: "sort",
      in: "query",
      schema: {
        type: "string",
        enum: ["popular", "name", "price-asc", "price-desc"],
        default: "popular",
      },
    },
  ];
  doc.paths["/api/v1/checkout/zones/{zoneId}/slots"]!.get!.parameters = [
    {
      name: "zoneId",
      in: "path",
      required: true,
      schema: { type: "string", minLength: 1 },
    },
  ];
  doc.paths["/api/v1/inventory/overview"]!.get!.parameters = [
    {
      name: "locationId",
      in: "query",
      description:
        "Defaults to API_STOCK_LOCATION_ID. Inventory managers require a location grant; owner admins have business-wide access.",
      schema: { type: "string", maxLength: 128 },
    },
    ...pagination,
  ];
  doc.paths["/api/v1/auth/sessions"]!.post!.description =
    "Web sign-in requires a trusted Origin and sets an HttpOnly cookie. Native sign-in returns opaque access and refresh credentials. The client field selects the response variant.";
  doc.paths["/api/v1/auth/register"]!.post!.description =
    "Public customer-only account registration. The server fixes role=customer, hashes the password with scrypt, creates the account and initial session atomically, and requires a trusted Origin for web registration.";
  doc.paths["/api/v1/auth/me"]!.get!.description =
    "Cookie authentication returns csrfToken for subsequent mutations; native bearer authentication omits csrfToken.";
  doc.paths["/api/v1/auth/logout"]!.post!.parameters = [
    {
      name: "X-CSRF-Token",
      in: "header",
      required: false,
      description:
        "Required with cookie authentication alongside a trusted Origin.",
      schema: { type: "string", pattern: "^[a-f0-9]{64}$" },
    },
  ];

  doc.paths["/api/v1/checkout/capabilities"]!.get!.security = [];
  doc.paths["/api/v1/checkout/capabilities"]!.get!.description =
    "Public checkout capability projection. Exposes only whether a fully configured, server-authorized hosted electronic payment path is currently available; provider identity, rails and credentials remain private.";

  doc.paths["/api/v1/admin/dashboard"]!.get!.description =
    "Administrator-only operations dashboard derived from live order, inventory, payment, refund and dispatch authority. Unsupported POS/physical-returns metrics remain explicitly zero rather than being fabricated.";
  doc.paths["/api/v1/admin/ai/suggestions"]!.get!.description =
    "Administrator-only reviewable operational suggestions grounded in current authority data. Suggestions never execute stock, payment, refund, pricing, purchasing or dispatch changes.";
  doc.paths["/api/v1/admin/ai/ghana-catalogue-coverage"]!.get!.description =
    "Administrator-only Ghana meal catalogue coverage derived from published active-category products and live stock availability. Missing and wrong-form rows are sourcing evidence only; no product, price, stock, purchase or publication action is created automatically.";
  doc.paths["/api/v1/admin/ai/generate"]!.post!.description =
    "Re-evaluates deterministic live-data signals and records an audit event. It does not execute the proposed actions.";
  doc.paths["/api/v1/admin/ai/review"]!.post!.description =
    "Records a durable human review/dismissal decision for a currently applicable suggestion in the audit trail.";
  doc.paths["/api/v1/admin/ai/business-question"]!.post!.description =
    "Answers a bounded operations question from server evidence; when the optional model is configured it may phrase the answer, but it cannot create authority facts or execute actions.";

  doc.paths["/api/v1/checkout/complete"]!.post!.parameters = [
    {
      name: "Idempotency-Key", in: "header", required: true,
      description: "8–128 letters, digits, underscores, colons or hyphens. Same principal/key/request replays one order.",
      schema: { type: "string", pattern: "^[A-Za-z0-9:_-]{8,128}$" },
    },
    {
      name: "X-CSRF-Token", in: "header", required: false,
      description: "Required for web-cookie or guest-cookie mutation flows alongside a trusted Origin.",
      schema: { type: "string", minLength: 1 },
    },
  ];
  doc.paths["/api/v1/checkout/complete"]!.post!.description =
    "Creates one durable online order and its Inventory-owned reservations atomically. Authenticated customers or a valid guest capability may order. Client prices, totals and customerId never establish authority.";
  doc.paths["/api/v1/orders/{orderId}"]!.get!.description =
    "Customer-safe owner status. Requires the owning customer session or the exact owning guest capability; knowing an order ID is insufficient.";
  doc.paths["/api/v1/orders/track"]!.post!.security = [];
  doc.paths["/api/v1/orders/track"]!.post!.description =
    "Public capability lookup using order reference plus verification code. Failed attempts are durably rate-limited; submitted codes are never persisted.";
  doc.paths["/api/v1/account/summary"]!.get!.description =
    "Authenticated-customer-only account overview. Customer identity comes from the session; response fields are customer-safe projections and Physical Returns are never inferred from Refund records.";
  doc.paths["/api/v1/account/profile"]!.get!.description =
    "Authenticated-customer-only profile projection.";
  doc.paths["/api/v1/account/profile"]!.post!.description =
    "Authenticated-customer-only profile update. Web-cookie mutation requires a trusted Origin and CSRF token; payment, order and inventory truth are unaffected.";
  doc.paths["/api/v1/account/profile"]!.post!.parameters = [{ name: "X-CSRF-Token", in: "header", required: false, description: "Required with cookie authentication alongside a trusted Origin.", schema: { type: "string", minLength: 1 } }];

  doc.paths["/api/v1/account/orders"]!.get!.parameters = [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
    { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
    { name: "customerId", in: "query", required: false, description: "Compatibility only; when supplied it must match the authenticated customer.", schema: { type: "string" } },
  ];
  for (const [path, method] of [["/api/v1/orders/{orderId}","get"],["/api/v1/account/orders/{orderId}/cancel","post"]] as const) {
    doc.paths[path]![method]!.parameters = [{ name: "orderId", in: "path", required: true, schema: { type: "string", minLength: 1 } }];
  }
  doc.paths["/api/v1/account/orders/{orderId}/cancel"]!.post!.description =
    "Authenticated-customer-only pre-handover cancellation. Order state, Refund obligations for every successful capture, Inventory reservation release and delivery-slot release commit atomically. Live or uncertain payments require reconciliation before cancellation; provider refund execution happens separately after approval.";

  const paymentInitiation = doc.paths["/api/v1/orders/{orderId}/payment-attempts"]!.post!;
  paymentInitiation.parameters = [
    { name: "orderId", in: "path", required: true, schema: { type: "string", minLength: 1 } },
    {
      name: "Idempotency-Key", in: "header", required: true,
      description: "8–128 letters, digits, underscores, colons or hyphens. Same owner/key/request replays one durable attempt.",
      schema: { type: "string", pattern: "^[A-Za-z0-9:_-]{8,128}$" },
    },
    {
      name: "X-CSRF-Token", in: "header", required: false,
      description: "Required for web-cookie or guest-cookie mutation flows alongside a trusted Origin.",
      schema: { type: "string", minLength: 1 },
    },
  ];
  paymentInitiation.description =
    "Creates or safely replays one durable electronic payment attempt for the owning customer/guest order. Amount, currency, payment method and provider authority are derived server-side from the immutable order and configured adapter; the request accepts no card PAN/CVV or client-supplied money truth.";

  const providerEvent = doc.paths["/api/v1/payments/providers/{provider}/events"]!.post!;
  providerEvent.security = [];
  providerEvent.parameters = [
    { name: "provider", in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 64 } },
  ];
  providerEvent.requestBody = {
    required: true,
    description: "Provider-defined JSON. Variety preserves the exact raw request bytes for adapter verification before parsing/trusting any payment observation; raw payloads and authentication/signature headers are not persisted.",
    content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
  };
  providerEvent.description =
    "Provider callback authenticated by the configured payment adapter using exact raw bytes and provider-specific verification/lookup. This route does not use customer authentication and callback fields alone never establish paid state.";

  const paymentList = doc.paths["/api/v1/payments"]!.get!;
  paymentList.description =
    "Administrator-only, bounded staff payments ledger. Returns safe payment/settlement state without raw provider events, signatures, credentials or reconciliation internals.";
  paymentList.parameters = [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000000, default: 1 } },
    { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
    { name: "status", in: "query", schema: { type: "string", enum: ["initiated","pending","succeeded","failed","expired"] } },
    { name: "settlementState", in: "query", schema: { type: "string", enum: ["unsettled","settled","reconciled","exception"] } },
    { name: "provider", in: "query", schema: { type: "string", maxLength: 64 } },
    { name: "method", in: "query", schema: { type: "string", enum: ["mobile_money","card_hosted","bank_transfer"] } },
    { name: "orderReference", in: "query", schema: { type: "string", maxLength: 128 } },
    { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
    { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
  ];

  const reconcilePayment = doc.paths["/api/v1/payments/{attemptId}/reconcile"]!.post!;
  reconcilePayment.parameters = [
    { name: "attemptId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
    {
      name: "X-CSRF-Token", in: "header", required: false,
      description: "Required for administrator web-cookie mutation flows alongside a trusted Origin.",
      schema: { type: "string", minLength: 1 },
    },
  ];
  reconcilePayment.description =
    "Administrator-only reconciliation command. Reads an immutable attempt snapshot, performs authoritative provider lookup outside the database transaction, then rechecks Order→Attempt locks before applying the observation through PaymentOutcomeService. Repeat execution cannot duplicate financial effects.";


  const refundList = doc.paths["/api/v1/refunds"]!.get!;
  refundList.description =
    "Administrator-only bounded Refunds ledger. Shows durable refund obligations, capture/refund balances and safe execution/reconciliation state without merchant refund references, original capture references, raw provider evidence, signatures or credentials.";
  refundList.parameters = [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000000, default: 1 } },
    { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
    { name: "status", in: "query", schema: { type: "string", enum: ["awaiting_approval","approved","processing","succeeded","failed","requires_review"] } },
    { name: "provider", in: "query", schema: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{0,63}$" } },
    { name: "method", in: "query", schema: { type: "string", enum: ["mobile_money","card_hosted","bank_transfer"] } },
    { name: "sourceType", in: "query", schema: { type: "string", enum: ["customer_cancellation","payment_review_cancellation","overcharge_correction","return"] } },
    { name: "orderReference", in: "query", schema: { type: "string", maxLength: 128 } },
    { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
    { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
  ];

  const refundAction = doc.paths["/api/v1/refunds/{refundId}/actions"]!.post!;
  refundAction.parameters = [
    { name: "refundId", in: "path", required: true, schema: { type: "string", minLength: 1 } },
    {
      name: "Idempotency-Key", in: "header", required: true,
      description: "Durable administrator-scoped replay key. Same key and action replays the same refund operation; changed action conflicts.",
      schema: { type: "string", minLength: 8, maxLength: 128 },
    },
    {
      name: "X-CSRF-Token", in: "header", required: false,
      description: "Required for administrator web-cookie mutation flows alongside a trusted Origin.",
      schema: { type: "string", minLength: 1 },
    },
  ];
  refundAction.description =
    "Administrator-only Refund action. Approval changes obligation state only; execute/retry/reconcile use the immutable server-derived capture, provider, amount and GHS currency. Provider I/O occurs outside database transactions, uncertain retries lookup the same merchant refund reference first, and request bodies cannot choose money/provider identity.";
  refundAction.requestBody = {
    required: true,
    content: { "application/json": { schema: json(refundActionRequestSchema) } },
  };

  const hubtelRefundCallback = doc.paths["/api/v1/refunds/providers/hubtel/callback/{secret}"]!.post!;
  hubtelRefundCallback.security = [];
  hubtelRefundCallback.parameters = [
    {
      name: "secret", in: "path", required: true,
      description: "Unpredictable provider callback capability configured server-side and supplied only to Hubtel. The value is never returned by this API.",
      schema: { type: "string", minLength: 32, maxLength: 128 },
    },
  ];
  hubtelRefundCallback.description =
    "Hubtel-only refund outcome callback. The callback capability, original Hubtel order reference, refund amount and provider transaction evidence are revalidated against the existing RefundExecution before the central RefundOutcomeService may change refund or order payment state. Duplicate terminal callbacks are idempotent.";
  hubtelRefundCallback.requestBody = {
    required: true,
    description: "Hubtel provider callback JSON. Fields remain untrusted until matched to server-owned refund execution and money identity.",
    content: { "application/json": { schema: ref("HubtelRefundCallbackRequest") } },
  };

  const adminOrderAction = doc.paths["/api/v1/admin/orders/{orderId}/actions"]!.post!;
  adminOrderAction.parameters = [
    { name: "orderId", in: "path", required: true, schema: { type: "string", minLength: 1 } },
    {
      name: "Idempotency-Key", in: "header", required: true,
      description: "Durable administrator-scoped replay key for the financial order action.",
      schema: { type: "string", minLength: 8, maxLength: 128 },
    },
    {
      name: "X-CSRF-Token", in: "header", required: false,
      description: "Required for administrator web-cookie mutation flows alongside a trusted Origin.",
      schema: { type: "string", minLength: 1 },
    },
  ];
  adminOrderAction.description =
    "Administrator-only financial order resolution. cancel_refund atomically ensures all missing successful-capture refund obligations before cancelling/releasing pre-handover resources; refund_excess_capture creates only the server-derived verified over-capture correction and never changes fulfilment or stock. The client cannot choose refund amount, provider, currency or payment attempt.";
  adminOrderAction.requestBody = {
    required: true,
    content: { "application/json": { schema: json(adminOrderFinancialActionRequestSchema) } },
  };

  doc.paths["/api/v1/inventory/receive"]!.post!.description =
    "Positive exact quantities with at most three decimal places; count-based units require whole quantities. Cookie authentication requires X-CSRF-Token and a trusted Origin. supplierId is refused until purchasing exists. Client actor is ignored. A replay key covers this actor and operation.";
  return doc;
}
