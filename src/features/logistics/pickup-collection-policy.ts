import {
  pickupCollectRequestSchema, type PickupCollectRequest,
  type ShipmentDetailView, type ShipmentListItem,
} from "@/services/contracts";

/** Display gating only; server independently re-checks payment, route, identity and handover. */
export function canOfferPickupCollection(shipment: Pick<ShipmentListItem,
  "destinationKind" | "status" | "currentLegId" | "currentNodeId" | "finalPickupNodeId" | "allowedActions"
>): boolean {
  return shipment.destinationKind === "pickup_point"
    && shipment.status === "ready_for_pickup"
    && Boolean(shipment.finalPickupNodeId)
    && shipment.currentNodeId === shipment.finalPickupNodeId
    && !shipment.currentLegId
    && shipment.allowedActions.includes("collect");
}

export function validPickupProof(proof: PickupCollectRequest, checkedIdentity: boolean): boolean {
  return checkedIdentity && pickupCollectRequestSchema.safeParse(proof).success;
}

/** Do not infer a location from live node edits: the snapshot is the audit authority. */
export function shipmentCurrentStop(shipment: ShipmentDetailView): string | undefined {
  const stop = shipment.stops.find(s =>
    s.routeRevision === shipment.routeRevision && s.nodeId === shipment.currentNodeId,
  );
  return stop?.nodePublicName;
}
