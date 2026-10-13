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
  });
  for (const name of ["FulfilmentQueueResponse", "FulfilmentDetailResponse", "FulfilmentActionResponse"])
    schemas[name + "Envelope"] = {
      type: "object",
      required: ["ok", "data"],
      additionalProperties: false,
      properties: { ok: { type: "boolean", enum: [true] }, data: ref(name) },
    };

  doc.info.description =
    "Implemented production subset: identity, catalogue, inventory receiving, delivery configuration, authoritative checkout/orders, provider-neutral Payments Authority, provider-neutral Refunds Authority, and administrator Fulfilment + Stock Handover Authority. Courier dispatch, COD collection/remittance, physical returns, POS cash authority and public storefront cutover remain closed.";

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
