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
  dashboardViewSchema,
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
    QuoteResponse: json(quoteResponseSchema),
    CheckoutQuoteRequest: json(checkoutQuoteRequestSchema),
    CheckoutCompleteRequest: json(checkoutCompleteRestRequestSchema),
    CompleteOrderResponse: json(z.object({ orderId:z.string(), reference:z.string(), verificationCode:z.string(), paymentRequired:z.boolean() })),
    PublicOrder: json(publicOrderSchema),
    AccountCustomer: json(z.object({ id:z.string(), name:z.string(), phone:z.string(), email:z.string().email().optional(), addressIds:z.array(z.string()), isDemo:z.boolean(), supportNotes:z.array(z.string()), createdAt:z.iso.datetime() })),
    AccountAddress: json(z.object({ id:z.string(), label:z.string(), recipientName:z.string(), phone:z.string(), locality:z.string(), street:z.string(), landmark:z.string().optional(), ghanaPostGps:z.string().optional(), isDefault:z.boolean().optional() })),
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
    AdminOrderRow: {
      type: "object", additionalProperties: false,
      required: ["id","reference","channel","customerName","customerPhone","fulfilment","totalLabel","paymentStatus","fulfilmentStatus","deliveryStatus","lineCount","createdAtLabel"],
      properties: {
        id:{type:"string"}, reference:{type:"string"}, channel:{type:"string"}, customerName:{type:"string"}, customerPhone:{type:"string"},
        fulfilment:{type:"string"}, totalLabel:{type:"string"}, paymentStatus:{type:"string"}, fulfilmentStatus:{type:"string"}, deliveryStatus:{type:"string"},
        lineCount:{type:"integer",minimum:0}, createdAtLabel:{type:"string"}, posReceiptNo:{type:"string"},
      },
    },
    AdminOrderListResponse: { type: "array", items: ref("AdminOrderRow") },
    AdminOrderReservation: {
      type: "object", additionalProperties: false,
      required: ["id","quantity","expiresAt","variantId"],
      properties: { id:{type:"string"}, quantity:{type:"string"}, expiresAt:{type:"string"}, consumedAt:{type:"string"}, releasedAt:{type:"string"}, releasedReason:{type:"string"}, variantId:{type:"string"} },
    },
    AdminOrderInternal: {
      type: "object", additionalProperties: false,
      required: ["customerNotes","reservations","suggestions","refunds"],
      properties: {
        address: ref("AccountAddress"),
        zone: { type:"object", additionalProperties:false, required:["id","name"], properties:{id:{type:"string"},name:{type:"string"}} },
        customerId:{type:"string"},
        customerNotes:{type:"array",items:{type:"object",additionalProperties:false,required:["at","by","text","internalOnly"],properties:{at:{type:"string"},by:{type:"string"},text:{type:"string"},internalOnly:{type:"boolean"}}}},
        reservations:{type:"array",items:ref("AdminOrderReservation")},
        suggestions:{type:"array",items:{type:"object",additionalProperties:false,required:["id","name","priceLabel","availableToSell"],properties:{id:{type:"string"},name:{type:"string"},priceLabel:{type:"string"},availableToSell:{type:"string"}}}},
        refunds:{type:"array",items:{type:"object",additionalProperties:true,required:["id","orderId","amountMinor","amountLabel","status","method","reason","requestedBy","retryCount","createdAt"],properties:{id:{type:"string"},orderId:{type:"string"},amountMinor:{type:"integer"},amountLabel:{type:"string"},status:{type:"string"},method:{type:"string"},reason:{type:"string"},requestedBy:{type:"string"},retryCount:{type:"integer"},createdAt:{type:"string"}}}},
      },
    },
    AdminOrderDetailResponse: { type:"object", additionalProperties:false, required:["order","internal"], properties:{ order:ref("PublicOrder"), internal:ref("AdminOrderInternal") } },
    AdminVariantRow: {
      type:"object", additionalProperties:false,
      required:["id","name","priceLabel","priceMinor","unit","availableToSell","isAvailable","safetyStock","isActive"],
      properties:{ id:{type:"string"},name:{type:"string"},priceLabel:{type:"string"},priceMinor:{type:"integer"},barcode:{type:"string"},unit:{type:"string"},availableToSell:{type:"string"},isAvailable:{type:"boolean"},safetyStock:{type:"string"},isActive:{type:"boolean"} },
    },
    AdminProductRow: {
      type:"object", additionalProperties:false,
      required:["id","name","slug","categoryId","isPublished","shortDescription","image","variants","anyAvailable"],
      properties:{ id:{type:"string"},name:{type:"string"},slug:{type:"string"},categoryName:{type:"string"},categoryId:{type:"string"},isPublished:{type:"boolean"},shortDescription:{type:"string"},image:{type:"string"},variants:{type:"array",items:ref("AdminVariantRow")},anyAvailable:{type:"boolean"} },
    },
    AdminProductListResponse: { type:"array", items:ref("AdminProductRow") },
    AdminVariantAvailability: {
      type:"object", additionalProperties:false,
      required:["sellablePhysical","reserved","availableToSell","isAvailable"],
      properties:{ sellablePhysical:{type:"string"},reserved:{type:"string"},availableToSell:{type:"string"},isAvailable:{type:"boolean"} },
    },
    AdminVariantLot: {
      type:"object", additionalProperties:false,
      required:["lotId","lotNumber","quantity","quarantined","kind"],
      properties:{ lotId:{type:"string"},lotNumber:{type:"string"},quantity:{type:"string"},expiryDate:{type:"string"},quarantined:{type:"boolean"},kind:{type:"string"} },
    },
    AdminVariantDetail: {
      type:"object", additionalProperties:false,
      required:["id","name","unit","unitSize","priceMinor","priceLabel","safetyStock","isActive","availability","lots"],
      properties:{ id:{type:"string"},name:{type:"string"},unit:{type:"string"},unitSize:{type:"string"},priceMinor:{type:"integer"},priceLabel:{type:"string"},compareAtPriceMinor:{type:"integer"},barcode:{type:"string"},safetyStock:{type:"string"},isActive:{type:"boolean"},availability:ref("AdminVariantAvailability"),lots:{type:"array",items:ref("AdminVariantLot")} },
    },
    AdminProductDetailResponse: {
      type:"object", additionalProperties:false,
      required:["id","name","slug","description","shortDescription","tags","isPublished","image","variants","lots","movements"],
      properties:{
        id:{type:"string"},name:{type:"string"},slug:{type:"string"},description:{type:"string"},shortDescription:{type:"string"},tags:{type:"array",items:{type:"string"}},isPublished:{type:"boolean"},categoryName:{type:"string"},image:{type:"string"},variants:{type:"array",items:ref("AdminVariantDetail")},
        lots:{type:"array",items:{type:"object",additionalProperties:false,required:["id","lotNumber","quantity","kind","isQuarantined"],properties:{id:{type:"string"},lotNumber:{type:"string"},quantity:{type:"string"},kind:{type:"string"},expiryDate:{type:"string"},isQuarantined:{type:"boolean"}}}},
        movements:{type:"array",items:{type:"object",additionalProperties:false,required:["id","delta","reason","atLabel","resultingQty"],properties:{id:{type:"string"},delta:{type:"string"},reason:{type:"string"},atLabel:{type:"string"},note:{type:"string"},resultingQty:{type:"string"}}}},
      },
    },
    AdminCategoryRow: {
      type:"object", additionalProperties:false,
      required:["id","slug","name","description","isActive","sortOrder","productCount","availableCount"],
      properties:{id:{type:"string"},slug:{type:"string"},name:{type:"string"},description:{type:"string"},isActive:{type:"boolean"},sortOrder:{type:"integer"},productCount:{type:"integer",minimum:0},availableCount:{type:"integer",minimum:0}},
    },
    AdminCategoryListResponse: { type:"array", items:ref("AdminCategoryRow") },
    AdminCustomerRow: {
      type:"object", additionalProperties:false,
      required:["id","name","phone","isDemo","supportNotes","createdAt","orderCount","spendLabel","returnCount","addressCount"],
      properties:{ id:{type:"string"},name:{type:"string"},phone:{type:"string"},email:{type:"string"},isDemo:{type:"boolean"},supportNotes:{type:"array",items:{type:"string"}},createdAt:{type:"string"},orderCount:{type:"integer",minimum:0},spendLabel:{type:"string"},returnCount:{type:"integer",minimum:0},addressCount:{type:"integer",minimum:0} },
    },
    AdminCustomerListResponse: { type:"array", items:ref("AdminCustomerRow") },
    AdminCustomerOrder: {
      type:"object", additionalProperties:false,
      required:["id","reference","totalLabel","channel","fulfilmentStatus","paymentStatus","createdAtLabel"],
      properties:{ id:{type:"string"},reference:{type:"string"},totalLabel:{type:"string"},channel:{type:"string"},fulfilmentStatus:{type:"string"},paymentStatus:{type:"string"},createdAtLabel:{type:"string"} },
    },
    AdminCustomerReturn: {
      type:"object", additionalProperties:false,
      required:["id","reference","status"],
      properties:{ id:{type:"string"},reference:{type:"string"},status:{type:"string"} },
    },
    AdminCustomerDetailResponse: {
      type:"object", additionalProperties:false,
      required:["customer","addresses","orders","returns"],
      properties:{ customer:ref("AccountCustomer"),addresses:{type:"array",items:ref("AccountAddress")},orders:{type:"array",items:ref("AdminCustomerOrder")},returns:{type:"array",items:ref("AdminCustomerReturn")} },
    },
    AdminDashboardResponse: json(dashboardViewSchema),
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
    "/inventory/overview": "InventoryOverviewResponse",
    "/inventory/receive": "ReceiveResponse",
    "/checkout/zones": "ZoneListResponse",
    "/checkout/zones/{zoneId}/slots": "SlotListResponse",
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
    "/admin/orders": "AdminOrderListResponse",
    "/admin/orders/{orderId}": "AdminOrderDetailResponse",
    "/admin/orders/{orderId}/actions": "AdminOrderFinancialActionResponse",
    "/admin/products": "AdminProductListResponse",
    "/admin/products/{productId}": "AdminProductDetailResponse",
    "/admin/categories": "AdminCategoryListResponse",
    "/admin/customers": "AdminCustomerListResponse",
    "/admin/customers/{customerId}": "AdminCustomerDetailResponse",
    "/admin/dashboard": "AdminDashboardResponse",
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
        suffix === "/admin/orders" ||
        suffix === "/admin/orders/{orderId}" ||
        suffix === "/admin/orders/{orderId}/actions" ||
        suffix === "/admin/products" ||
        suffix === "/admin/products/{productId}" ||
        suffix === "/admin/categories" ||
        suffix === "/admin/customers" ||
        suffix === "/admin/customers/{customerId}" ||
        suffix === "/admin/dashboard"
      ) operation.security = [{ cookieAuth: [] }, { bearerAuth: [] }];
      if (suffix === "/refunds/providers/hubtel/callback/{secret}")
        operation.security = [];
      if (suffix === "/checkout/complete" || suffix === "/orders/{orderId}" || suffix === "/orders/{orderId}/payment-attempts")
        operation.security = [{ cookieAuth: [] }, { bearerAuth: [] }, { guestAuth: [] }];
      const successCode = method === "post" && !["/checkout/quote","/orders/track","/account/profile","/account/orders/{orderId}/cancel","/payments/providers/{provider}/events","/payments/{attemptId}/reconcile","/refunds/{refundId}/actions","/refunds/providers/hubtel/callback/{secret}","/admin/orders/{orderId}/actions"].includes(suffix) ? "201" : "200";
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
    { name: "method", in: "query", schema: { type: "string", enum: ["hosted_checkout","mobile_money","card_hosted","bank_transfer"] } },
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
    { name: "method", in: "query", schema: { type: "string", enum: ["hosted_checkout","mobile_money","card_hosted","bank_transfer"] } },
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

  doc.paths["/api/v1/admin/dashboard"]!.get!.description =
    "Administrator-only operational dashboard backed by production Order, Payment, Refund, Delivery and Inventory authorities. Physical-return and cashier-session counters remain zero until those production authorities exist; the API does not fabricate mock records.";

  doc.paths["/api/v1/inventory/receive"]!.post!.description =
    "Positive exact quantities with at most three decimal places; count-based units require whole quantities. Cookie authentication requires X-CSRF-Token and a trusted Origin. supplierId is refused until purchasing exists. Client actor is ignored. A replay key covers this actor and operation.";
  return doc;
}
