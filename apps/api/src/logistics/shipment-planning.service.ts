import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiProblem } from "../http/errors";
import { ClaimCoverageService } from "../inventory/claim-coverage.service";
import { LogisticsRouteRuleService } from "./logistics-route-rule.service";
import {
  normalizeLegacyShipmentPlanningInput,
  normalizeShipmentPlanningInput,
  shipmentConflict,
  shipmentRuleViolation,
  type LegacyShipmentPlanningInput,
  type NormalizedShipmentPlanningInput,
  type ShipmentPlanningInput,
} from "./shipment.values";

type Tx = Prisma.TransactionClient;
type PlanningOrder = Prisma.OrderGetPayload<{
  include: {
    deliveryAddress: true;
    lines: true;
    fulfilmentRun: true;
    deliveryJob: { select: { id: true } };
  };
}>;

const shipmentGraphInclude = {
  stops: { orderBy: { position: "asc" as const } },
  legs: { orderBy: { position: "asc" as const } },
  events: { orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.ShipmentInclude;

export type PlannedShipment = Prisma.ShipmentGetPayload<{ include: typeof shipmentGraphInclude }>;

function reservationLost(message: string): never {
  throw new ApiProblem(409, "RESERVATION_LOST", message);
}

@Injectable()
export class ShipmentPlanningService {
  private readonly coverage: ClaimCoverageService;

  constructor(
    private readonly routes: LogisticsRouteRuleService,
    @Optional() coverage?: ClaimCoverageService,
  ) {
    // Direct service tests may construct the planner without Nest. Production injects
    // the same ClaimCoverageService used by Fulfilment through InventoryModule.
    this.coverage = coverage ?? new ClaimCoverageService();
  }

  private async orderForPlanning(tx: Tx, orderId: string): Promise<PlanningOrder> {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        deliveryAddress: true,
        lines: true,
        fulfilmentRun: true,
        deliveryJob: { select: { id: true } },
      },
    });
    if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");
    if (order.fulfilment !== "delivery")
      shipmentRuleViolation(
        "Only delivery orders can receive a routed shipment.",
        "LOGISTICS_DELIVERY_REQUIRED",
      );
    if (!order.zoneId)
      shipmentRuleViolation(
        "Delivery order has no delivery zone for route resolution.",
        "LOGISTICS_ROUTE_NOT_CONFIGURED",
      );
    if (order.cancelledAt || order.fulfilmentStatus === "cancelled")
      shipmentConflict(
        "Cancelled orders cannot be planned for shipment.",
        "SHIPMENT_ORDER_CLOSED",
      );
    return order;
  }

  private async assertNoExistingShipment(tx: Tx, orderId: string) {
    const existing = await tx.shipment.findFirst({
      where: { orderId },
      select: { id: true, sequence: true },
      orderBy: { sequence: "asc" },
    });
    if (existing)
      shipmentConflict(
        "This order already has its sequence-1 shipment plan.",
        "SHIPMENT_ALREADY_PLANNED",
      );
  }

  private expectedLines(order: PlanningOrder) {
    if (order.lines.length === 0)
      reservationLost("Order has no fulfilment lines for reservation coverage.");
    return order.lines.map((line) => ({
      claimLineId: line.id,
      variantId: line.variantId,
      quantity: line.quantity.toString(),
    }));
  }

  private async deriveLegacyOriginNode(tx: Tx, order: PlanningOrder): Promise<string> {
    const rows = await tx.reservation.findMany({
      where: { claimType: "order", claimId: order.id, state: "active" },
      select: { position: { select: { locationId: true } } },
    });
    const locations = [...new Set(rows.map((row) => row.position.locationId))];
    if (locations.length !== 1)
      reservationLost("Order reservation coverage does not resolve to one stock location.");

    const locationId = locations[0]!;
    if (order.fulfilmentRun && order.fulfilmentRun.locationId !== locationId)
      reservationLost(
        "Fulfilment run location no longer matches the order reservation authority.",
      );

    await this.coverage.lockExact(tx, {
      claimType: "order",
      claimId: order.id,
      locationId,
      lines: this.expectedLines(order),
    });

    const source = await tx.logisticsNode.findFirst({
      where: { inventoryLocationId: locationId },
      select: { id: true, active: true },
    });
    if (!source || !source.active)
      shipmentRuleViolation(
        "The authoritative stock location has no active logistics source node.",
        "LOGISTICS_ROUTE_NOT_CONFIGURED",
      );
    return source.id;
  }

  private async createSnapshot(
    tx: Tx,
    order: PlanningOrder,
    input: NormalizedShipmentPlanningInput,
  ): Promise<PlannedShipment> {
    if (
      input.destinationKind === "pickup_point" &&
      order.paymentMethod === "cash_on_delivery"
    )
      shipmentRuleViolation(
        "Cash on delivery is unavailable for remote pickup routes until COD collection authority is enabled.",
        "LOGISTICS_PICKUP_COD_UNSUPPORTED",
      );

    const route = await this.routes.resolveInTransaction(
      tx,
      {
        originNodeId: input.originNodeId,
        fulfilment: "delivery",
        deliveryZoneId: order.zoneId!,
        locality: order.deliveryAddress?.locality ?? undefined,
        destinationKind: input.destinationKind,
        finalPickupNodeId:
          input.destinationKind === "pickup_point"
            ? input.finalPickupNodeId ?? undefined
            : undefined,
        serviceLevel: input.serviceLevel ?? undefined,
      },
      new Date(),
    );

    const addressSnapshot =
      input.destinationKind === "doorstep" && order.deliveryAddress
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

    const shipment = await tx.shipment.create({
      data: {
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
      },
    });

    const stopIds = new Map<number, string>();
    for (const stop of [...route.stops].sort((a, b) => a.position - b.position)) {
      const created = await tx.shipmentStop.create({
        data: {
          shipmentId: shipment.id,
          routeRevision: 1,
          position: stop.position,
          nodeId: stop.nodeId,
          nodeCode: stop.node.code,
          nodePublicName: stop.node.publicName,
          nodeKind: stop.node.kind,
          kindLabel: stop.node.kindLabel,
          terminalRole: stop.terminalRole,
        },
      });
      stopIds.set(stop.position, created.id);
    }

    for (const leg of [...route.legs].sort((a, b) => a.position - b.position)) {
      const originStopId = stopIds.get(leg.position);
      const destinationStopId = stopIds.get(leg.position + 1);
      if (!originStopId || !destinationStopId)
        shipmentRuleViolation(
          "Resolved route leg does not map to adjacent shipment stops.",
        );
      await tx.shipmentLeg.create({
        data: {
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
        },
      });
    }

    return tx.shipment.findUniqueOrThrow({
      where: { id: shipment.id },
      include: shipmentGraphInclude,
    });
  }

  async planDeliveryShipment(
    tx: Tx,
    raw: ShipmentPlanningInput,
  ): Promise<PlannedShipment> {
    const input = normalizeShipmentPlanningInput(raw);
    const order = await this.orderForPlanning(tx, input.orderId);
    if (!order.logisticsExecutionRequired)
      shipmentConflict(
        "New delivery orders must opt into shipment execution before planning.",
        "SHIPMENT_EXECUTION_NOT_REQUIRED",
      );
    await this.assertNoExistingShipment(tx, order.id);
    return this.createSnapshot(tx, order, input);
  }

  async planExistingDelivery(
    tx: Tx,
    raw: LegacyShipmentPlanningInput,
  ): Promise<PlannedShipment> {
    const input = normalizeLegacyShipmentPlanningInput(raw);
    const order = await this.orderForPlanning(tx, input.orderId);

    if (order.version !== input.expectedOrderVersion)
      shipmentConflict(
        "This order changed elsewhere. Reload before planning shipment.",
        "ORDER_VERSION_CONFLICT",
      );
    if (order.logisticsExecutionRequired)
      shipmentConflict(
        "This order already requires shipment execution and cannot use the legacy planning path.",
        "SHIPMENT_EXECUTION_ALREADY_REQUIRED",
      );
    if (
      order.stockConsumedAt ||
      order.deliveryJob ||
      order.fulfilmentRun?.handedOverAt ||
      order.fulfilmentRun?.handedOverBy ||
      order.fulfilmentRun?.handoverKind ||
      ["dispatched", "delivered"].includes(order.fulfilmentStatus)
    )
      shipmentConflict(
        "A handed-over delivery cannot be retroactively given invented shipment movement.",
        "SHIPMENT_ORDER_ALREADY_HANDED_OVER",
      );

    await this.assertNoExistingShipment(tx, order.id);
    const originNodeId = await this.deriveLegacyOriginNode(tx, order);
    const shipment = await this.createSnapshot(tx, order, {
      ...input,
      originNodeId,
    });

    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        version: order.version,
        logisticsExecutionRequired: false,
        stockConsumedAt: null,
        cancelledAt: null,
      },
      data: {
        logisticsExecutionRequired: true,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      shipmentConflict(
        "Order changed while shipment planning was in progress.",
        "ORDER_VERSION_CONFLICT",
      );

    return shipment;
  }
}
