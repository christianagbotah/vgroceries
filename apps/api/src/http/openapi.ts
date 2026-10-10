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
  paymentInitiationRequestSchema,
  paymentInitiationResultSchema,
  paymentProviderEventResponseSchema,
  paymentListResponseSchema,
  paymentReconcileResponseSchema,
} from "@variety/contracts";
import { z } from "zod";

export function foundationOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Variety Groceries production API")
    .setVersion("0.1.0")
    .setDescription(
      "Implemented production subset: identity, catalogue, inventory receiving, delivery configuration, authoritative checkout/orders and provider-neutral Payments Authority. Stock handover, refunds, fulfilment/dispatch, POS and public storefront cutover remain closed.",
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
    LoginRequest: json(loginRequestSchema),
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
    "/account/orders": "AccountOrderListResponse",
    "/account/orders/{orderId}/cancel": "AccountCancelResponse",
    "/orders/{orderId}/payment-attempts": "PaymentInitiationResponse",
    "/payments/providers/{provider}/events": "PaymentProviderEventResponse",
    "/payments": "PaymentListResponse",
    "/payments/{attemptId}/reconcile": "PaymentReconcileResponse",
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
    "/auth/refresh": "RefreshRequest",
    "/catalog/products:by-variants": "ByVariantsRequest",
    "/inventory/receive": "ReceiveRequest",
    "/checkout/quote": "CheckoutQuoteRequest",
    "/checkout/complete": "CheckoutCompleteRequest",
    "/orders/track": "TrackRequest",
    "/account/orders/{orderId}/cancel": "AccountCancelRequest",
    "/orders/{orderId}/payment-attempts": "PaymentInitiationRequest",
  };
  for (const [path, item] of Object.entries(doc.paths)) {
    const suffix = path.slice("/api/v1".length);
    const name = responses[suffix];
    if (!name) throw new Error(`Undocumented foundation endpoint: ${path}`);
    for (const method of ["get", "post"] as const) {
      const operation = item?.[method];
      if (!operation) continue;
      if (
        suffix.startsWith("/inventory/") ||
        suffix === "/auth/me" ||
        suffix === "/auth/logout" ||
        suffix.startsWith("/account/orders") ||
        suffix === "/payments" ||
        suffix === "/payments/{attemptId}/reconcile"
      ) operation.security = [{ cookieAuth: [] }, { bearerAuth: [] }];
      if (suffix === "/checkout/complete" || suffix === "/orders/{orderId}" || suffix === "/orders/{orderId}/payment-attempts")
        operation.security = [{ cookieAuth: [] }, { bearerAuth: [] }, { guestAuth: [] }];
      const successCode = method === "post" && !["/checkout/quote","/orders/track","/account/orders/{orderId}/cancel","/payments/providers/{provider}/events","/payments/{attemptId}/reconcile"].includes(suffix) ? "201" : "200";
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
  doc.paths["/api/v1/account/orders"]!.get!.parameters = [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
    { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
    { name: "customerId", in: "query", required: false, description: "Compatibility only; when supplied it must match the authenticated customer.", schema: { type: "string" } },
  ];
  for (const [path, method] of [["/api/v1/orders/{orderId}","get"],["/api/v1/account/orders/{orderId}/cancel","post"]] as const) {
    doc.paths[path]![method]!.parameters = [{ name: "orderId", in: "path", required: true, schema: { type: "string", minLength: 1 } }];
  }
  doc.paths["/api/v1/account/orders/{orderId}/cancel"]!.post!.description =
    "Authenticated-customer-only pre-handover cancellation. Order state, Inventory reservations and delivery-slot booking release in one locked transaction; live payments require reconciliation and captured/refund-sensitive payments require the future refund workflow.";

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

  doc.paths["/api/v1/inventory/receive"]!.post!.description =
    "Positive exact quantities with at most three decimal places; count-based units require whole quantities. Cookie authentication requires X-CSRF-Token and a trusted Origin. supplierId is refused until purchasing exists. Client actor is ignored. A replay key covers this actor and operation.";
  return doc;
}
