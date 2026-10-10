import { Injectable } from "@nestjs/common";
import { Prisma, DeliverySlot, DeliveryZone, DeliverySlotBooking } from "@prisma/client";
import type { SlotView, ZoneView } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

export interface DeliveryOperationContext { actorId: string; requestId: string }
export interface BookSlotInput { orderId: string; zoneId: string; slotId: string; now: Date }

@Injectable()
export class DeliveryConfigService {
  constructor(private readonly db: Database) {}

  async listZones(): Promise<ZoneView[]> {
    const rows = await this.db.deliveryZone.findMany({ where: { active: true }, orderBy: { id: "asc" } });
    return rows.map((z) => ({
      id: z.id, name: z.name, areas: z.areas, feeMinor: z.feeMinor,
      minimumOrderMinor: z.minimumOrderMinor, serviceHours: z.serviceHours,
      cutoff: z.cutoff, slotsPerDay: z.slotsPerDay, isActive: true,
      slotPolicy: z.slotPolicy as "required" | "optional" | "none", codEnabled: z.codEnabled,
    }));
  }

  async listSlots(zoneId: string, now = new Date()): Promise<SlotView[]> {
    const zone = await this.db.deliveryZone.findFirst({ where: { id: zoneId, active: true } });
    if (!zone) throw new ApiProblem(404, "NOT_FOUND", "Delivery zone not found.");
    type Row = { id:string; zoneId:string; startsAt:Date; endsAt:Date; capacity:number; booked:bigint };
    const rows = await this.db.$queryRaw<Row[]>`SELECT s.id,s."zoneId",s."startsAt",s."endsAt",s.capacity,
      count(b.id) FILTER (WHERE b.state='active') AS booked
      FROM "DeliverySlot" s LEFT JOIN "DeliverySlotBooking" b ON b."slotId"=s.id
      WHERE s."zoneId"=${zoneId} AND s.active AND s."startsAt">${now}
      GROUP BY s.id,s."zoneId",s."startsAt",s."endsAt",s.capacity ORDER BY s."startsAt",s.id`;
    return rows.map((s) => ({
      id: s.id, zoneId: s.zoneId,
      date: s.startsAt.toISOString().slice(0,10),
      window: `${s.startsAt.toISOString().slice(11,16)}–${s.endsAt.toISOString().slice(11,16)}`,
      capacity: s.capacity, booked: Number(s.booked),
    }));
  }

  async requireZone(tx: Prisma.TransactionClient, zoneId: string): Promise<DeliveryZone> {
    const zone = await tx.deliveryZone.findFirst({ where: { id: zoneId, active: true } });
    if (!zone) throw new ApiProblem(400, "VALIDATION_FAILED", "Delivery zone is unavailable.");
    return zone;
  }

  async lockAndBookSlot(
    tx: Prisma.TransactionClient,
    input: BookSlotInput,
    context: DeliveryOperationContext,
  ): Promise<DeliverySlotBooking> {
    await this.requireZone(tx, input.zoneId);
    const [slot] = await tx.$queryRaw<DeliverySlot[]>`SELECT * FROM "DeliverySlot" WHERE id=${input.slotId} FOR UPDATE`;
    if (!slot || !slot.active || slot.zoneId !== input.zoneId || slot.startsAt <= input.now || slot.endsAt <= input.now)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Delivery slot is unavailable for this zone.");
    const existing = await tx.deliverySlotBooking.findUnique({ where: { orderId: input.orderId } });
    if (existing) {
      if (existing.state === "active" && existing.slotId === input.slotId) return existing;
      throw new ApiProblem(409, "CONFLICT", "This order already has a delivery slot booking.");
    }
    const active = await tx.deliverySlotBooking.count({ where: { slotId: slot.id, state: "active" } });
    if (active >= slot.capacity)
      throw new ApiProblem(409, "CONFLICT", "Delivery slot capacity is no longer available.");
    const booking = await tx.deliverySlotBooking.create({ data: { orderId: input.orderId, slotId: slot.id } });
    await tx.auditEvent.create({ data: {
      actorId: context.actorId, action: "delivery.slot_booked", entityId: input.orderId,
      requestId: context.requestId, details: { slotId: slot.id, zoneId: input.zoneId },
    } });
    await tx.outboxEvent.create({ data: {
      type: "delivery.slot_booked", aggregateId: input.orderId,
      payload: { orderId: input.orderId, slotId: slot.id, zoneId: input.zoneId },
    } });
    return booking;
  }

  async releaseBooking(
    tx: Prisma.TransactionClient,
    orderId: string,
    context: DeliveryOperationContext,
  ): Promise<number> {
    const changed = await tx.deliverySlotBooking.updateManyAndReturn({
      where: { orderId, state: "active" }, data: { state: "released", releasedAt: new Date() },
      select: { id: true, slotId: true },
    });
    if (!changed.length) return 0;
    await tx.auditEvent.create({ data: {
      actorId: context.actorId, action: "delivery.slot_released", entityId: orderId,
      requestId: context.requestId, details: { bookingId: changed[0].id, slotId: changed[0].slotId },
    } });
    await tx.outboxEvent.create({ data: {
      type: "delivery.slot_released", aggregateId: orderId,
      payload: { orderId, bookingId: changed[0].id, slotId: changed[0].slotId },
    } });
    return changed.length;
  }
}
