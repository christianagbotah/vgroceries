import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiProblem } from "../http/errors";

type Tx = Prisma.TransactionClient;

type DispatchShipmentTransition = {
  orderId: string;
  deliveryJobId: string;
  actorKind: "staff" | "rider" | "system";
  actorId?: string;
  action: string;
  safeMetadata?: Prisma.InputJsonValue;
  requestId: string;
};

function blocked(message: string): never {
  throw new ApiProblem(422, "SHIPMENT_NOT_FINAL_MILE_READY", message);
}

@Injectable()
export class ShipmentFinalMileService {
  private async lockSequenceOne(tx: Tx, orderId: string) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Shipment"
      WHERE "orderId"=${orderId} AND "sequence"=1
      FOR UPDATE
    `;
    if (!locked[0]) return null;
    return tx.shipment.findUnique({ where: { id: locked[0].id } });
  }

  async assertDispatchReady(tx: Tx, orderId: string): Promise<void> {
    const shipment = await this.lockSequenceOne(tx, orderId);
    if (!shipment) return; // Legacy handed-over order: preserve pre-L2 compatibility.
    if (
      shipment.status !== "final_mile_ready" ||
      !shipment.activatedAt ||
      !shipment.currentNodeId ||
      shipment.currentLegId ||
      shipment.completedAt
    ) blocked("Shipment has not reached final-mile dispatch readiness.");
  }

  async syncDispatchTransition(tx: Tx, input: DispatchShipmentTransition): Promise<void> {
    const shipment = await this.lockSequenceOne(tx, input.orderId);
    if (!shipment) return;

    const metadata = input.safeMetadata && typeof input.safeMetadata === "object" && !Array.isArray(input.safeMetadata)
      ? input.safeMetadata as Prisma.InputJsonObject
      : {};
    const assignmentKind = typeof metadata.assignmentKind === "string" ? metadata.assignmentKind : null;
    const now = new Date();
    let eventKind: string | null = null;
    let customerTitle: string | null = null;
    let fromCustody: string | null = null;
    let toCustody: string | null = null;
    let eventNodeId: string | null = shipment.currentNodeId;
    let update: Prisma.ShipmentUpdateInput | null = null;

    if (input.action === "assigned" || input.action === "reassigned") {
      if (shipment.status !== "final_mile_ready") blocked("Shipment must be final-mile ready before assignment.");
      if (assignmentKind === "rider") eventKind = "rider_assigned";
      else {
        eventKind = "custom_checkpoint";
        customerTitle = "Delivery provider assigned";
      }
    } else if (input.action === "accepted") {
      if (shipment.status !== "final_mile_ready") blocked("Shipment must remain final-mile ready before rider acceptance.");
      eventKind = "rider_accepted";
    } else if (input.action === "picked_up") {
      if (shipment.status !== "final_mile_ready" || !shipment.currentNodeId) blocked("Shipment is not ready for rider pickup.");
      eventKind = "rider_picked_up";
      fromCustody = shipment.custody;
      toCustody = "rider";
      update = { status: "final_mile", custody: "rider", currentNode: { disconnect: true }, version: { increment: 1 } };
    } else if (input.action === "provider_picked_up") {
      if (shipment.status !== "final_mile_ready" || !shipment.currentNodeId) blocked("Shipment is not ready for provider pickup.");
      eventKind = "shipment_handover";
      fromCustody = shipment.custody;
      toCustody = "provider";
      update = { status: "final_mile", custody: "provider", currentNode: { disconnect: true }, version: { increment: 1 } };
    } else if (input.action === "out_for_delivery" || input.action === "provider_out_for_delivery") {
      if (shipment.status !== "final_mile" || !["rider", "provider"].includes(shipment.custody ?? "")) blocked("Shipment is not in final-mile custody.");
      eventKind = "out_for_delivery";
    } else if (input.action === "failed" || input.action === "provider_failed") {
      if (!["final_mile_ready", "final_mile"].includes(shipment.status)) blocked("Shipment is not in an active final-mile state.");
      eventKind = "delivery_failed";
    } else if (input.action === "rescheduled") {
      if (!["final_mile_ready", "final_mile"].includes(shipment.status)) blocked("Shipment is not in an active final-mile state.");
      eventKind = "delivery_rescheduled";
    } else if (input.action === "return_to_store") {
      if (shipment.status !== "final_mile" || !["rider", "provider"].includes(shipment.custody ?? ""))
        blocked("Only final-mile goods still in delivery custody can return toward dispatch.");
      eventKind = "returned_toward_store";
    } else if (input.action === "returned_goods_received") {
      if (shipment.status !== "final_mile" || !["rider", "provider"].includes(shipment.custody ?? ""))
        blocked("Only physically returned final-mile goods can re-enter dispatch readiness.");
      const terminal = await tx.shipmentStop.findFirst({
        where: { shipmentId: shipment.id, routeRevision: shipment.routeRevision, terminalRole: "final_mile_dispatch" },
        orderBy: { position: "desc" },
        select: { nodeId: true },
      });
      if (!terminal) blocked("Shipment route has no final-mile dispatch stop.");
      const returnedCustody = terminal.nodeId === shipment.originNodeId ? "source_staff" : "node_staff";
      eventKind = "returned_to_dispatch";
      eventNodeId = terminal.nodeId;
      fromCustody = shipment.custody;
      toCustody = returnedCustody;
      update = {
        status: "final_mile_ready", custody: returnedCustody, currentNode: { connect: { id: terminal.nodeId } },
        currentLeg: { disconnect: true }, version: { increment: 1 },
      };
    } else if (input.action === "delivered" || input.action === "provider_delivered") {
      if (shipment.status !== "final_mile" || !["rider", "provider"].includes(shipment.custody ?? "")) blocked("Shipment is not in customer-delivery custody.");
      eventKind = "delivered";
      fromCustody = shipment.custody;
      toCustody = "customer";
      update = { status: "completed", custody: "customer", currentNode: { disconnect: true }, currentLeg: { disconnect: true }, completedAt: now, version: { increment: 1 } };
    } else {
      return;
    }

    if (update) await tx.shipment.update({ where: { id: shipment.id }, data: update });
    await tx.shipmentEvent.create({ data: {
      shipmentId: shipment.id,
      routeRevision: shipment.routeRevision,
      nodeId: eventNodeId,
      eventKind: eventKind!,
      actorKind: input.action.startsWith("provider_") ? "staff" : input.actorKind,
      actorId: input.actorId ?? null,
      fromCustody,
      toCustody,
      customerTitle,
      safeMetadata: { dispatchAction: input.action, assignmentKind },
      requestId: input.requestId,
      occurredAt: now,
    } });
  }
}
