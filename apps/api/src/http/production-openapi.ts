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
  notificationItemSchema, notificationListResponseSchema, notificationReadResponseSchema, notificationReadAllResponseSchema,
  checkoutPickupOptionsResponseSchema, checkoutCompleteRestRequestSchema,
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
  planShipmentRequestSchema,
  shipmentDepartRequestSchema,
  shipmentArriveRequestSchema,
  shipmentRerouteRequestSchema,
  shipmentCheckpointRequestSchema,
  pickupCollectRequestSchema, pickupCollectResponseSchema,
  pickupAppointmentPolicyInputSchema, pickupAppointmentPolicyViewSchema,
  pickupAppointmentOptionsSchema, bookPickupAppointmentRequestSchema,
  cancelPickupAppointmentRequestSchema, pickupAppointmentMutationResponseSchema,
  pickupCentreClosureInputSchema,pickupCentreClosureViewSchema,pickupCentreClosureListSchema,
  physicalReturnReceiveSchema,physicalReturnInspectSchema,
  physicalReturnViewSchema,physicalReturnListSchema,
  physicalReturnQuarantineRequestSchema,physicalReturnCustodyViewSchema,
  physicalReturnResaleProposeSchema,physicalReturnResaleDecisionSchema,physicalReturnResaleReviewViewSchema,
  customerReturnClaimRequestSchema,customerReturnClaimCancelSchema,
  customerReturnClaimDecisionSchema,customerReturnClaimViewSchema,
  customerReturnClaimsListSchema,customerReturnClaimEligibilitySchema,
  cashierTillOpenSchema,cashierTillMoveSchema,cashierTillCloseSchema,
  cashierTillSessionViewSchema,cashierTillListSchema,
  posTillReconciliationViewSchema,
  posQuoteRequestSchema,posQuoteViewSchema,
  posHoldCreateSchema,posHoldReleaseSchema,posHoldViewSchema,posHoldListSchema,
  posCashSaleCompleteSchema,posCashSaleViewSchema,posCashSaleListSchema,
  shipmentStatusSchema,
  shipmentListItemSchema,
  shipmentDetailViewSchema,
  shipmentActionResponseSchema,
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
    CheckoutPickupOptionsResponse: json(checkoutPickupOptionsResponseSchema),
    CheckoutCompleteRestRequest: json(checkoutCompleteRestRequestSchema),
    NotificationItem: json(notificationItemSchema),
    NotificationListResponse: json(notificationListResponseSchema),
    NotificationReadResponse: json(notificationReadResponseSchema),
    NotificationReadAllResponse: json(notificationReadAllResponseSchema),
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
    PlanShipmentRequest: json(planShipmentRequestSchema),
    ShipmentDepartRequest: json(shipmentDepartRequestSchema),
    ShipmentArriveRequest: json(shipmentArriveRequestSchema),
    ShipmentRerouteRequest: json(shipmentRerouteRequestSchema),
    ShipmentCheckpointRequest: json(shipmentCheckpointRequestSchema),
    PickupCollectRequest: json(pickupCollectRequestSchema),
    PickupCollectResponse: json(pickupCollectResponseSchema),
    PickupAppointmentPolicyInput: json(pickupAppointmentPolicyInputSchema),
    PickupAppointmentPolicyView: json(pickupAppointmentPolicyViewSchema),
    PickupAppointmentOptions: json(pickupAppointmentOptionsSchema),
    BookPickupAppointmentRequest: json(bookPickupAppointmentRequestSchema),
    CancelPickupAppointmentRequest: json(cancelPickupAppointmentRequestSchema),
    PickupAppointmentMutationResponse: json(pickupAppointmentMutationResponseSchema),
    PickupCentreClosureInput: json(pickupCentreClosureInputSchema),
    PickupCentreClosureView: json(pickupCentreClosureViewSchema),
    PickupCentreClosureList: json(pickupCentreClosureListSchema),
    PhysicalReturnReceive: json(physicalReturnReceiveSchema),
    PhysicalReturnInspect: json(physicalReturnInspectSchema),
    PhysicalReturnView: json(physicalReturnViewSchema),
    PhysicalReturnList: json(physicalReturnListSchema),
    PhysicalReturnQuarantineRequest: json(physicalReturnQuarantineRequestSchema),
    PhysicalReturnCustodyView: json(physicalReturnCustodyViewSchema),
    PhysicalReturnResalePropose:json(physicalReturnResaleProposeSchema),
    PhysicalReturnResaleDecision:json(physicalReturnResaleDecisionSchema),
    PhysicalReturnResaleReviewView:json(physicalReturnResaleReviewViewSchema),
    CustomerReturnClaimRequest:json(customerReturnClaimRequestSchema),
    CustomerReturnClaimCancel:json(customerReturnClaimCancelSchema),
    CustomerReturnClaimDecision:json(customerReturnClaimDecisionSchema),
    CustomerReturnClaimView:json(customerReturnClaimViewSchema),
    CustomerReturnClaimsList:json(customerReturnClaimsListSchema),
    CustomerReturnClaimEligibility:json(customerReturnClaimEligibilitySchema),
    CashierTillOpen:json(cashierTillOpenSchema),
    CashierTillMove:json(cashierTillMoveSchema),
    CashierTillClose:json(cashierTillCloseSchema),
    CashierTillSessionView:json(cashierTillSessionViewSchema),
    CashierTillList:json(cashierTillListSchema),
    PosTillReconciliationView:json(posTillReconciliationViewSchema),
    PosQuoteRequest:json(posQuoteRequestSchema),
    PosQuoteView:json(posQuoteViewSchema),
    PosHoldCreate:json(posHoldCreateSchema),
    PosHoldRelease:json(posHoldReleaseSchema),
    PosHoldView:json(posHoldViewSchema),
    PosHoldList:json(posHoldListSchema),
    PosCashSaleComplete:json(posCashSaleCompleteSchema),
    PosCashSaleView:json(posCashSaleViewSchema),
    PosCashSaleList:json(posCashSaleListSchema),
    ShipmentListResponse: json(z.object({ items: z.array(shipmentListItemSchema), page: z.number().int().positive(), perPage: z.number().int().positive().max(100), total: z.number().int().nonnegative() }).strict()),
    ShipmentDetailView: json(shipmentDetailViewSchema),
    ShipmentActionResponse: json(shipmentActionResponseSchema),
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
    "NotificationListResponse", "NotificationReadResponse", "NotificationReadAllResponse",
    "CheckoutPickupOptionsResponse",
    "ProductDraftResponse", "ProductMediaView", "ImageGenerationJobView", "AdminProductMediaView",
    "LogisticsNodeView", "LogisticsNodeList", "LogisticsLaneView", "LogisticsLaneList",
    "DeliveryWorkflowView", "DeliveryWorkflowVersionView", "DeliveryWorkflowList",
    "DeliveryRouteRuleView", "DeliveryRouteRuleList", "RouteSimulationResponse",
    "ShipmentListResponse", "ShipmentDetailView", "ShipmentActionResponse",
    "PickupCollectResponse",
    "PickupAppointmentPolicyView", "PickupAppointmentOptions", "PickupAppointmentMutationResponse",
    "PickupCentreClosureView","PickupCentreClosureList",
    "PhysicalReturnView","PhysicalReturnList",
    "PhysicalReturnCustodyView",
    "PhysicalReturnResaleReviewView",
    "CustomerReturnClaimView","CustomerReturnClaimsList",
    "CustomerReturnClaimEligibility",
    "CashierTillSessionView","CashierTillList","PosTillReconciliationView","PosQuoteView",
    "PosHoldView","PosHoldList","PosCashSaleView","PosCashSaleList",
    "CmsHomepage", "CmsHomepageAdminView", "CmsContentPage", "CmsContentPageAdminView", "CmsOverviewView",
  ])
    schemas[name + "Envelope"] = {
      type: "object",
      required: ["ok", "data"],
      additionalProperties: false,
      properties: { ok: { type: "boolean", enum: [true] }, data: ref(name) },
    };

  doc.info.description =
    "Implemented production subset: identity, catalogue, Product Media upload/review plus queued image-generation authority, inventory receiving, delivery configuration, authoritative checkout/orders, provider-neutral Payments Authority, provider-neutral Refunds Authority, Fulfilment + Stock Handover Authority, Dispatch + Rider Authority, Logistics L1 network/workflow/route configuration plus L2 Shipment Execution authority, and PostgreSQL-backed Storefront CMS draft/publish authority. L2 records server-owned shipment planning and movement evidence. L3 adds a read-only customer-safe route journey to the existing secured PublicOrder response; courier-provider connectivity and notification delivery remain closed. COD cash collection/remittance, physical returns/restocking, POS cash authority, live courier providers, GPS/ETA/route optimization, external email/SMS/WhatsApp notification delivery and complete public storefront cutover remain closed. Customer-only in-app inbox authority is phase 1 of L4.";

  const cmsSlug: ParameterObject = { name: "slug", in: "path", required: true, schema: { type: "string", enum: ["help", "returns-policy", "privacy", "terms"] } };
  const cmsMutation = (description: string, requestSchema: string, responseSchema: string, parameters: ParameterObject[] = []): OperationObject => ({
    security, description, parameters: [...parameters, csrf],
    requestBody: { required: true, content: { "application/json": { schema: ref(requestSchema) } } },
    responses: authorityResponses(responseSchema),
  });
  // Only configured customer-visible nodes from active server-validated routes.
  // No remote pickup is exposed unless the dedicated customer pickup flag is enabled.
  doc.paths["/api/v1/checkout/zones/{zoneId}/pickup-points"] = {
    get: {
      security: [],
      description: "List safe pickup-centre options for this zone. Default-off remote pickup is independent of L2 shipment execution; disabled returns enabled=false and no options. This does not claim that customer collection authority is operational.",
      parameters: [
        { name: "zoneId", in: "path", required: true, schema: { type: "string", minLength: 1 } },
        { name: "locality", in: "query", required: false, schema: { type: "string", maxLength: 120 } },
      ],
      responses: {
        "200": response("CheckoutPickupOptionsResponseEnvelope"),
        "400": errorResponse, "404": errorResponse, "500": errorResponse,
      },
    },
  };
  const guestAppointmentSecurity: SecurityRequirementObject[] = [
    { cookieAuth: [] }, { bearerAuth: [] }, { guestAuth: [] },
  ];
  const appointmentRead = (description: string): OperationObject => ({
    security: guestAppointmentSecurity, description, parameters: [orderId],
    responses: authorityResponses("PickupAppointmentOptionsEnvelope"),
  });
  const appointmentWrite = (description: string, requestName: string): OperationObject => ({
    security: guestAppointmentSecurity, description,
    parameters: [orderId, replay, csrf],
    requestBody: { required: true, content: {
      "application/json": { schema: ref(requestName) },
    } },
    responses: authorityResponses("PickupAppointmentMutationResponseEnvelope"),
  });
  doc.paths["/api/v1/orders/{orderId}/pickup-appointments"] = {
    get: appointmentRead("Customer or guest-owned collection appointment options and booked status. No options before verified paid shipment arrival; all times Africa/Accra. No public order enumeration."),
    post: appointmentWrite("Customer/guest-owned, idempotent collection appointment booking or rescheduling within active centre hours and capacity. Never changes payment, transport slots or stock.", "BookPickupAppointmentRequest"),
  };
  doc.paths["/api/v1/orders/{orderId}/pickup-appointments/cancel"] = {
    post: appointmentWrite("Customer/guest-owned, idempotent cancellation of a booked collection appointment. This does not cancel the paid order or shipment.", "CancelPickupAppointmentRequest"),
  };

  // Explicitly document the new input; the header remains authoritative for replay.
  const checkoutComplete = doc.paths["/api/v1/checkout/complete"]?.post;
  if (checkoutComplete) {
    checkoutComplete.requestBody = { required: true, content: {
      "application/json": { schema: ref("CheckoutCompleteRestRequest") },
    } };
  }
  doc.paths["/api/v1/account/notifications"] = {
    get: readOperation("Customer-owned in-app inbox, projected only from committed order events. No email/SMS/WhatsApp delivery is implied.", "NotificationListResponseEnvelope", [
      { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
      { name: "cursor", in: "query", schema: { type: "string", maxLength: 512 } },
    ]),
  };
  doc.paths["/api/v1/account/notifications/read-all"] = {
    post: { security, description: "Mark the authenticated customer's existing inbox as read. Web sessions require trusted Origin and CSRF.",
      parameters: [csrf], responses: authorityResponses("NotificationReadAllResponseEnvelope") },
  };
  doc.paths["/api/v1/account/notifications/{notificationId}/read"] = {
    post: { security, description: "Idempotent customer-owned notification read; web mutations require trusted Origin and CSRF.", parameters: [
      { name: "notificationId", in: "path", required: true, schema: { type: "string", minLength: 1 } }, csrf,
    ], responses: authorityResponses("NotificationReadResponseEnvelope") },
  };
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
  const shipmentId: ParameterObject = { name: "shipmentId", in: "path", required: true, schema: { type: "string", minLength: 1 } };
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
  doc.paths["/api/v1/admin/logistics/nodes/{nodeId}/pickup-appointment-policy"] = {
    get: readOperation("Administrator-only centre collection appointment operating hours, service days, capacity, lead time and booking horizon. Configuration does not activate shipment execution.", "PickupAppointmentPolicyViewEnvelope", [logisticsNodeId]),
    post: logisticsMutation("Administrator-only audited centre appointment policy update. A disabled policy stops new bookings without modifying existing bookings. Does not override remote-pickup release flags.", "PickupAppointmentPolicyInput", "PickupAppointmentPolicyViewEnvelope", [logisticsNodeId]),
  };
  doc.paths["/api/v1/admin/logistics/nodes/{nodeId}/pickup-closures"] = {
    get: readOperation("Administrator-only local-calendar pickup centre closures. Closed days never alter booked appointments or delivery transport windows.", "PickupCentreClosureListEnvelope", [logisticsNodeId]),
    post: logisticsMutation("Administrator-only, replay-safe centre closure and reopening. Closing a date fails if customer appointments are already booked. No silent cancellation, inventory or payment changes.", "PickupCentreClosureInput", "PickupCentreClosureViewEnvelope", [logisticsNodeId]),
  };
  // Physical Returns R1: physical possession and inspection evidence only.
  // Nothing here creates a refund, restores stock, or marks COD as collected.
  const physicalReturnId:ParameterObject={
    name:"returnId",in:"path",required:true,
    schema:{type:"string",minLength:1},
  };
  const physicalReturnMutation=(description:string,input:string,output:string,parameters:ParameterObject[]=[]):OperationObject=>({
    security,description,parameters:[...parameters,replay,csrf],
    requestBody:{required:true,content:{"application/json":{schema:ref(input)}}},
    responses:authorityResponses(output),
  });
  // R3a: authenticated customer request history and final staff decisions.
  // These operations do not create a refund, stock lot or physical receipt.
  const returnClaimId:ParameterObject={name:"claimId",in:"path",required:true,
    schema:{type:"string",minLength:1}};
  const returnClaimOrderId:ParameterObject={name:"orderId",in:"path",required:true,
    schema:{type:"string",minLength:1}};
  doc.paths["/api/v1/account/return-claims"]={
    get:readOperation("Authenticated customer-only return requests; no refund/payment or physical stock authority.",
      "CustomerReturnClaimsListEnvelope",[
        {name:"page",in:"query",schema:{type:"integer",minimum:1,default:1}},
        {name:"perPage",in:"query",schema:{type:"integer",minimum:1,maximum:50,default:20}},
      ]),
    post:physicalReturnMutation(
      "Customer-owned completed order and stock-depletion proof required; request quantity is capped against all pending/accepted claims and actual physical returns. No refund is created.",
      "CustomerReturnClaimRequest","CustomerReturnClaimViewEnvelope"),
  };
  doc.paths["/api/v1/account/return-claims/orders/{orderId}/eligibility"]={
    get:readOperation("Authenticated customer-only source-order line balances; completed delivery, depletion and prior requests determine eligible units. No refund quote.",
      "CustomerReturnClaimEligibilityEnvelope",[returnClaimOrderId]),
  };
  doc.paths["/api/v1/account/return-claims/{claimId}"]={
    get:readOperation("Return request detail exclusively for its authenticated customer owner.",
      "CustomerReturnClaimViewEnvelope",[returnClaimId]),
  };
  doc.paths["/api/v1/account/return-claims/{claimId}/cancel"]={
    post:physicalReturnMutation(
      "Customer-only cancellation while requested. Rejected/accepted requests are final; no inventory or refund mutation.",
      "CustomerReturnClaimCancel","CustomerReturnClaimViewEnvelope",[returnClaimId]),
  };
  doc.paths["/api/v1/admin/return-claims"]={
    get:readOperation("Administrator-only paginated customer claim queue; no unverified refund projections.",
      "CustomerReturnClaimsListEnvelope",[
        {name:"page",in:"query",schema:{type:"integer",minimum:1,default:1}},
        {name:"perPage",in:"query",schema:{type:"integer",minimum:1,maximum:50,default:20}},
      ]),
  };
  doc.paths["/api/v1/admin/return-claims/{claimId}/decision"]={
    post:physicalReturnMutation(
      "Admin-only final accept/reject of pending customer claim, with required note and replay-safe audit. Acceptance is NOT physical receipt or money/refund approval.",
      "CustomerReturnClaimDecision","CustomerReturnClaimViewEnvelope",[returnClaimId]),
  };
  // POS P0a: administrator-only cash-drawer session preparation. These
  // operations do not create sale/payment authority or decrement stock.
  const tillId:ParameterObject={name:"sessionId",in:"path",required:true,
    schema:{type:"string",minLength:1}};
  // P0b1 previews use online checkout's exact pricing and available-to-sell stock.
  // POST contains item lines but deliberately has no idempotency key: no mutation.
  doc.paths["/api/v1/admin/pos/quote"]={
    post:{
      security,
      description:"Admin-only quote for one open till at the shared commerce stock location. No order, reservation, cash movement, captured payment or handover. Availability is a non-binding snapshot.",
      parameters:[csrf],
      requestBody:{required:true,content:{"application/json":{schema:ref("PosQuoteRequest")}}},
      responses:authorityResponses("PosQuoteViewEnvelope"),
    },
  };
  // P0b2: temporary stock holds allocated through the same lot engine
  // as storefront checkout; they cannot be paid, handed over or invoiced.
  const posHoldId:ParameterObject={
    name:"holdId",in:"path",required:true,schema:{type:"string",format:"uuid"},
  };
  // P0c1: physical cash only. Atomic stock handover and immutable
  // till cash evidence. Never represent this as electronic settlement.
  const posSaleId:ParameterObject={
    name:"saleId",in:"path",required:true,schema:{type:"string",format:"uuid"},
  };
  doc.paths["/api/v1/admin/pos/cash-sales"]={
    get:readOperation("Administrator-only completed physical CASH sales and immutable receipt facts.",
      "PosCashSaleListEnvelope"),
    post:physicalReturnMutation(
      "One-time, cash-counted sale and physical handover of a reserved POS cart. Requires cash count and handover attestation; no MoMo/card claim or tax invoice.",
      "PosCashSaleComplete","PosCashSaleViewEnvelope"),
  };
  doc.paths["/api/v1/admin/pos/cash-sales/{saleId}"]={
    get:readOperation("Administrator-only cash sale receipt facts, original server price snapshots and stock depletion reference.",
      "PosCashSaleViewEnvelope",[posSaleId]),
  };
  doc.paths["/api/v1/admin/pos/cash-sales/{saleId}/print"]={
    get:{
      security,
      description:"Administrator-only, no-store 80mm HTML cash receipt using immutable product labels as at sale completion. Internal cash confirmation only; NOT a tax invoice.",
      parameters:[posSaleId],
      responses:{
        "200":{
          description:"Escaped, print-ready HTML receipt without active scripts or external resources.",
          content:{"text/html":{schema:{type:"string"}}},
        },
        "401":errorResponse,
        "403":errorResponse,
        "404":errorResponse,
        "409":errorResponse,
        "503":errorResponse,
      },
    },
  };
  doc.paths["/api/v1/admin/pos/holds"]={
    get:readOperation("Administrator-only recent POS cart reservations. No payment or sale authority.",
      "PosHoldListEnvelope"),
    post:physicalReturnMutation(
      "Reserve up to five minutes of shared online/counter inventory in one open till. No order, tender, printed receipt, or physical handover.",
      "PosHoldCreate","PosHoldViewEnvelope"),
  };
  doc.paths["/api/v1/admin/pos/holds/{holdId}"]={
    get:readOperation("Administrator-only POS reservation status and exact immutable server-priced lines.",
      "PosHoldViewEnvelope",[posHoldId]),
  };
  doc.paths["/api/v1/admin/pos/holds/{holdId}/release"]={
    post:physicalReturnMutation(
      "Release a POS cart reservation, or record its expiry. No refund, cash or stock receipt.",
      "PosHoldRelease","PosHoldViewEnvelope",[posHoldId]),
  };
  doc.paths["/api/v1/admin/pos/tills"]={
    get:readOperation(
      "Administrator-only till records; preliminary drawer movements exclude POS sales and merchant settlements.",
      "CashierTillListEnvelope"),
    post:physicalReturnMutation(
      "Administrator-only idempotent till opening at an active location. Feature gate is default OFF; this does not confirm payment or reserve goods.",
      "CashierTillOpen","CashierTillSessionViewEnvelope"),
  };
  doc.paths["/api/v1/admin/pos/tills/{sessionId}"]={
    get:readOperation("Administrator-only immutable till detail, including cash movements but no sale totals.",
      "CashierTillSessionViewEnvelope",[tillId]),
  };
  doc.paths["/api/v1/admin/pos/tills/{sessionId}/reconciliation.csv"]={
    get:{
      security,
      description:"Administrator-only, no-store CSV export of the same read-only cash drawer reconciliation. Amounts are exact integer pesewas and dynamic text is spreadsheet-formula protected. Not verified electronic settlement, refunds, tax, or bank/GL data.",
      parameters:[tillId],
      responses:{
        "200":{
          description:"UTF-8 CSV, one metric/value per row and up to 20 recent cash-sale references; aggregates include all completed cash sales.",
          content:{"text/csv":{schema:{type:"string"}}},
        },
        "401":errorResponse,
        "403":errorResponse,
        "404":errorResponse,
        "409":errorResponse,
        "503":errorResponse,
      },
    },
  };
  doc.paths["/api/v1/admin/pos/tills/{sessionId}/reconciliation"]={
    get:readOperation("Administrator-only, read-only same-snapshot CASH drawer reconciliation: opening float, manual cash in/out/drops, completed counter cash sales, recent receipt references, active holds and any closing difference. Excludes electronic payments, refunds, tax and general ledger.",
      "PosTillReconciliationViewEnvelope",[tillId]),
  };
  doc.paths["/api/v1/admin/pos/tills/{sessionId}/movements"]={
    post:physicalReturnMutation("Administrator-only cash-in/out/drop recording with immutable evidence and replay safety; no POS payment truth.",
      "CashierTillMove","CashierTillSessionViewEnvelope",[tillId]),
  };
  doc.paths["/api/v1/admin/pos/tills/{sessionId}/close"]={
    post:physicalReturnMutation("Administrator-only preliminary drawer close using float and cash movements only; this explicitly excludes sales and is not full financial reconciliation.",
      "CashierTillClose","CashierTillSessionViewEnvelope",[tillId]),
  };
  doc.paths["/api/v1/admin/physical-returns"]={
    get:readOperation("Administrator-only physical return receipts with bounded pagination and optional source order filter; never a customer-facing refund promise.","PhysicalReturnListEnvelope",[
      {name:"orderId",in:"query",schema:{type:"string"}},
      {name:"page",in:"query",schema:{type:"integer",minimum:1,default:1}},
      {name:"perPage",in:"query",schema:{type:"integer",minimum:1,maximum:50,default:20}},
    ]),
    post:physicalReturnMutation("Administrator-only, exactly-once staff physical intake. Requires completed stock-depleted order and prevents over-return across receipts. No sellable inventory or money mutation.","PhysicalReturnReceive","PhysicalReturnViewEnvelope"),
  };
  doc.paths["/api/v1/admin/physical-returns/{returnId}"]={
    get:readOperation("Administrator-only immutable return receipt, original quantities and inspection outcomes. No stock claim implied.","PhysicalReturnViewEnvelope",[physicalReturnId]),
  };
  doc.paths["/api/v1/admin/physical-returns/items/{itemId}/quarantine"]={
    post:physicalReturnMutation(
      "Administrator-only, idempotent storage of inspected returned goods in quarantined inventory. Requires single original depleted lot; creates non-saleable lot, immutable custody and a balancing inventory receipt. No resale, automatic restock approval, refund, payout or customer financial claim.",
      "PhysicalReturnQuarantineRequest","PhysicalReturnCustodyViewEnvelope",
      [{name:"itemId",in:"path",required:true,schema:{type:"string",minLength:1}}],
    ),
  };
  doc.paths["/api/v1/admin/physical-returns/items/{itemId}/resale-review"]={
    post:physicalReturnMutation(
      "Admin-only non-food factory-sealed returned-goods safety proposal: audited, immutable evidence; original quarantine and saleable inventory remain unchanged. Requires an explicitly allowlisted variant, approved non-food category, verified intact seal and source expiry at least 30 days ahead.",
      "PhysicalReturnResalePropose","PhysicalReturnResaleReviewViewEnvelope",
      [{name:"itemId",in:"path",required:true,schema:{type:"string",minLength:1}}],
    ),
  };
  doc.paths["/api/v1/admin/physical-returns/items/{itemId}/resale-decision"]={
    post:physicalReturnMutation(
      "Independent second administrator must approve or reject a pending review. Approval atomically transfers all held quantity from immutable quarantine into a new, traceable regular lot; no refund, COD collection or external payment action.",
      "PhysicalReturnResaleDecision","PhysicalReturnResaleReviewViewEnvelope",
      [{name:"itemId",in:"path",required:true,schema:{type:"string",minLength:1}}],
    ),
  };
  doc.paths["/api/v1/admin/physical-returns/{returnId}/inspect"]={
    post:physicalReturnMutation("Administrator-only terminal inspection into quarantine or destroy. Receipt evidence is immutable; no automatic stock restoration or refund.","PhysicalReturnInspect","PhysicalReturnViewEnvelope",[physicalReturnId]),
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

  doc.paths["/api/v1/admin/logistics/shipments"] = {
    get: readOperation("Administrator-only bounded Logistics L2 shipment execution list. This is operational evidence, not customer tracking or financial authority.", "ShipmentListResponseEnvelope", [
      { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000000, default: 1 } },
      { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
      { name: "status", in: "query", schema: json(shipmentStatusSchema) },
    ]),
  };
  doc.paths["/api/v1/admin/logistics/shipments/{shipmentId}"] = {
    get: readOperation("Administrator-only Logistics L2 shipment detail with immutable route snapshots, movement events and server-derived actions.", "ShipmentDetailViewEnvelope", [shipmentId]),
  };
  doc.paths["/api/v1/admin/logistics/orders/{orderId}/plan"] = {
    post: logisticsMutation("Administrator-only Logistics L2 legacy-order planning. The server resolves and snapshots the route; clients cannot submit stops or lanes.", "PlanShipmentRequest", "ShipmentActionResponseEnvelope", [orderId]),
  };
  doc.paths["/api/v1/admin/logistics/shipments/{shipmentId}/depart"] = {
    post: logisticsMutation("Administrator-only Logistics L2 departure evidence for the exact server-selected ready leg. It does not mutate inventory or payment authority.", "ShipmentDepartRequest", "ShipmentActionResponseEnvelope", [shipmentId]),
  };
  doc.paths["/api/v1/admin/logistics/shipments/{shipmentId}/arrive"] = {
    post: logisticsMutation("Administrator-only Logistics L2 arrival evidence for the exact active leg and destination stop.", "ShipmentArriveRequest", "ShipmentActionResponseEnvelope", [shipmentId]),
  };
  doc.paths["/api/v1/admin/logistics/shipments/{shipmentId}/reroute"] = {
    post: logisticsMutation("Administrator-only Logistics L2 reroute request. The server resolves a replacement route and preserves prior route revisions; clients cannot submit route graphs.", "ShipmentRerouteRequest", "ShipmentActionResponseEnvelope", [shipmentId]),
  };
  doc.paths["/api/v1/admin/logistics/shipments/{shipmentId}/collect"] = {
    post: logisticsMutation("Administrator-only verified customer collection at the shipment's terminal pickup node. Requires confirmed payment, code and physical ID attestation, appends an immutable private receipt and customer-safe event. Does not collect payment, modify stock or create a delivery job.", "PickupCollectRequest", "PickupCollectResponseEnvelope", [shipmentId]),
  };
  doc.paths["/api/v1/admin/logistics/shipments/{shipmentId}/checkpoints"] = {
    post: logisticsMutation("Administrator-only informational Logistics L2 checkpoint. It appends evidence without changing shipment movement, custody, inventory or payment truth.", "ShipmentCheckpointRequest", "ShipmentActionResponseEnvelope", [shipmentId]),
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
