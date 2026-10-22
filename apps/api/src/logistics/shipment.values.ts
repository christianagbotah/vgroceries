import { ApiProblem } from "../http/errors";

export type ShipmentDestinationKind = "doorstep" | "pickup_point";

export type ShipmentPlanningInput = {
  orderId: string;
  originNodeId: string;
  destinationKind?: ShipmentDestinationKind;
  finalPickupNodeId?: string | null;
  serviceLevel?: string | null;
  expectedOrderVersion?: number;
};

export type NormalizedShipmentPlanningInput = {
  orderId: string;
  originNodeId: string;
  destinationKind: ShipmentDestinationKind;
  finalPickupNodeId: string | null;
  serviceLevel: string | null;
  expectedOrderVersion?: number;
};

export function shipmentConflict(message: string, code = "CONFLICT"): never {
  throw new ApiProblem(409, code, message);
}

export function shipmentRuleViolation(message: string, code = "RULE_VIOLATION"): never {
  throw new ApiProblem(422, code, message);
}

export function normalizeShipmentPlanningInput(input: ShipmentPlanningInput): NormalizedShipmentPlanningInput {
  const orderId = input.orderId?.trim();
  const originNodeId = input.originNodeId?.trim();
  if (!orderId || !originNodeId)
    throw new ApiProblem(400, "VALIDATION_FAILED", "Shipment planning requires an order and origin node.");

  const destinationKind = input.destinationKind ?? "doorstep";
  const finalPickupNodeId = input.finalPickupNodeId?.trim() || null;
  if (destinationKind === "pickup_point" && !finalPickupNodeId)
    throw new ApiProblem(400, "VALIDATION_FAILED", "Pickup delivery requires a final pickup node.");
  if (destinationKind === "doorstep" && finalPickupNodeId)
    throw new ApiProblem(400, "VALIDATION_FAILED", "Doorstep delivery cannot set a final pickup node.");
  if (input.expectedOrderVersion !== undefined && (!Number.isInteger(input.expectedOrderVersion) || input.expectedOrderVersion <= 0))
    throw new ApiProblem(400, "VALIDATION_FAILED", "Expected order version must be a positive integer.");

  return {
    orderId,
    originNodeId,
    destinationKind,
    finalPickupNodeId,
    serviceLevel: input.serviceLevel?.trim() || null,
    ...(input.expectedOrderVersion === undefined ? {} : { expectedOrderVersion: input.expectedOrderVersion }),
  };
}
