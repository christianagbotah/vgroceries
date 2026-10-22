import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiProblem } from "../http/errors";
import { LogisticsRouteRuleService } from "./logistics-route-rule.service";
import {
  normalizeShipmentPlanningInput,
  shipmentConflict,
  shipmentRuleViolation,
  type NormalizedShipmentPlanningInput,
  type ShipmentPlanningInput,
} from "./shipment.values";

type Tx = Prisma.TransactionClient;
type PlanningOrder = Prisma.OrderGetPayload<{
  include: {
    deliveryAddress: true;
    fulfilmentRun: { select: { orderId: true } };
    deliveryJob: { select: { id: true } };
  };
}>;

const shipmentGraphInclude = {
  stops: { orderBy: { position: "asc" as const } },
  legs: { orderBy: { position: "asc" as const } },
  events: { orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.ShipmentInclude;

export type PlannedShipment = Prisma.ShipmentGetPayload<{ include: typeof shipmentGraphInclude }>;

@Injectable()
export class ShipmentPlanningService {
  constructor(private readonly routes: LogisticsRouteRuleService) {}

  private async orderForPlanning(tx: Tx, input: NormalizedShipmentPlanningInput): Promise<PlanningOrder> {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: {
        deliveryAddress: true,
        fulfilmentRun: { select: { orderId: true } },
        deliveryJob: { select: { id: true } },
      },
    });
    if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");
    if (order.fulfilment !== "delivery")
      shipmentRuleViolation("Only delivery orders can receive a routed shipment.", "LOGISTICS_DELIVERY_REQUIRED");
    if (!order.zoneId)
      shipmentRuleViolation("Delivery order has no delivery zone for route resolution.", "LOGISTICS_ROUTE_NOT_CONFIGURED");
    if (order.cancelledAt || order.fulfilmentStatus === "cancelled")
      shipmentConflict("Cancelled orders cannot be planned for shipment.", "SHIPMENT_ORDER_CLOSED");
    return order;
  }

  private async assertNoExistingShipment(tx: Tx, orderId: string) {
    const existing = await tx.shipment.findFirst({
      where: { orderId },
      select: { id: true, sequence: true },
      orderBy: { sequence: "asc" },
    });
    if (existing)
      shipmentConflict("This order already has its sequence-1 shipment plan.", "SHIPMENT_ALREADY_PLANNED");
  }

  private async createSnapshot(
    tx: Tx,
    order: PlanningOrder,
    input: NormalizedShipmentPlanningInput,
  ): Promise<PlannedShipment> {
    if (input.destinationKind === "pickup_point" && order.paymentMethod === "cash_on_delivery")
      shipmentRuleViolation(
        "Cash on delivery is unavailable for remote pickup routes until COD collection authority is enabled.",
        "LOGISTICS_PICKUP_COD_UNSUPPORTED",
      );

    const route = await this.routes.resolveInTransaction(tx, {
      originNodeId: input.originNodeId,
      fulfilment: "delivery",
      deliveryZoneId: order.zoneId!,
      locality: order.deliveryAddress?.locality ?? undefined,
      destinationKind: input.destinationKind,
      finalPickupNodeId: input.destinationKind === "pickup_point" ? input.finalPickupNodeId ?? undefined : undefined,
      serviceLevel: input.serviceLevel ?? undefined,
    }, new Date());

    const addressSnapshot = input.destinationKind === "doorstep" && order.deliveryAddress
      ? {
          label: order.deliveryAddress.label,
          recipientName: order.deliveryAddress.recipientName,
          phone: order.deliveryAddress.phone,
          locality: order.deliveryAddress.locality,
          street: order.deliveryAddress.street,
          landmark: order.deliveryAddress.landmark,
          ghanaPostGps: order.deliveryAddress.ghanaPostGps,
        }
      : undefined;

    const shipment = await tx.shipment.create({ data: {
      orderId: order.id,
      sequence: 1,
      workflowVersionId: route.workflowVersionId,
      routeRuleId: route.id,
      status: "planned",
      originNodeId: input.originNodeId,
      destinationKind: input.destinationKind,
      finalPickupNodeId: input.finalPickupNodeId,
      ...(addressSnapshot ? { destinationAddressSnapshot: addressSnapshot } : {}),
      currentRouteRevision: 1,
      currentNodeId: null,
      currentLegId: null,
      custodyState: null,
      version: 1,
    } });

    const stopIds = new Map<number, string>();
    for (const stop of [...route.stops].sort((a, b) => a.position - b.position)) {
      const created = await tx.shipmentStop.create({ data: {
        shipmentId: shipment.id,
        routeRevision: 1,
        position: stop.position,
        nodeId: stop.nodeId,
        nodeCode: stop.node.code,
        nodePublicName: stop.node.publicName,
        nodeKind: stop.node.kind,
        kindLabel: stop.node.kindLabel,
        terminalRole: stop.terminalRole,
      } });
      stopIds.set(stop.position, created.id);
    }

    for (const leg of [...route.legs].sort((a, b) => a.position - b.position)) {
      const originStopId = stopIds.get(leg.position);
      const destinationStopId = stopIds.get(leg.position + 1);
      if (!originStopId || !destinationStopId)
        shipmentRuleViolation("Resolved route leg does not map to adjacent shipment stops.");
      await tx.shipmentLeg.create({ data: {
        shipmentId: shipment.id,
        routeRevision: 1,
        position: leg.position,
        originStopId,
        destinationStopId,
        laneId: leg.laneId,
        laneMode: leg.lane.mode,
        providerKey: leg.lane.providerKey,
        typicalMinutes: leg.lane.typicalMinutes,
        status: "planned",
        version: 1,
      } });
    }

    return tx.shipment.findUniqueOrThrow({ where: { id: shipment.id }, include: shipmentGraphInclude });
  }

  async planDeliveryShipment(tx: Tx, raw: ShipmentPlanningInput): Promise<PlannedShipment> {
    const input = normalizeShipmentPlanningInput(raw);
    const order = await this.orderForPlanning(tx, input);
    if (!order.logisticsExecutionRequired)
      shipmentConflict(
        "New delivery orders must opt into shipment execution before planning.",
        "SHIPMENT_EXECUTION_NOT_REQUIRED",
      );
    await this.assertNoExistingShipment(tx, order.id);
    return this.createSnapshot(tx, order, input);
  }

  async planExistingDelivery(tx: Tx, raw: ShipmentPlanningInput): Promise<PlannedShipment> {
    const input = normalizeShipmentPlanningInput(raw);
    const order = await this.orderForPlanning(tx, input);
    if (input.expectedOrderVersion !== undefined && order.version !== input.expectedOrderVersion)
      shipmentConflict("This order changed elsewhere. Reload before planning shipment.", "ORDER_VERSION_CONFLICT");
    if (order.stockConsumedAt || order.fulfilmentRun || order.deliveryJob || ["dispatched", "delivered"].includes(order.fulfilmentStatus))
      shipmentConflict(
        "A handed-over delivery cannot be retroactively given invented shipment movement.",
        "SHIPMENT_ORDER_ALREADY_HANDED_OVER",
      );
    await this.assertNoExistingShipment(tx, order.id);
    const shipment = await this.createSnapshot(tx, order, input);
    if (!order.logisticsExecutionRequired) {
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          version: order.version,
          logisticsExecutionRequired: false,
          stockConsumedAt: null,
          cancelledAt: null,
        },
        data: { logisticsExecutionRequired: true, version: { increment: 1 } },
      });
      if (updated.count !== 1)
        shipmentConflict("Order changed while shipment planning was in progress.", "ORDER_VERSION_CONFLICT");
    }
    return shipment;
  }
}
