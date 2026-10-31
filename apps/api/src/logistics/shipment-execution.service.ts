import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { API_CONFIG, type ApiConfig } from "../config";
import { ApiProblem } from "../http/errors";

type Tx = Prisma.TransactionClient;

type HandoverActivationInput = {
  orderId: string;
  actorId: string;
  requestId: string;
};

function rule(message: string, code = "SHIPMENT_INVALID_STATE"): never {
  throw new ApiProblem(422, code, message);
}

@Injectable()
export class ShipmentExecutionService {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async activateForHandover(tx: Tx, input: HandoverActivationInput): Promise<void> {
    if (!this.config.shipmentExecutionEnabled) return;

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Shipment"
      WHERE "orderId"=${input.orderId} AND "sequence"=1
      FOR UPDATE
    `;
    if (!locked[0])
      rule("Delivery handover requires a planned shipment snapshot.", "SHIPMENT_NOT_PLANNED");

    const shipment = await tx.shipment.findUnique({
      where: { orderId_sequence: { orderId: input.orderId, sequence: 1 } },
    });
    if (!shipment)
      rule("Delivery handover requires a planned shipment snapshot.", "SHIPMENT_NOT_PLANNED");
    if (
      shipment.status !== "planned" ||
      shipment.activatedAt ||
      shipment.currentNodeId ||
      shipment.currentLegId ||
      shipment.custody
    ) rule("Shipment is not in its pristine planned state for fulfilment handover.");

    const stops = await tx.shipmentStop.findMany({
      where: { shipmentId: shipment.id, routeRevision: shipment.routeRevision },
      orderBy: { position: "asc" },
    });
    const legs = await tx.shipmentLeg.findMany({
      where: { shipmentId: shipment.id, routeRevision: shipment.routeRevision },
      orderBy: { position: "asc" },
    });
    if (!stops.length || stops[0]!.position !== 1 || stops[0]!.nodeId !== shipment.originNodeId)
      rule("Shipment route snapshot does not begin at its configured source node.");

    for (let index = 0; index < stops.length; index++) {
      if (stops[index]!.position !== index + 1)
        rule("Shipment route snapshot stop positions are incomplete.");
    }
    for (let index = 0; index < legs.length; index++) {
      const leg = legs[index]!;
      if (
        leg.position !== index + 1 ||
        leg.status !== "planned" ||
        leg.originStopId !== stops[index]?.id ||
        leg.destinationStopId !== stops[index + 1]?.id
      ) rule("Shipment route snapshot legs are incomplete or already active.");
    }
    if (legs.length !== Math.max(0, stops.length - 1))
      rule("Shipment route snapshot has an invalid stop-to-leg topology.");

    let status: "at_node" | "final_mile_ready" | "ready_for_pickup";
    if (legs.length) {
      status = "at_node";
      await tx.shipmentLeg.update({
        where: { id: legs[0]!.id },
        data: { status: "ready", version: { increment: 1 } },
      });
    } else {
      const terminalRole = stops[0]!.terminalRole;
      if (terminalRole === "final_mile_dispatch") status = "final_mile_ready";
      else if (terminalRole === "customer_pickup") status = "ready_for_pickup";
      else rule("One-stop shipment must terminate at final-mile dispatch or customer pickup.");
    }

    const now = new Date();
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status,
        currentNodeId: stops[0]!.nodeId,
        currentLegId: null,
        custody: "source_staff",
        activatedAt: now,
        version: { increment: 1 },
      },
    });
    await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        routeRevision: shipment.routeRevision,
        nodeId: stops[0]!.nodeId,
        eventKind: "fulfilment_handed_over",
        actorKind: "staff",
        actorId: input.actorId,
        fromCustody: null,
        toCustody: "source_staff",
        safeMetadata: { status },
        requestId: input.requestId,
        occurredAt: now,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId,
        action: "logistics.shipment.handed_over",
        entityId: shipment.id,
        requestId: input.requestId,
        details: { orderId: input.orderId, routeRevision: shipment.routeRevision, status, currentNodeId: stops[0]!.nodeId },
      },
    });
    await tx.outboxEvent.create({
      data: {
        type: "logistics.shipment.handed_over",
        aggregateId: shipment.id,
        payload: { shipmentId: shipment.id, orderId: input.orderId, routeRevision: shipment.routeRevision, status, currentNodeId: stops[0]!.nodeId },
      },
    });
  }
}
