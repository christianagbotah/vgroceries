import type { INestApplication } from "@nestjs/common";
import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ResponseObject,
  SchemaObject,
  SecurityRequirementObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import {
  fulfilmentActionResponseSchema,
  fulfilmentConfirmRequestSchema,
  fulfilmentDetailResponseSchema,
  fulfilmentHandoverRequestSchema,
  fulfilmentPackRequestSchema,
  fulfilmentPickRequestSchema,
  fulfilmentQueueResponseSchema,
  fulfilmentStartPickingRequestSchema,
  createProductDraftRequestSchema,
  reorderGalleryRequestSchema,
  setFeaturedMediaRequestSchema,
  setProductBrandModeRequestSchema,
} from "@variety/contracts";
import { z } from "zod";
import { foundationOpenApi } from "./openapi";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: "openapi-3.0" }) as SchemaObject;
const security: SecurityRequirementObject[] = [{ cookieAuth: [] }, { bearerAuth: [] }];
const errorResponse: ResponseObject = {
  description: "Safe error envelope",
  content: { "application/json": { schema: ref("ApiError") } },
};
const orderId: ParameterObject = {
  name: "orderId",
  in: "path",
  required: true,
  schema: { type: "string", minLength: 1 },
};
const replay: ParameterObject = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  description: "Durable administrator-scoped replay key for this fulfilment command.",
  schema: { type: "string", minLength: 8, maxLength: 128 },
};
const csrf: ParameterObject = {
  name: "X-CSRF-Token",
  in: "header",
  required: false,
  description: "Required for administrator web-cookie mutation flows alongside a trusted Origin.",
  schema: { type: "string", minLength: 1 },
};

function response(schemaName: string): ResponseObject {
  return {
    description: "Successful response",
    content: { "application/json": { schema: ref(schemaName) } },
  };
}

function mutation(
  description: string,
  requestSchema: string,
  extraParameters: ParameterObject[] = [],
): OperationObject {
  return {
    security,
    description,
    parameters: [orderId, ...extraParameters, replay, csrf],
    requestBody: {
      required: true,
      content: { "application/json": { schema: ref(requestSchema) } },
    },
    responses: {
      "200": response("FulfilmentActionResponseEnvelope"),
      "400": errorResponse,
      "401": errorResponse,
      "403": errorResponse,
      "404": errorResponse,
      "409": errorResponse,
      "413": errorResponse,
      "422": errorResponse,
      "429": errorResponse,
      "500": errorResponse,
      "503": errorResponse,
    },
  };
}

export function productionOpenApi(app: INestApplication): OpenAPIObject {
  const doc = foundationOpenApi(app);
  const schemas = doc.components!.schemas as Record<string, SchemaObject>;

  Object.assign(schemas, {
    FulfilmentConfirmRequest: json(fulfilmentConfirmRequestSchema),
    FulfilmentStartPickingRequest: json(fulfilmentStartPickingRequestSchema),
    FulfilmentPickRequest: json(fulfilmentPickRequestSchema),
    FulfilmentPackRequest: json(fulfilmentPackRequestSchema),
    FulfilmentHandoverRequest: json(fulfilmentHandoverRequestSchema),
    FulfilmentQueueResponse: json(fulfilmentQueueResponseSchema),
    FulfilmentDetailResponse: json(fulfilmentDetailResponseSchema),
    FulfilmentActionResponse: json(fulfilmentActionResponseSchema),
    CreateProductDraftRequest: json(createProductDraftRequestSchema),
    SetFeaturedMediaRequest: json(setFeaturedMediaRequestSchema),
    ReorderGalleryRequest: json(reorderGalleryRequestSchema),
    SetProductBrandModeRequest: json(setProductBrandModeRequestSchema),
    ArchiveProductMediaRequest: json(z.strictObject({ replacementFeaturedMediaId: z.string().min(1).nullable().optional() })),
    ProductDraftResponse: {
      type: "object", required: ["productId", "editorPath"], additionalProperties: false,
      properties: { productId: { type: "string" }, editorPath: { type: "string" } },
    },
    ProductMediaView: {
      type: "object",
      required: ["id","productId","source","status","previewUrl","mimeType","width","height","byteSize","sha256","altText","createdBy","createdAt","updatedAt"],
      additionalProperties: false,
      properties: {
        id:{type:"string"}, productId:{type:"string"},
        source:{type:"string",enum:["upload","ai_generated","ai_edited","legacy_import"]},
        status:{type:"string",enum:["draft","ready_for_review","approved","rejected","archived"]},
        previewUrl:{type:"string"}, publicUrl:{type:"string"},
        mimeType:{type:"string",enum:["image/jpeg","image/png","image/webp"]},
        width:{type:"integer",minimum:1}, height:{type:"integer",minimum:1}, byteSize:{type:"integer",minimum:1},
        sha256:{type:"string",pattern:"^[0-9a-f]{64}$"}, altText:{type:"string"}, galleryOrder:{type:"integer",minimum:0},
        originalFilename:{type:"string"}, generationJobId:{type:"string"}, createdBy:{type:"string"}, approvedBy:{type:"string"},
        approvedAt:{type:"string",format:"date-time"}, rejectedAt:{type:"string",format:"date-time"}, archivedAt:{type:"string",format:"date-time"},
        createdAt:{type:"string",format:"date-time"}, updatedAt:{type:"string",format:"date-time"},
      },
    },
    ImageGenerationJobView: {
      type:"object", required:["id","productId","requestedBy","mode","stylePreset","status","provider","model","candidateCount","attemptCount","candidateMediaIds","createdAt","updatedAt"],
      additionalProperties:false,
      properties:{
        id:{type:"string"}, productId:{type:"string"}, requestedBy:{type:"string"},
        mode:{type:"string",enum:["unbranded_generation","branded_packshot_edit"]},
        stylePreset:{type:"string",enum:["clean_studio","fresh_market","lifestyle_kitchen","ghana_market"]},
        status:{type:"string",enum:["queued","generating","succeeded","failed","cancelled"]},
        provider:{type:"string"},model:{type:"string"},candidateCount:{type:"integer",minimum:1,maximum:4},attemptCount:{type:"integer",minimum:0,maximum:3},
        referenceMediaId:{type:"string"},candidateMediaIds:{type:"array",items:{type:"string"}},errorCode:{type:"string"},errorMessage:{type:"string"},
        startedAt:{type:"string",format:"date-time"},completedAt:{type:"string",format:"date-time"},createdAt:{type:"string",format:"date-time"},updatedAt:{type:"string",format:"date-time"},
      },
    },
    AdminProductMediaView: {
      type:"object", required:["productId","brandMode","resolvedBrandMode","approvedGallery","reviewCandidates","generationJobs"], additionalProperties:false,
      properties:{
        productId:{type:"string"},brandMode:{type:"string",enum:["auto","unbranded","branded"]},resolvedBrandMode:{type:"string",enum:["unbranded","branded"]},
        featuredMedia:ref("ProductMediaView"),approvedGallery:{type:"array",items:ref("ProductMediaView")},reviewCandidates:{type:"array",items:ref("ProductMediaView")},generationJobs:{type:"array",items:ref("ImageGenerationJobView")},
      },
    },
  });
  for (const name of [
    "FulfilmentQueueResponse", "FulfilmentDetailResponse", "FulfilmentActionResponse",
    "ProductDraftResponse", "ProductMediaView", "AdminProductMediaView",
  ])
    schemas[name + "Envelope"] = {
      type: "object",
      required: ["ok", "data"],
      additionalProperties: false,
      properties: { ok: { type: "boolean", enum: [true] }, data: ref(name) },
    };

  doc.info.description =
    "Implemented production subset: identity, catalogue, Product Media upload/review preparation, inventory receiving, delivery configuration, authoritative checkout/orders, provider-neutral Payments Authority, provider-neutral Refunds Authority, and administrator Fulfilment + Stock Handover Authority. AI generation execution, courier dispatch, COD collection/remittance, physical returns, POS cash authority and public storefront cutover remain closed.";

  const productId: ParameterObject = { name: "productId", in: "path", required: true, schema: { type: "string", minLength: 1 } };
  const mediaId: ParameterObject = { name: "mediaId", in: "path", required: true, schema: { type: "string", minLength: 1 } };
  const mediaErrors = { "400": errorResponse, "401": errorResponse, "403": errorResponse, "404": errorResponse, "409": errorResponse, "413": errorResponse, "500": errorResponse, "503": errorResponse };

  doc.paths["/api/v1/admin/catalog/products"] = {
    post: {
      security,
      description: "Administrator-only creation of an unpublished catalogue product draft. Publication, pricing and stock are not implied by this command.",
      parameters: [csrf],
      requestBody: { required: true, content: { "application/json": { schema: ref("CreateProductDraftRequest") } } },
      responses: { "201": response("ProductDraftResponseEnvelope"), ...mediaErrors },
    },
  };
  doc.paths["/api/v1/admin/catalog/products/{productId}/media"] = {
    get: {
      security,
      description: "Authorized catalogue staff view one product's featured media, approved gallery, private review candidates and recent generation jobs.",
      parameters: [productId],
      responses: { "200": response("AdminProductMediaViewEnvelope"), ...mediaErrors },
    },
  };
  doc.paths["/api/v1/admin/catalog/products/{productId}/media/uploads"] = {
    post: {
      security,
      description: "Authorized catalogue staff upload a JPEG, PNG or WebP candidate. The server decodes and normalizes bytes into private storage; upload never publishes storefront media.",
      parameters: [productId, csrf],
      requestBody: {
        required: true,
        content: { "multipart/form-data": { schema: { type:"object", required:["file"], properties:{ file:{type:"string",format:"binary"}, altText:{type:"string",maxLength:1000} } } } },
      },
      responses: { "201": response("ProductMediaViewEnvelope"), ...mediaErrors },
    },
  };
  doc.paths["/api/v1/admin/catalog/media/{mediaId}/content"] = {
    get: {
      security,
      description: "Authenticated preview of Variety-controlled product media bytes, including private review candidates. This route is never a public storefront hotlink.",
      parameters: [mediaId],
      responses: {
        "200": { description:"Image bytes", content:{ "image/webp":{ schema:{type:"string",format:"binary"} }, "image/jpeg":{ schema:{type:"string",format:"binary"} }, "image/png":{ schema:{type:"string",format:"binary"} } } },
        ...mediaErrors,
      },
    },
  };

  const mediaAction = (
    description: string,
    responseSchema: "ProductMediaViewEnvelope" | "AdminProductMediaViewEnvelope",
    parameters: ParameterObject[],
    requestSchema?: string,
    requestRequired = true,
  ): OperationObject => ({
    security,
    description,
    parameters: [...parameters, csrf],
    ...(requestSchema ? {
      requestBody: {
        required: requestRequired,
        content: { "application/json": { schema: ref(requestSchema) } },
      },
    } : {}),
    responses: { "200": response(responseSchema), ...mediaErrors },
  });

  doc.paths["/api/v1/admin/catalog/media/{mediaId}/approve"] = {
    post: mediaAction(
      "Administrator-only approval. Promotes one private review candidate into immutable public Variety-controlled storage; it does not publish the product itself.",
      "ProductMediaViewEnvelope",
      [mediaId],
    ),
  };
  doc.paths["/api/v1/admin/catalog/media/{mediaId}/reject"] = {
    post: mediaAction(
      "Administrator-only rejection of a draft/review candidate. Rejected media is never storefront-visible.",
      "ProductMediaViewEnvelope",
      [mediaId],
    ),
  };
  doc.paths["/api/v1/admin/catalog/media/{mediaId}/archive"] = {
    post: mediaAction(
      "Administrator-only archival. Archiving the current featured media requires an approved same-product replacement or explicit null removal in the same transaction.",
      "ProductMediaViewEnvelope",
      [mediaId],
      "ArchiveProductMediaRequest",
      false,
    ),
  };
  doc.paths["/api/v1/admin/catalog/products/{productId}/media/featured"] = {
    post: mediaAction(
      "Administrator-only featured-image change. The target must be approved, active and owned by the product; null explicitly removes the featured image.",
      "AdminProductMediaViewEnvelope",
      [productId],
      "SetFeaturedMediaRequest",
    ),
  };
  doc.paths["/api/v1/admin/catalog/products/{productId}/media/reorder"] = {
    post: mediaAction(
      "Administrator-only gallery ordering. IDs must be unique approved active media owned by the product; omitted approved media is removed from the ordered gallery.",
      "AdminProductMediaViewEnvelope",
      [productId],
      "ReorderGalleryRequest",
    ),
  };
  doc.paths["/api/v1/admin/catalog/products/{productId}/media/brand-mode"] = {
    post: mediaAction(
      "Administrator-only audited override of branded/unbranded product classification used by future image-generation truth rules.",
      "AdminProductMediaViewEnvelope",
      [productId],
      "SetProductBrandModeRequest",
    ),
  };

  doc.paths["/api/v1/admin/fulfilment"] = {
    get: {
      security,
      description: "Administrator-only bounded fulfilment queue with operational blockers and server-derived next actions.",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000000, default: 1 } },
        { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        { name: "status", in: "query", schema: { type: "string", enum: ["awaiting_confirmation", "confirmed", "picking", "packed", "dispatched", "delivered", "ready_for_collection", "collected", "cancelled"] } },
      ],
      responses: { "200": response("FulfilmentQueueResponseEnvelope"), "400": errorResponse, "401": errorResponse, "403": errorResponse, "500": errorResponse, "503": errorResponse },
    },
  };
  doc.paths["/api/v1/admin/fulfilment/orders/{orderId}"] = {
    get: {
      security,
      description: "Administrator-only fulfilment detail with reservation-lot provenance, pick state, timeline, blockers and safe next actions.",
      parameters: [orderId],
      responses: { "200": response("FulfilmentDetailResponseEnvelope"), "401": errorResponse, "403": errorResponse, "404": errorResponse, "500": errorResponse, "503": errorResponse },
    },
  };
  doc.paths["/api/v1/admin/fulfilment/orders/{orderId}/confirm"] = {
    post: mutation(
      "Administrator-only confirmation command. Creates the operational fulfilment run without consuming physical or reserved stock.",
      "FulfilmentConfirmRequest",
    ),
  };
  doc.paths["/api/v1/admin/fulfilment/orders/{orderId}/start-picking"] = {
    post: mutation(
      "Administrator-only start-picking command. Advances operational state without consuming stock.",
      "FulfilmentStartPickingRequest",
    ),
  };
  doc.paths["/api/v1/admin/fulfilment/orders/{orderId}/picks/{reservationId}"] = {
    put: mutation(
      "Administrator-only idempotent pick recording/correction against one Inventory-owned reservation and its immutable lot provenance. Picking never depletes stock.",
      "FulfilmentPickRequest",
      [{ name: "reservationId", in: "path", required: true, schema: { type: "string", minLength: 1 } }],
    ),
  };
  doc.paths["/api/v1/admin/fulfilment/orders/{orderId}/pack"] = {
    post: mutation(
      "Administrator-only pack command. Requires exact complete picks and preserves physical/reserved stock until handover.",
      "FulfilmentPackRequest",
    ),
  };
  doc.paths["/api/v1/admin/fulfilment/orders/{orderId}/handover"] = {
    post: mutation(
      "Administrator-only irreversible handover boundary. Inventory consumes the order reservation and physical lot stock exactly once, atomically recording depletion provenance. Delivery COD authorization is policy-only here; cash collection and remittance remain outside this authority.",
      "FulfilmentHandoverRequest",
    ),
  };

  return doc;
}
