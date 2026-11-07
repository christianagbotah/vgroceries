import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  pickupCollectRequestSchema, pickupCollectResponseSchema,
  type PickupCollectRequest, type PickupCollectResponse,
} from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { VerificationCodeService } from "../orders/verification-code.service";
import { logisticsCommandHash } from "./logistics.values";

function rule(message: string, code = "PICKUP_COLLECTION_NOT_ALLOWED"): never {
  throw new ApiProblem(422, code, message);
}

/**
 * Authorized terminal-custody transition only. Does not collect money, change
 * provider settlement, create inventory or decrement stock a second time.
 */
@Injectable()
export class ShipmentCollectionService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly verification: VerificationCodeService,
  ) {}

  async collect(shipmentId: string, actorId: string, key: string, raw: unknown, requestId: string): Promise<PickupCollectResponse> {
    if (!this.config.shipmentExecutionEnabled || !this.config.customerPickupEnabled)
      throw new ApiProblem(503, "UNAVAILABLE", "Remote customer pickup is not enabled.");
    const parsed = pickupCollectRequestSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid customer pickup proof.",
        parsed.error.issues.map(issue => ({ path: issue.path.map(String).join("."), message: issue.message })));
    const input: PickupCollectRequest = parsed.data;
    const operation = `logistics.shipment.collect:${shipmentId}`;
    // Only a one-way request digest is ever persisted. Never store or log the code itself.
    const requestHash = logisticsCommandHash({ shipmentId, ...input });
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId, operation, key])}, 0))`;
      const previous = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key } } });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different pickup collection.");
        const replay = pickupCollectResponseSchema.safeParse(previous.outcome);
        if (!replay.success) throw new ApiProblem(409, "CONFLICT", "Pickup collection replay state is incomplete.");
        return replay.data;
      }
      const owner = await tx.shipment.findUnique({ where: { id: shipmentId }, select: { orderId: true } });
      if (!owner) throw new ApiProblem(404, "NOT_FOUND", "Shipment not found.");
      // Lock order before shipment to match fulfilment/payment's order-first lock ordering.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${owner.orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id=${shipmentId} FOR UPDATE`;
      const shipment = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId },
        include: { order: { include: { fulfilmentRun: true } } } });
      const order = shipment.order;
      if (shipment.destinationKind !== "pickup_point" || !shipment.finalPickupNodeId ||
          shipment.status !== "ready_for_pickup" || !shipment.activatedAt ||
          shipment.completedAt || shipment.currentLegId ||
          shipment.currentNodeId !== shipment.finalPickupNodeId ||
          !["node_staff", "source_staff"].includes(shipment.custody ?? "")) {
        rule("Shipment is not waiting at its configured customer pickup centre.");
      }
      const terminal = await tx.shipmentStop.findFirst({
        where: { shipmentId, routeRevision: shipment.routeRevision, nodeId: shipment.currentNodeId, terminalRole: "customer_pickup" },
        orderBy: { position: "desc" },
      });
      const finalStop = await tx.shipmentStop.findFirst({
        where: { shipmentId, routeRevision: shipment.routeRevision }, orderBy: { position: "desc" },
      });
      if (!terminal || terminal.id !== finalStop?.id)
        rule("Shipment pickup terminal does not match its frozen current route.");
      if (order.fulfilment !== "delivery" || order.cancelledAt ||
          order.fulfilmentStatus !== "dispatched" || !order.stockConsumedAt ||
          !order.fulfilmentRun?.handedOverAt)
        rule("Pickup requires an active, fully handed-over customer delivery shipment.");
      if (!["electronic", "mobile_money", "card_hosted", "bank_transfer"].includes(order.paymentMethod) ||
          order.paymentStatus !== "succeeded")
        rule("Collection requires a confirmed electronic payment; cash collection belongs to a separate authority.",
          "PICKUP_PAYMENT_NOT_CONFIRMED");
      if (!this.verification.verify(order.id, input.verificationCode, order.verificationKeyVersion, order.verificationCodeHash))
        rule("Customer order verification code does not match.", "PICKUP_VERIFICATION_FAILED");
      if (await tx.shipmentCollectionReceipt.count({ where: { shipmentId } }))
        rule("Shipment already has a collection receipt.");

      const at = new Date();
      const receiptId = randomUUID();
      const eventId = randomUUID();
      await tx.shipment.update({ where: { id: shipmentId }, data: {
        status: "completed", custody: "customer", currentNodeId: null, completedAt: at, version: { increment: 1 },
      } });
      await tx.order.update({ where: { id: order.id }, data: {
        fulfilmentStatus: "collected", version: { increment: 1 },
      } });
      await tx.shipmentEvent.create({ data: {
        id: eventId, shipmentId, routeRevision: shipment.routeRevision,
        nodeId: shipment.finalPickupNodeId, eventKind: "customer_collected",
        actorKind: "staff", actorId, fromCustody: shipment.custody, toCustody: "customer",
        safeMetadata: { receiptId }, requestId, occurredAt: at,
      } });
      await tx.shipmentCollectionReceipt.create({ data: {
        id: receiptId, shipmentId, orderId: order.id, nodeId: shipment.finalPickupNodeId,
        eventId, staffActorId: actorId, receiverName: input.receiverName.trim(),
        identityCheck: input.identityCheck, verificationKeyVersion: order.verificationKeyVersion, collectedAt: at,
      } });
      await tx.orderEvent.create({ data: {
        orderId: order.id, actorKind: "staff", actorId, action: "logistics.customer_collected",
        fromStatus: order.fulfilmentStatus, toStatus: "collected", customerSafe: true,
      } });
      await tx.auditEvent.create({ data: {
        actorId, action: "logistics.shipment.customer_collected", entityId: shipmentId, requestId,
        details: { orderId: order.id, nodeId: shipment.finalPickupNodeId,
          receiptId, identityCheck: input.identityCheck, verificationKeyVersion: order.verificationKeyVersion },
      } });
      await tx.outboxEvent.create({ data: {
        type: "logistics.shipment.customer_collected", aggregateId: shipmentId,
        payload: { orderId: order.id, shipmentId, receiptId, nodeId: shipment.finalPickupNodeId },
      } });
      const result = pickupCollectResponseSchema.parse({
        receiptId, shipmentId, orderId: order.id, orderReference: order.reference,
        nodeId: shipment.finalPickupNodeId, collectedAt: at.toISOString(),
        status: "completed", custody: "customer",
      });
      await tx.idempotency.create({ data: {
        actorId, operation, key, requestHash, outcome: result as Prisma.InputJsonValue,
      } });
      return result;
    }, { timeout: 15_000 });
  }
}
