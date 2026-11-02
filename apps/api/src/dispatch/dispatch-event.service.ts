import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ShipmentFinalMileService } from "../logistics/shipment-final-mile.service";

export interface DeliveryTransitionInput {
  deliveryJobId: string;
  orderId: string;
  actorKind: "staff" | "rider" | "system";
  actorId?: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  note?: string | null;
  safeMetadata?: Prisma.InputJsonValue;
  requestId: string;
  customerSafe?: boolean;
}

@Injectable()
export class DispatchEventService {
  constructor(@Optional() private readonly finalMile?: ShipmentFinalMileService) {}

  async assertShipmentDispatchReady(tx: Prisma.TransactionClient, orderId: string) {
    if (this.finalMile) await this.finalMile.assertDispatchReady(tx, orderId);
  }

  async recordTransition(tx: Prisma.TransactionClient, input: DeliveryTransitionInput) {
    const action = `delivery.${input.action}`;
    const metadata = input.safeMetadata ?? {};
    await tx.deliveryEvent.create({ data: {
      deliveryJobId: input.deliveryJobId,
      orderId: input.orderId,
      actorKind: input.actorKind,
      actorId: input.actorId ?? null,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
      safeMetadata: metadata,
      requestId: input.requestId,
    } });
    await tx.orderEvent.create({ data: {
      orderId: input.orderId,
      actorKind: input.actorKind,
      actorId: input.actorId ?? null,
      action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
      customerSafe: input.customerSafe ?? false,
    } });
    await tx.auditEvent.create({ data: {
      actorId: input.actorId ?? input.actorKind,
      action,
      entityId: input.deliveryJobId,
      requestId: input.requestId,
      details: { orderId: input.orderId, fromStatus: input.fromStatus ?? null, toStatus: input.toStatus ?? null, metadata } as Prisma.InputJsonValue,
    } });
    await tx.outboxEvent.create({ data: {
      type: action,
      aggregateId: input.orderId,
      payload: { deliveryJobId: input.deliveryJobId, fromStatus: input.fromStatus ?? null, toStatus: input.toStatus ?? null, metadata, requestId: input.requestId } as Prisma.InputJsonValue,
    } });
    if (this.finalMile) await this.finalMile.syncDispatchTransition(tx, {
      orderId: input.orderId, deliveryJobId: input.deliveryJobId, actorKind: input.actorKind, actorId: input.actorId,
      action: input.action, safeMetadata: metadata, requestId: input.requestId,
    });
  }
}
