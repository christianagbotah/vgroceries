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

export type LegacyShipmentPlanningInput = {
  orderId: string;
  destinationKind?: ShipmentDestinationKind;
  finalPickupNodeId?: string | null;
  serviceLevel?: string | null;
  expectedOrderVersion: number;
  /** Compatibility-only input for old internal callers. Legacy planning never trusts this value. */
  originNodeId?: string;
};

export type NormalizedShipmentPlanningInput = {
  orderId: string;
  originNodeId: string;
  destinationKind: ShipmentDestinationKind;
  finalPickupNodeId: string | null;
  serviceLevel: string | null;
  expectedOrderVersion?: number;
};

export type NormalizedLegacyShipmentPlanningInput = Omit<
  NormalizedShipmentPlanningInput,
  "originNodeId"
> & { expectedOrderVersion: number };

export function shipmentConflict(message: string, code = "CONFLICT"): never {
  throw new ApiProblem(409, code, message);
}

export function shipmentRuleViolation(message: string, code = "RULE_VIOLATION"): never {
  throw new ApiProblem(422, code, message);
}

function normalizeDestination(input: {
  orderId: string;
  destinationKind?: ShipmentDestinationKind;
  finalPickupNodeId?: string | null;
  serviceLevel?: string | null;
  expectedOrderVersion?: number;
}) {
  const orderId = input.orderId?.trim();
  if (!orderId)
    throw new ApiProblem(400, "VALIDATION_FAILED", "Shipment planning requires an order.");

  const destinationKind = input.destinationKind ?? "doorstep";
  const finalPickupNodeId = input.finalPickupNodeId?.trim() || null;
  if (destinationKind === "pickup_point" && !finalPickupNodeId)
    throw new ApiProblem(400, "VALIDATION_FAILED", "Pickup delivery requires a final pickup node.");
  if (destinationKind === "doorstep" && finalPickupNodeId)
    throw new ApiProblem(400, "VALIDATION_FAILED", "Doorstep delivery cannot set a final pickup node.");
  if (
    input.expectedOrderVersion !== undefined &&
    (!Number.isInteger(input.expectedOrderVersion) || input.expectedOrderVersion <= 0)
  )
    throw new ApiProblem(400, "VALIDATION_FAILED", "Expected order version must be a positive integer.");

  return {
    orderId,
    destinationKind,
    finalPickupNodeId,
    serviceLevel: input.serviceLevel?.trim() || null,
    ...(input.expectedOrderVersion === undefined
      ? {}
      : { expectedOrderVersion: input.expectedOrderVersion }),
  };
}

export function normalizeShipmentPlanningInput(input: ShipmentPlanningInput): NormalizedShipmentPlanningInput {
  const originNodeId = input.originNodeId?.trim();
  if (!originNodeId)
    throw new ApiProblem(400, "VALIDATION_FAILED", "Shipment planning requires an origin node.");
  return { ...normalizeDestination(input), originNodeId };
}

export function normalizeLegacyShipmentPlanningInput(
  input: LegacyShipmentPlanningInput,
): NormalizedLegacyShipmentPlanningInput {
  const normalized = normalizeDestination(input);
  if (normalized.expectedOrderVersion === undefined)
    throw new ApiProblem(
      400,
      "VALIDATION_FAILED",
      "Legacy shipment planning requires the expected order version.",
    );
  return { ...normalized, expectedOrderVersion: normalized.expectedOrderVersion };
}
