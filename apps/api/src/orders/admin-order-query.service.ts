import { createHash } from "node:crypto";
import { orderNoteOutcomeSchema, type OrderNoteRequest } from "@variety/contracts";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AdminOrderDetail, AdminOrderFilters, AdminOrderRow } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { OrderProjectionService } from "./order-projection.service";

const money = (minor: number) => `₵${(minor / 100).toFixed(2)}`;

@Injectable()
export class AdminOrderQueryService {
  constructor(
    private readonly db: Database,
    private readonly projection: OrderProjectionService,
  ) {}

  async list(filters: AdminOrderFilters): Promise<AdminOrderRow[]> {
    const search = filters.q?.trim();
    const where: Prisma.OrderWhereInput = {
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.status ? { fulfilmentStatus: filters.status } : {}),
      ...(filters.payment ? { paymentStatus: filters.payment } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: "insensitive" } },
              { customerName: { contains: search, mode: "insensitive" } },
              { customerPhone: { contains: search, mode: "insensitive" } },
              { lines: { some: { OR: [{ productName: { contains: search, mode: "insensitive" } }, { variantName: { contains: search, mode: "insensitive" } }] } } },
            ],
          }
        : {}),
    };
    const rows = await this.db.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { _count: { select: { lines: true } } },
    });
    return rows.map((order) => ({
      id: order.id,
      reference: order.reference,
      channel: order.channel,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      fulfilment: order.fulfilment,
      totalLabel: money(order.totalMinor),
      paymentStatus: order.paymentStatus,
      fulfilmentStatus: order.fulfilmentStatus,
      deliveryStatus: order.deliveryStatus,
      lineCount: order._count.lines,
      createdAtLabel: order.createdAt.toISOString(),
    }));
  }

  async addNote(orderId:string,actorId:string,requestId:string,key:string,input:OrderNoteRequest){
    const operation="orders.admin.note",hash=createHash("sha256").update(JSON.stringify([orderId,input.note,input.internalOnly])).digest("hex");
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
      if(!await tx.order.findUnique({where:{id:orderId},select:{id:true}}))throw new ApiProblem(404,"NOT_FOUND","Order not found.");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId,operation,key])},0))`;
      const where={actorId_operation_key:{actorId,operation,key}};
      const previous=await tx.idempotency.findUnique({where});
      if(previous){
        if(previous.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","This request identity belongs to a different note.");
        return orderNoteOutcomeSchema.parse(previous.outcome);
      }
      const row=await tx.orderEvent.create({data:{orderId,actorKind:"staff",actorId,action:"order.note_added",note:input.note,customerSafe:!input.internalOnly}});
      const outcome={orderId,noteId:row.id,internalOnly:input.internalOnly};
      await tx.auditEvent.create({data:{actorId,requestId,entityId:orderId,action:"order.note_added",details:{noteId:row.id,internalOnly:input.internalOnly}}});
      await tx.idempotency.create({data:{actorId,operation,key,requestHash:hash,outcome}});
      return outcome;
    });
  }

  async detail(orderId: string): Promise<AdminOrderDetail> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: {
        deliveryAddress: true,
        zone: true,
        events: {where:{action:"order.note_added"},orderBy:[{createdAt:"asc"},{id:"asc"}]},
        refunds: { include: { execution: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });
    if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");

    const reservations = await this.db.reservation.findMany({
      where: { claimType: "order", claimId: orderId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { position: { select: { variantId: true } } },
    });
    const refunds: AdminOrderDetail["internal"]["refunds"] = order.refunds.map((refund) => ({
      id: refund.id,
      ...(refund.returnId ? { returnId: refund.returnId } : {}),
      orderId: refund.orderId,
      amountMinor: refund.amountMinor,
      amountLabel: money(refund.amountMinor),
      status: refund.status as AdminOrderDetail["internal"]["refunds"][number]["status"],
      method: refund.method as AdminOrderDetail["internal"]["refunds"][number]["method"],
      reason: refund.reason,
      requestedBy: refund.requestedBy,
      ...(refund.approvedBy ? { approvedBy: refund.approvedBy } : {}),
      ...(refund.execution?.providerRefundReference ? { providerRef: refund.execution.providerRefundReference } : {}),
      retryCount: refund.execution?.attemptCount ?? 0,
      createdAt: refund.createdAt.toISOString(),
      ...(refund.resolvedAt ? { resolvedAt: refund.resolvedAt.toISOString() } : {}),
      ...(refund.failureReason ? { note: refund.failureReason } : {}),
    }));

    const authors=await this.db.user.findMany({where:{id:{in:[...new Set(order.events.flatMap(e=>e.actorId?[e.actorId]:[]))]}},select:{id:true,name:true}});
    const names=new Map(authors.map(a=>[a.id,a.name]));
    return {
      order: await this.projection.publicOrder(orderId),
      internal: {
        ...(order.deliveryAddress
          ? {
              address: {
                id: order.deliveryAddress.orderId,
                label: order.deliveryAddress.label,
                recipientName: order.deliveryAddress.recipientName,
                phone: order.deliveryAddress.phone,
                locality: order.deliveryAddress.locality,
                street: order.deliveryAddress.street,
                ...(order.deliveryAddress.landmark ? { landmark: order.deliveryAddress.landmark } : {}),
                ...(order.deliveryAddress.ghanaPostGps ? { ghanaPostGps: order.deliveryAddress.ghanaPostGps } : {}),
              },
            }
          : {}),
        ...(order.zone ? { zone: { id: order.zone.id, name: order.zone.name } } : {}),
        ...(order.customerUserId ? { customerId: order.customerUserId } : {}),
        customerNotes: order.events.filter(e=>e.note).map(e=>({at:e.createdAt.toISOString(),by:names.get(e.actorId??"")??"Staff",text:e.note!,internalOnly:!e.customerSafe})),
        reservations: reservations.map((reservation) => ({
          id: reservation.id,
          quantity: reservation.quantity.toString(),
          expiresAt: reservation.expiresAt.toISOString(),
          variantId: reservation.position.variantId,
        })),
        suggestions: [],
        refunds,
      },
    };
  }
}
