import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  planShipmentRequestSchema,
  shipmentActionResponseSchema,
  type PlanShipmentRequest,
  type ShipmentActionResponse,
} from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { logisticsCommandHash } from "./logistics.values";
import { LogisticsRouteRuleService } from "./logistics-route-rule.service";

type Tx = Prisma.TransactionClient;
type PlanContext = { actorId: string; requestId: string };

function conflict(message: string, code = "CONFLICT"): never { throw new ApiProblem(409, code, message); }
function rule(message: string, code = "RULE_VIOLATION"): never { throw new ApiProblem(422, code, message); }

@Injectable()
export class ShipmentPlanningService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly routes: LogisticsRouteRuleService,
  ) {}

  private assertEnabled() {
    if (!this.config.shipmentExecutionEnabled)
      throw new ApiProblem(503, "UNAVAILABLE", "Shipment route execution is not enabled.");
  }

  private commerceLocationId() {
    if (!this.config.commerce) throw new ApiProblem(503, "UNAVAILABLE", "Commerce is not configured.");
    return this.config.commerce.locationId;
  }

  private parseInput(input: unknown): PlanShipmentRequest {
    const parsed = planShipmentRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Shipment planning input is invalid.", parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })));
    return parsed.data;
  }

  private action(shipment: { id: string; orderId: string; status: string; custody: string | null; currentNodeId: string | null; currentLegId: string | null; routeRevision: number }): ShipmentActionResponse {
    return shipmentActionResponseSchema.parse({
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      status: shipment.status,
      custody: shipment.custody,
      currentNodeId: shipment.currentNodeId,
      currentLegId: shipment.currentLegId,
      routeRevision: shipment.routeRevision,
      allowedActions: [],
      blockers: ["awaiting_fulfilment_handover"],
    });
  }

  async planInTransaction(tx: Tx, orderId: string, raw: PlanShipmentRequest, context: PlanContext): Promise<ShipmentActionResponse> {
    this.assertEnabled();
    const input = this.parseInput(raw);
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { deliveryAddress: true, fulfilmentRun: true } });
    if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");
    if (order.fulfilment !== "delivery") rule("Only delivery orders can be planned as shipments.");
    if (!order.zoneId) rule("Delivery order is missing its delivery zone.");
    if (order.cancelledAt) rule("Cancelled orders cannot be planned as shipments.");
    if (order.fulfilmentRun?.handedOverAt || ["dispatched", "collected", "delivered"].includes(order.fulfilmentStatus))
      rule("Shipment planning must happen before fulfilment handover.", "SHIPMENT_ALREADY_HANDED_OVER");
    if (await tx.shipment.findFirst({ where: { orderId }, select: { id: true } }))
      conflict("This order already has a shipment plan.", "SHIPMENT_ALREADY_PLANNED");
    if (input.destinationKind === "doorstep" && !order.deliveryAddress)
      rule("Doorstep shipment planning requires the order delivery address.");

    const source = await tx.logisticsNode.findFirst({
      where: { inventoryLocationId: this.commerceLocationId(), active: true },
      select: { id: true },
    });
    if (!source) rule("No active logistics source is mapped to the commerce inventory location.", "LOGISTICS_SOURCE_NOT_CONFIGURED");

    const selected = await this.routes.resolveInTransaction(tx, {
      originNodeId: source.id,
      fulfilment: "delivery",
      deliveryZoneId: order.zoneId,
      locality: order.deliveryAddress?.locality ?? undefined,
      destinationKind: input.destinationKind,
      finalPickupNodeId: input.destinationKind === "pickup_point" ? input.finalPickupNodeId : null,
      serviceLevel: input.serviceLevel ?? null,
    }, new Date());

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "DeliveryRouteRule" WHERE id=${selected.ruleId} AND active=true FOR SHARE
    `;
    if (!locked[0]) rule("Selected logistics route is no longer active.", "LOGISTICS_ROUTE_NOT_CONFIGURED");
    const graph = await tx.deliveryRouteRule.findUnique({
      where: { id: selected.ruleId },
      include: {
        stops: { include: { node: true }, orderBy: { position: "asc" } },
        legs: { include: { lane: true }, orderBy: { position: "asc" } },
      },
    });
    if (!graph?.active) rule("Selected logistics route is no longer active.", "LOGISTICS_ROUTE_NOT_CONFIGURED");

    const destinationAddress: Prisma.InputJsonObject | undefined = input.destinationKind === "doorstep" && order.deliveryAddress ? {
      recipientName: order.deliveryAddress.recipientName,
      locality: order.deliveryAddress.locality,
      street: order.deliveryAddress.street,
      landmark: order.deliveryAddress.landmark,
      ghanaPostGps: order.deliveryAddress.ghanaPostGps,
    } : undefined;
    const shipment = await tx.shipment.create({ data: {
      orderId,
      sequence: 1,
      workflowVersionId: graph.workflowVersionId,
      routeRuleId: graph.id,
      routeRevision: 1,
      status: "planned",
      originNodeId: source.id,
      destinationKind: input.destinationKind,
      finalPickupNodeId: input.destinationKind === "pickup_point" ? input.finalPickupNodeId : null,
      ...(destinationAddress ? { destinationAddress } : {}),
      version: 1,
    } });

    const stopIds = new Map<number, string>();
    for (const stop of graph.stops) {
      const created = await tx.shipmentStop.create({ data: {
        shipmentId: shipment.id,
        routeRevision: 1,
        position: stop.position,
        nodeId: stop.nodeId,
        nodeCode: stop.node.code,
        nodePublicName: stop.node.publicName,
        nodeKind: stop.node.kind,
        nodeKindLabel: stop.node.kindLabel,
        terminalRole: stop.terminalRole,
      } });
      stopIds.set(stop.position, created.id);
    }
    for (const leg of graph.legs) {
      const originStopId = stopIds.get(leg.position);
      const destinationStopId = stopIds.get(leg.position + 1);
      if (!originStopId || !destinationStopId) rule("Selected route graph is incomplete.", "LOGISTICS_ROUTE_INVALID");
      await tx.shipmentLeg.create({ data: {
        shipmentId: shipment.id,
        routeRevision: 1,
        position: leg.position,
        originStopId,
        destinationStopId,
        laneId: leg.laneId,
        mode: leg.lane.mode,
        providerKey: leg.lane.providerKey,
        typicalMinutes: leg.lane.typicalMinutes,
        status: "planned",
        version: 1,
      } });
    }

    await tx.auditEvent.create({ data: { actorId: context.actorId, action: "logistics.shipment.planned", entityId: shipment.id, requestId: context.requestId, details: { orderId, routeRuleId: graph.id, routeRevision: 1 } } });
    await tx.outboxEvent.create({ data: { type: "logistics.shipment.planned", aggregateId: shipment.id, payload: { shipmentId: shipment.id, orderId, routeRuleId: graph.id, routeRevision: 1 } } });
    return this.action(shipment);
  }

  async planLegacy(orderId: string, actorId: string, idempotencyKey: string, raw: PlanShipmentRequest, requestId: string): Promise<ShipmentActionResponse> {
    this.assertEnabled();
    const input = this.parseInput(raw);
    const operation = `logistics.shipment.plan:${orderId}`;
    const requestHash = logisticsCommandHash({ orderId, ...input });
    return this.db.$transaction(async (tx) => {
      const lockKey = JSON.stringify([actorId, operation, idempotencyKey]);
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key already belongs to another shipment planning command.");
        const parsed = shipmentActionResponseSchema.safeParse(replay.outcome);
        if (!parsed.success) conflict("Shipment planning replay state is incomplete.");
        return parsed.data;
      }
      const outcome = await this.planInTransaction(tx, orderId, input, { actorId, requestId });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome: outcome as Prisma.InputJsonValue } });
      return outcome;
    }, { timeout: 15_000 });
  }
}
