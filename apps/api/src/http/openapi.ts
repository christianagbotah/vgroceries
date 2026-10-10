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
} from "@variety/contracts";
import { z } from "zod";

export function foundationOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Variety Groceries foundation API")
    .setVersion("0.1.0")
    .setDescription(
      "Implemented foundation endpoints only. Commerce, payments, delivery, worker publishing and live AI remain later milestones.",
    )
    .addCookieAuth("vg_session", { type: "apiKey", in: "cookie" }, "cookieAuth")
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
        suffix === "/auth/logout"
      )
        operation.security = [{ cookieAuth: [] }, { bearerAuth: [] }];
      operation.responses[method === "post" ? "201" : "200"] = {
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
  doc.paths["/api/v1/inventory/receive"]!.post!.description =
    "Positive exact quantities with at most three decimal places; count-based units require whole quantities. Cookie authentication requires X-CSRF-Token and a trusted Origin. supplierId is refused until purchasing exists. Client actor is ignored. A replay key covers this actor and operation.";
  return doc;
}
