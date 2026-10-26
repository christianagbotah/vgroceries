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
  dispatchActionResponseSchema,
  dispatchAssignRequestSchema,
  dispatchJobDetailResponseSchema,
  dispatchProviderTransitionRequestSchema,
  dispatchQueueResponseSchema,
  dispatchReassignRequestSchema,
  dispatchRescheduleRequestSchema,
  dispatchReturnRequestSchema,
  dispatchReturnedRequestSchema,
  dispatchRiderDetailResponseSchema,
  dispatchRiderFleetResponseSchema,
  dispatchUnassignRequestSchema,
  fulfilmentActionResponseSchema,
  fulfilmentConfirmRequestSchema,
  fulfilmentDetailResponseSchema,
  fulfilmentHandoverRequestSchema,
  fulfilmentPackRequestSchema,
  fulfilmentPickRequestSchema,
  fulfilmentQueueResponseSchema,
  fulfilmentStartPickingRequestSchema,
  riderAcceptRequestSchema,
  riderActionResponseSchema,
  riderAvailabilityRequestSchema,
  riderAvailabilityResponseSchema,
  riderDeliverRequestSchema,
  riderFailRequestSchema,
  riderJobResponseSchema,
  riderJobsResponseSchema,
  riderNoteRequestSchema,
  riderOutRequestSchema,
  riderPickupRequestSchema,
  riderSelfResponseSchema,
  createGenerationRequestSchema,
  createProductDraftRequestSchema,
  reorderGalleryRequestSchema,
  setFeaturedMediaRequestSchema,
  setProductBrandModeRequestSchema,
  createLogisticsNodeRequestSchema,
  updateLogisticsNodeRequestSchema,
  logisticsNodeViewSchema,
  createLogisticsLaneRequestSchema,
  updateLogisticsLaneRequestSchema,
  logisticsLaneViewSchema,
  createDeliveryWorkflowRequestSchema,
  saveDeliveryWorkflowDraftRequestSchema,
  publishDeliveryWorkflowRequestSchema,
  deliveryWorkflowViewSchema,
  deliveryWorkflowVersionViewSchema,
  createDeliveryRouteRuleRequestSchema,
  updateDeliveryRouteRuleRequestSchema,
  activateDeliveryRouteRuleRequestSchema,
  deliveryRouteRuleViewSchema,
  routeSimulationRequestSchema,
  routeSimulationResponseSchema,
  cmsHomepageContentSchema,
  cmsHomepageDraftSchema,
  cmsHomepageAdminViewSchema,
  cmsContentPageViewSchema,
  cmsContentPageDraftRequestSchema,
  cmsContentPageAdminViewSchema,
  cmsOverviewViewSchema,
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
  description: "Durable actor-scoped replay key for this mutation.",
  schema: { type: "string", minLength: 8, maxLength: 128 },
};
const csrf: ParameterObject = {
  name: "X-CSRF-Token",
  in: "header",
  required: false,
  description: "Required for web-cookie mutation flows alongside a trusted Origin.",
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

function authorityResponses(schemaName: string) {
  return {
    "200": response(schemaName),
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
  };
}

function authorityMutation(
  description: string,
  requestSchema: string,
  responseSchema: string,
  pathParameters: ParameterObject[] = [],
): OperationObject {
  return {
    security,
    description,
    parameters: [...pathParameters, replay, csrf],
    requestBody: { required: true, content: { "application/json": { schema: ref(requestSchema) } } },
    responses: authorityResponses(responseSchema),
  };
}

function readOperation(
  description: string,
  responseSchema: string,
  parameters: ParameterObject[] = [],
): OperationObject {
  return {
    security,
    description,
    parameters,
    responses: {
      "200": response(responseSchema),
      "400": errorResponse,
      "401": errorResponse,
      "403": errorResponse,
      "404": errorResponse,
      "500": errorResponse,
      "503": errorResponse,
    },
  };
}

function refinedAssignmentSchema(schema: z.ZodType): SchemaObject {
  const generated = json(schema) as SchemaObject & { properties?: Record<string, SchemaObject> };
  const properties = generated.properties ?? {};
  return { oneOf: [
    { type: "object", additionalProperties: false, required: ["riderProfileId"], properties: { riderProfileId: properties.riderProfileId, note: properties.note } },
    { type: "object", additionalProperties: false, required: ["manualProvider"], properties: { manualProvider: properties.manualProvider, note: properties.note } },
  ] };
}

const nonOtherFailureReasons = ["customer_unavailable", "customer_refused", "address_problem", "unable_to_contact", "access_or_safety_issue", "vehicle_or_operational_issue"];
function providerTransitionOpenApiSchema(): SchemaObject {
  const generated = json(dispatchProviderTransitionRequestSchema) as SchemaObject & { properties?: Record<string, SchemaObject> };
  const properties = generated.properties ?? {};
  const action = (value: string): SchemaObject => ({ type: "string", enum: [value] });
  return { oneOf: [
    { type: "object", additionalProperties: false, required: ["action"], properties: { action: action("picked_up"), note: properties.note } },
    { type: "object", additionalProperties: false, required: ["action"], properties: { action: action("out_for_delivery"), note: properties.note } },
    { type: "object", additionalProperties: false, required: ["action", "proof"], properties: { action: action("delivered"), proof: properties.proof, note: properties.note } },
    { type: "object", additionalProperties: false, required: ["action", "failureReason"], properties: { action: action("failed"), failureReason: { type: "string", enum: nonOtherFailureReasons }, note: properties.note } },
    { type: "object", additionalProperties: false, required: ["action", "failureReason", "note"], properties: { action: action("failed"), failureReason: { type: "string", enum: ["other"] }, note: properties.note } },
  ] };
}

function riderFailOpenApiSchema(): SchemaObject {
  const generated = json(riderFailRequestSchema) as SchemaObject & { properties?: Record<string, SchemaObject> };
  const properties = generated.properties ?? {};
  return { oneOf: [
    { type: "object", additionalProperties: false, required: ["reason"], properties: { reason: { type: "string", enum: nonOtherFailureReasons }, note: properties.note } },
    { type: "object", additionalProperties: false, required: ["reason", "note"], properties: { reason: { type: "string", enum: ["other"] }, note: properties.note } },
  ] };
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
    DispatchAssignRequest: refinedAssignmentSchema(dispatchAssignRequestSchema),
    DispatchUnassignRequest: json(dispatchUnassignRequestSchema),
    DispatchReassignRequest: refinedAssignmentSchema(dispatchReassignRequestSchema),
    DispatchRescheduleRequest: json(dispatchRescheduleRequestSchema),
    DispatchReturnRequest: json(dispatchReturnRequestSchema),
    DispatchReturnedRequest: json(dispatchReturnedRequestSchema),
    DispatchProviderTransitionRequest: providerTransitionOpenApiSchema(),
    DispatchQueueResponse: json(dispatchQueueResponseSchema),
    DispatchJobDetailResponse: json(dispatchJobDetailResponseSchema),
    DispatchRiderFleetResponse: json(dispatchRiderFleetResponseSchema),
    DispatchRiderDetailResponse: json(dispatchRiderDetailResponseSchema),
    DispatchActionResponse: json(dispatchActionResponseSchema),
    RiderAvailabilityRequest: json(riderAvailabilityRequestSchema),
    RiderAvailabilityResponse: json(riderAvailabilityResponseSchema),
    RiderAcceptRequest: json(riderAcceptRequestSchema),
    RiderPickupRequest: json(riderPickupRequestSchema),
    RiderOutRequest: json(riderOutRequestSchema),
    RiderDeliverRequest: json(riderDeliverRequestSchema),
    RiderFailRequest: riderFailOpenApiSchema(),
    RiderNoteRequest: json(riderNoteRequestSchema),
    RiderSelfResponse: json(riderSelfResponseSchema),
    RiderJobResponse: json(riderJobResponseSchema),
    RiderJobsResponse: json(riderJobsResponseSchema),
    RiderActionResponse: json(riderActionResponseSchema),
    CreateGenerationRequest: json(createGenerationRequestSchema),
    CreateProductDraftRequest: json(createProductDraftRequestSchema),
    SetFeaturedMediaRequest: json(setFeaturedMediaRequestSchema),
    ReorderGalleryRequest: json(reorderGalleryRequestSchema),
    SetProductBrandModeRequest: json(setProductBrandModeRequestSchema),
    CreateLogisticsNodeRequest: json(createLogisticsNodeRequestSchema),
    UpdateLogisticsNodeRequest: json(updateLogisticsNodeRequestSchema),
    LogisticsNodeView: json(logisticsNodeViewSchema),
    LogisticsNodeList: json(z.array(logisticsNodeViewSchema)),
    CreateLogisticsLaneRequest: json(createLogisticsLaneRequestSchema),
    UpdateLogisticsLaneRequest: json(updateLogisticsLaneRequestSchema),
    LogisticsLaneView: json(logisticsLaneViewSchema),
    LogisticsLaneList: json(z.array(logisticsLaneViewSchema)),
    CreateDeliveryWorkflowRequest: json(createDeliveryWorkflowRequestSchema),
    SaveDeliveryWorkflowDraftRequest: json(saveDeliveryWorkflowDraftRequestSchema),
    PublishDeliveryWorkflowRequest: json(publishDeliveryWorkflowRequestSchema),
    DeliveryWorkflowView: json(deliveryWorkflowViewSchema),
    DeliveryWorkflowVersionView: json(deliveryWorkflowVersionViewSchema),
    DeliveryWorkflowList: json(z.array(deliveryWorkflowViewSchema)),
    CreateDeliveryRouteRuleRequest: json(createDeliveryRouteRuleRequestSchema),
    UpdateDeliveryRouteRuleRequest: json(updateDeliveryRouteRuleRequestSchema),
    ActivateDeliveryRouteRuleRequest: json(activateDeliveryRouteRuleRequestSchema),
    DeliveryRouteRuleView: json(deliveryRouteRuleViewSchema),
    DeliveryRouteRuleList: json(z.array(deliveryRouteRuleViewSchema)),
    RouteSimulationRequest: json(routeSimulationRequestSchema),
    RouteSimulationResponse: json(routeSimulationResponseSchema),
    CmsHomepage: json(cmsHomepageContentSchema),
    CmsHomepageDraft: json(cmsHomepageDraftSchema),
    CmsHomepageAdminView: json(cmsHomepageAdminViewSchema),
    CmsContentPage: json(cmsContentPageViewSchema),
    CmsContentPageDraftRequest: json(cmsContentPageDraftRequestSchema),
    CmsContentPageAdminView: json(cmsContentPageAdminViewSchema),
    CmsOverviewView: json(cmsOverviewViewSchema),
    CmsEmptyRequest: json(z.strictObject({})),
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
    "DispatchQueueResponse", "DispatchJobDetailResponse", "DispatchRiderFleetResponse", "DispatchRiderDetailResponse", "DispatchActionResponse",
    "RiderAvailabilityResponse", "RiderSelfResponse", "RiderJobResponse", "RiderJobsResponse", "RiderActionResponse",
    "ProductDraftResponse", "ProductMediaView", "ImageGenerationJobView", "AdminProductMediaView",
    "LogisticsNodeView", "LogisticsNodeList", "LogisticsLaneView", "LogisticsLaneList",
    "DeliveryWorkflowView", "DeliveryWorkflowVersionView", "DeliveryWorkflowList",
    "DeliveryRouteRuleView", "DeliveryRouteRuleList", "RouteSimulationResponse",
    "CmsHomepage", "CmsHomepageAdminView", "CmsContentPage", "CmsContentPageAdminView", "CmsOverviewView",
  ])
    schemas[name + "Envelope"] = {
      type: "object",
      required: ["ok", "data"],
      additionalProperties: false,
      properties: { ok: { type: "boolean", enum: [true] }, data: ref(name) },
    };

  doc.info.description =
    "Implemented production subset: identity, catalogue, Product Media upload/review plus queued image-generation authority, inventory receiving, delivery configuration, authoritative checkout/orders, provider-neutral Payments Authority, provider-neutral Refunds Authority, Fulfilment + Stock Handover Authority, Dispatch + Rider Authority, Logistics L1 network/workflow/route configuration authority, and PostgreSQL-backed Storefront CMS draft/publish authority. L1 configuration does not prove or record shipment movement, customer tracking milestones, courier-provider connectivity or notification delivery. COD cash collection/remittance, physical returns/restocking, POS cash authority, live courier providers, GPS/ETA/route optimization, notifications and complete public storefront cutover remain closed.";

  const cmsSlug: ParameterObject = { name: "slug", in: "path", required: true, schema: { type: "string", enum: ["help", "returns-policy", "privacy", "terms"] } };
  const cmsMutation = (description: string, requestSchema: string, responseSchema: string, parameters: ParameterObject[] = []): OperationObject => ({
    security, description, parameters: [...parameters, csrf],
    requestBody: { required: true, content: { "application/json": { schema: ref(requestSchema) } } },
    responses: authorityResponses(responseSchema),
  });
  doc.paths["/api/v1/content/homepage"] = {
    get: { security: [], description: "Public read of the currently published storefront homepage content. Draft content is never exposed here.", responses: { "200": response("CmsHomepageEnvelope"), "500": errorResponse, "503": errorResponse } },
  };
  doc.paths["/api/v1/content/pages/{slug}"] = {
    get: { security: [], description: "Public read of one published structured support/policy page. Draft content is never exposed here.", parameters: [cmsSlug], responses: { "200": response("CmsContentPageEnvelope"), "404": errorResponse, "500": errorResponse, "503": errorResponse } },
  };
  doc.paths["/api/v1/admin/content"] = {
    get: readOperation("Administrator-only CMS overview of draft/publication status.", "CmsOverviewViewEnvelope"),
  };
  doc.paths["/api/v1/admin/content/homepage"] = {
    get: readOperation("Administrator-only homepage CMS record containing separate published and draft versions.", "CmsHomepageAdminViewEnvelope"),
  };
  doc.paths["/api/v1/admin/content/homepage/draft"] = {
    post: cmsMutation("Administrator-only audited homepage draft save. Actor identity comes from the authenticated session and this command does not publish.", "CmsHomepageDraft", "CmsHomepageAdminViewEnvelope"),
  };
  doc.paths["/api/v1/admin/content/homepage/publish"] = {
    post: cmsMutation("Administrator-only atomic homepage publish after server validation of the current draft.", "CmsEmptyRequest", "CmsHomepageAdminViewEnvelope"),
  };
  doc.paths["/api/v1/admin/content/pages/{slug}"] = {
    get: readOperation("Administrator-only structured page CMS record containing separate published and draft versions.", "CmsContentPageAdminViewEnvelope", [cmsSlug]),
  };
  doc.paths["/api/v1/admin/content/pages/{slug}/draft"] = {
    post: cmsMutation("Administrator-only audited structured page draft save. Incomplete drafts are allowed and remain private.", "CmsContentPageDraftRequest", "CmsContentPageAdminViewEnvelope", [cmsSlug]),
  };
  doc.paths["/api/v1/admin/content/pages/{slug}/publish"] = {
    post: cmsMutation("Administrator-only atomic structured page publish. Required title and section content are validated before promotion.", "CmsEmptyRequest", "CmsContentPageAdminViewEnvelope", [cmsSlug]),
  };

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
  const mediaReplay: ParameterObject = {
    name: "Idempotency-Key",
    in: "header",
    required: true,
    description: "Durable staff-scoped replay key for one product image-generation request.",
    schema: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9:_-]{8,128}$" },
  };
  const jobId: ParameterObject = { name: "jobId", in: "path", required: true, schema: { type: "string", minLength: 1 } };
  const riderProfileId: ParameterObject = { name: "riderProfileId", in: "path", required: true, schema: { type: "string", minLength: 1 } };
  doc.paths["/api/v1/admin/catalog/products/{productId}/media/generations"] = {
    post: {
      security,
      description: "Authorized catalogue staff queue an asynchronous product-image generation job. The server builds the final truth-bounded prompt, persists one durable job, and never publishes generated media automatically.",
      parameters: [productId, mediaReplay, csrf],
      requestBody: { required: true, content: { "application/json": { schema: ref("CreateGenerationRequest") } } },
      responses: { "201": response("ImageGenerationJobViewEnvelope"), ...mediaErrors },
    },
  };
  doc.paths["/api/v1/admin/catalog/media/generations/{jobId}"] = {
    get: {
      security,
      description: "Authorized catalogue staff poll durable image-generation status. Candidate media IDs appear only after candidate rows are persisted.",
      parameters: [jobId],
      responses: { "200": response("ImageGenerationJobViewEnvelope"), ...mediaErrors },
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

  const logisticsNodeId: ParameterObject = { name: "nodeId", in: "path", required: true, schema: { type: "string", minLength: 1 } };
  const logisticsLaneId: ParameterObject = { name: "laneId", in: "path", required: true, schema: { type: "string", minLength: 1 } };
  const logisticsTemplateId: ParameterObject = { name: "templateId", in: "path", required: true, schema: { type: "string", minLength: 1 } };
  const logisticsVersionId: ParameterObject = { name: "versionId", in: "path", required: true, schema: { type: "string", minLength: 1 } };
  const logisticsRuleId: ParameterObject = { name: "ruleId", in: "path", required: true, schema: { type: "string", minLength: 1 } };
  const logisticsMutation = (description: string, requestSchema: string, responseSchema: string, parameters: ParameterObject[] = []): OperationObject =>
    authorityMutation(description, requestSchema, responseSchema, parameters);
  const logisticsBodylessMutation = (description: string, responseSchema: string, parameters: ParameterObject[] = []): OperationObject => ({
    security,
    description,
    parameters: [...parameters, replay, csrf],
    responses: authorityResponses(responseSchema),
  });

  doc.paths["/api/v1/admin/logistics/nodes"] = {
    get: readOperation("Administrator-only Logistics L1 node configuration read. Configuration does not prove shipment movement or physical custody.", "LogisticsNodeListEnvelope"),
    post: logisticsMutation("Administrator-only Logistics L1 node configuration creation. This does not move stock or prove shipment movement.", "CreateLogisticsNodeRequest", "LogisticsNodeViewEnvelope"),
  };
  doc.paths["/api/v1/admin/logistics/nodes/{nodeId}"] = {
    get: readOperation("Administrator-only Logistics L1 node configuration detail. Configuration is not shipment-location evidence.", "LogisticsNodeViewEnvelope", [logisticsNodeId]),
    post: logisticsMutation("Administrator-only Logistics L1 node configuration update. This does not move stock or record parcel arrival.", "UpdateLogisticsNodeRequest", "LogisticsNodeViewEnvelope", [logisticsNodeId]),
  };
  doc.paths["/api/v1/admin/logistics/lanes"] = {
    get: readOperation("Administrator-only Logistics L1 network-lane configuration read. A configured lane does not prove provider connectivity or a shipment transfer.", "LogisticsLaneListEnvelope"),
    post: logisticsMutation("Administrator-only Logistics L1 network-lane configuration creation. This does not move or hand over any shipment.", "CreateLogisticsLaneRequest", "LogisticsLaneViewEnvelope"),
  };
  doc.paths["/api/v1/admin/logistics/lanes/{laneId}"] = {
    get: readOperation("Administrator-only Logistics L1 network-lane configuration detail. Configuration does not prove route execution.", "LogisticsLaneViewEnvelope", [logisticsLaneId]),
    post: logisticsMutation("Administrator-only Logistics L1 network-lane configuration update. This does not record departure, arrival or provider evidence.", "UpdateLogisticsLaneRequest", "LogisticsLaneViewEnvelope", [logisticsLaneId]),
  };
  doc.paths["/api/v1/admin/logistics/workflows"] = {
    get: readOperation("Administrator-only Logistics L1 workflow configuration read. Workflow stages are presentation/configuration and do not prove runtime shipment events.", "DeliveryWorkflowListEnvelope"),
    post: logisticsMutation("Administrator-only Logistics L1 workflow-template creation with an initial draft. It does not record customer or shipment milestones.", "CreateDeliveryWorkflowRequest", "DeliveryWorkflowViewEnvelope"),
  };
  doc.paths["/api/v1/admin/logistics/workflows/{templateId}"] = {
    get: readOperation("Administrator-only Logistics L1 workflow configuration detail with immutable published history.", "DeliveryWorkflowViewEnvelope", [logisticsTemplateId]),
  };
  doc.paths["/api/v1/admin/logistics/workflows/{templateId}/drafts"] = {
    post: logisticsBodylessMutation("Administrator-only Logistics L1 draft clone of the current published workflow configuration. No shipment state is changed.", "DeliveryWorkflowVersionViewEnvelope", [logisticsTemplateId]),
  };
  doc.paths["/api/v1/admin/logistics/workflows/{templateId}/versions/{versionId}"] = {
    post: logisticsMutation("Administrator-only Logistics L1 draft workflow configuration save with optimistic revision protection. This does not prove runtime events.", "SaveDeliveryWorkflowDraftRequest", "DeliveryWorkflowVersionViewEnvelope", [logisticsTemplateId, logisticsVersionId]),
  };
  doc.paths["/api/v1/admin/logistics/workflows/{templateId}/publish"] = {
    post: logisticsMutation("Administrator-only Logistics L1 workflow publication. Publication makes configuration selectable; it does not move a shipment or notify a customer.", "PublishDeliveryWorkflowRequest", "DeliveryWorkflowViewEnvelope", [logisticsTemplateId]),
  };
  doc.paths["/api/v1/admin/logistics/route-rules"] = {
    get: readOperation("Administrator-only Logistics L1 route-rule configuration read. Rules are plans, not shipment movement evidence.", "DeliveryRouteRuleListEnvelope"),
    post: logisticsMutation("Administrator-only Logistics L1 inactive route-rule configuration creation. The server owns activation and selection authority.", "CreateDeliveryRouteRuleRequest", "DeliveryRouteRuleViewEnvelope"),
  };
  doc.paths["/api/v1/admin/logistics/route-rules/{ruleId}"] = {
    get: readOperation("Administrator-only Logistics L1 route-rule configuration detail.", "DeliveryRouteRuleViewEnvelope", [logisticsRuleId]),
    post: logisticsMutation("Administrator-only Logistics L1 inactive route-rule configuration update or explicit deactivation. It does not move shipments.", "UpdateDeliveryRouteRuleRequest", "DeliveryRouteRuleViewEnvelope", [logisticsRuleId]),
  };
  doc.paths["/api/v1/admin/logistics/route-rules/{ruleId}/activate"] = {
    post: logisticsMutation("Administrator-only Logistics L1 route-rule activation with dependency and ambiguity preflight. Activation does not prove route execution.", "ActivateDeliveryRouteRuleRequest", "DeliveryRouteRuleViewEnvelope", [logisticsRuleId]),
  };
  doc.paths["/api/v1/admin/logistics/route-rules/simulate"] = {
    post: {
      security,
      description: "Administrator-only Logistics L1 route configuration simulation. It is diagnostic only and does not move a shipment, persist selection, call a courier provider or prove runtime movement.",
      parameters: [csrf],
      requestBody: { required: true, content: { "application/json": { schema: ref("RouteSimulationRequest") } } },
      responses: authorityResponses("RouteSimulationResponseEnvelope"),
    },
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

  doc.paths["/api/v1/admin/dispatch"] = { get: readOperation("Administrator-only bounded dispatch queue after authoritative fulfilment handover. Assignment and delivery operations never deplete stock again.", "DispatchQueueResponseEnvelope", [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000000, default: 1 } },
    { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
    { name: "status", in: "query", schema: { type: "string", enum: ["unassigned", "assigned", "accepted", "picked_up", "out_for_delivery", "delivered", "failed", "rescheduled", "return_to_store"] } },
  ]) };
  doc.paths["/api/v1/admin/dispatch/jobs/{jobId}"] = { get: readOperation("Administrator-only delivery job detail with custody, proof metadata, timeline, blockers and server-derived actions.", "DispatchJobDetailResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/admin/dispatch/orders/{orderId}/assign"] = { post: authorityMutation("Administrator-only assignment after fulfilment handover. This operation does not change inventory or payment state.", "DispatchAssignRequest", "DispatchActionResponseEnvelope", [orderId]) };
  doc.paths["/api/v1/admin/dispatch/jobs/{jobId}/unassign"] = { post: authorityMutation("Administrator-only custody-safe pre-pickup unassignment.", "DispatchUnassignRequest", "DispatchActionResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/admin/dispatch/jobs/{jobId}/reassign"] = { post: authorityMutation("Administrator-only custody-safe rider or manual-provider reassignment.", "DispatchReassignRequest", "DispatchActionResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/admin/dispatch/jobs/{jobId}/reschedule"] = { post: authorityMutation("Administrator-only reschedule of a failed delivery without inventory reversal.", "DispatchRescheduleRequest", "DispatchActionResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/admin/dispatch/jobs/{jobId}/return-to-store"] = { post: authorityMutation("Administrator-only return-to-store instruction. Goods remain outside sellable inventory pending future Returns inspection.", "DispatchReturnRequest", "DispatchActionResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/admin/dispatch/jobs/{jobId}/returned-to-store"] = { post: authorityMutation("Administrator-only acknowledgement that goods physically returned to store. This does not restock inventory.", "DispatchReturnedRequest", "DispatchActionResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/admin/dispatch/jobs/{jobId}/provider-transition"] = { post: authorityMutation("Administrator-only manually evidenced courier-provider milestone. No live provider network call is made.", "DispatchProviderTransitionRequest", "DispatchActionResponseEnvelope", [jobId]) };

  doc.paths["/api/v1/admin/riders"] = { get: readOperation("Administrator-only rider fleet with declared availability and server-derived busy state.", "DispatchRiderFleetResponseEnvelope") };
  doc.paths["/api/v1/admin/riders/{riderProfileId}"] = { get: readOperation("Administrator-only rider operational profile detail.", "DispatchRiderDetailResponseEnvelope", [riderProfileId]) };
  doc.paths["/api/v1/admin/riders/{riderProfileId}/availability"] = { put: authorityMutation("Administrator-only rider declared availability change. Busy remains derived from active delivery ownership.", "RiderAvailabilityRequest", "RiderAvailabilityResponseEnvelope", [riderProfileId]) };

  doc.paths["/api/v1/rider/me"] = { get: readOperation("Rider-only authenticated self profile. Identity comes from the session, never a browser-supplied rider id.", "RiderSelfResponseEnvelope") };
  doc.paths["/api/v1/rider/me/availability"] = { put: authorityMutation("Rider-only declared availability change for the authenticated rider.", "RiderAvailabilityRequest", "RiderAvailabilityResponseEnvelope") };
  doc.paths["/api/v1/rider/jobs"] = { get: readOperation("Rider-only jobs for the authenticated rider. Use scope=history for completed/returned history without a separate identity-bearing route.", "RiderJobsResponseEnvelope", [
    { name: "scope", in: "query", schema: { type: "string", enum: ["active", "history"], default: "active" } },
  ]) };
  doc.paths["/api/v1/rider/jobs/{jobId}"] = { get: readOperation("Rider-only owned job detail; guessed foreign job identifiers are not disclosed.", "RiderJobResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/rider/jobs/{jobId}/accept"] = { post: authorityMutation("Rider-only acceptance of the authenticated rider's assigned job.", "RiderAcceptRequest", "RiderActionResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/rider/jobs/{jobId}/pickup"] = { post: authorityMutation("Rider-only physical pickup acknowledgement. Stock was already consumed at fulfilment handover and is not deducted here.", "RiderPickupRequest", "RiderActionResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/rider/jobs/{jobId}/out-for-delivery"] = { post: authorityMutation("Rider-only transition to out for delivery for the authenticated rider's job.", "RiderOutRequest", "RiderActionResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/rider/jobs/{jobId}/deliver"] = { post: authorityMutation("Rider-only delivery completion with server-allowed proof. COD payment state is not settled by this delivery action.", "RiderDeliverRequest", "RiderActionResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/rider/jobs/{jobId}/fail"] = { post: authorityMutation("Rider-only delivery failure with a bounded reason. Failure neither restores stock nor changes payment truth.", "RiderFailRequest", "RiderActionResponseEnvelope", [jobId]) };
  doc.paths["/api/v1/rider/jobs/{jobId}/notes"] = { post: authorityMutation("Rider-only idempotent operational note for the authenticated rider's job.", "RiderNoteRequest", "RiderActionResponseEnvelope", [jobId]) };

  return doc;
}
