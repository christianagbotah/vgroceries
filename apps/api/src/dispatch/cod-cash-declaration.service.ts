import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  codCashDeclarationRequestSchema, codCashDeclarationViewSchema,
  type CodCashDeclarationRequest, type CodCashDeclarationView,
} from "@variety/contracts";
import { Database } from "../database/database";
import { API_CONFIG, type ApiConfig } from "../config";
import { ApiProblem } from "../http/errors";

const operation = "cod.rider_cash_declaration";
const canonical = (input: CodCashDeclarationRequest) => ({
  amountMinor: input.amountMinor,
  cashCountConfirmed: input.cashCountConfirmed,
  riderPossessionConfirmed: input.riderPossessionConfirmed,
  note: input.note.trim(),
});
const hash = (jobId: string, input: CodCashDeclarationRequest) =>
  createHash("sha256").update(JSON.stringify({jobId, input: canonical(input)})).digest("hex");

type Evidence = {id:string;deliveryJobId:string;orderId:string;amountMinor:number;createdAt:Date};
function view(row: Evidence): CodCashDeclarationView {
  return codCashDeclarationViewSchema.parse({
    id: row.id, deliveryJobId: row.deliveryJobId, orderId: row.orderId,
    amountMinor: row.amountMinor, declaredAt: row.createdAt.toISOString(),
    status: "rider_declared_unverified", supervisorVerified: false,
    remitted: false, paymentStatusChanged: false,
  });
}

/**
 * Captures a rider's immutable statement of physical cash counted and held.
 * This deliberately is NOT a verified payment, rider liability settlement,
 * audit-approved remittance, refund, revenue posting or payment-state update.
 */
@Injectable()
export class CodCashDeclarationService {
  constructor(private readonly db: Database, @Inject(API_CONFIG) private readonly cfg: ApiConfig) {}

  async declare(userId: string, jobId: string, key: string, requestId: string, raw: CodCashDeclarationRequest) {
    if (!this.cfg.codCashDeclarationsEnabled)
      throw new ApiProblem(503, "COD_DECLARATIONS_DISABLED", "COD cash declarations are not enabled.");
    const parsed = codCashDeclarationRequestSchema.safeParse(raw);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", "Cash declaration input is invalid.");
    if (!userId || !jobId || !requestId || !/^[A-Za-z0-9:_-]{8,128}$/.test(key))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Authenticated rider, job and replay key are required.");
    const input = canonical(parsed.data);
    const requestHash = hash(jobId, parsed.data);
    return this.db.$transaction(async tx => {
      // Lock the actor/key to make retries exact-once even under concurrency.
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(
        hashtextextended(${JSON.stringify([userId, operation, key])}, 0))`;
      const replay = await tx.idempotency.findUnique({where: {
        actorId_operation_key: {actorId:userId, operation, key},
      }});
      if (replay) {
        if (replay.requestHash !== requestHash)
          throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "This replay key was used for a different declaration.");
        const prior = replay.outcome as {declarationId?:string};
        if (!prior.declarationId) throw new ApiProblem(409, "CONFLICT", "Cash declaration replay is incomplete.");
        const declaration = await tx.codCashDeclaration.findUnique({where:{id:prior.declarationId}});
        if (!declaration) throw new ApiProblem(409, "CONFLICT", "Original cash declaration evidence is missing.");
        return view(declaration);
      }
      // Lock order before delivery job to align with dispatch/fulfilment lock order.
      const [locked] = await tx.$queryRaw<Array<{orderId:string}>>`
        SELECT o.id AS "orderId" FROM "Order" o
        JOIN "DeliveryJob" j ON j."orderId"=o.id
        WHERE j.id=${jobId} FOR UPDATE OF o`;
      if (!locked) throw new ApiProblem(404, "NOT_FOUND", "Delivery job not found.");
      await tx.$queryRaw`SELECT id FROM "DeliveryJob" WHERE id=${jobId} FOR UPDATE`;
      const [order, job, profile] = await Promise.all([
        tx.order.findUnique({where:{id:locked.orderId}}),
        tx.deliveryJob.findUnique({where:{id:jobId},include:{proof:true}}),
        tx.riderProfile.findUnique({where:{userId},include:{user:true}}),
      ]);
      if (!job || !order || !profile || !profile.user.active || profile.user.role !== "rider" ||
          job.riderProfileId !== profile.id || job.assignmentKind !== "rider")
        throw new ApiProblem(404, "NOT_FOUND", "Delivery job not found for this rider.");
      if (job.status !== "delivered" || job.custodyState !== "customer" || !job.deliveredAt || !job.proof ||
          order.fulfilment !== "delivery" || order.fulfilmentStatus !== "delivered" ||
          order.deliveryStatus !== "delivered" || !order.stockConsumedAt || order.cancelledAt ||
          order.paymentMethod !== "cash_on_delivery" || order.paymentStatus !== "unpaid")
        throw new ApiProblem(409, "COD_DELIVERY_NOT_ELIGIBLE", "Only a completed, proven, unpaid COD delivery can be declared.");
      if (input.amountMinor !== order.totalMinor)
        throw new ApiProblem(422, "COD_AMOUNT_MISMATCH", "Counted cash must equal the exact server-owned COD order total.");
      if (await tx.codCashDeclaration.findUnique({where:{deliveryJobId:jobId}}))
        throw new ApiProblem(409, "COD_ALREADY_DECLARED", "This delivery already has a cash declaration. Use the original request key to retry.");
      const created = await tx.codCashDeclaration.create({data: {
        deliveryJobId:job.id, orderId:order.id, riderProfileId:profile.id,
        declaredByUserId:userId, amountMinor:input.amountMinor,
        cashCountConfirmed:true, riderPossessionConfirmed:true,
        note:input.note, requestId,
      }});
      await tx.auditEvent.create({data: {
        actorId:userId, action:"cod.rider_cash_declared", entityId:created.id,
        requestId, details:{orderId:order.id,deliveryJobId:job.id,
          amountMinor:input.amountMinor,status:"rider_declared_unverified"} as Prisma.InputJsonValue,
      }});
      await tx.outboxEvent.create({data: {
        type:"cod.rider_cash_declared", aggregateId:order.id,
        payload:{declarationId:created.id,deliveryJobId:job.id,
          status:"rider_declared_unverified",requestId} as Prisma.InputJsonValue,
      }});
      await tx.idempotency.create({data:{actorId:userId,operation,key,requestHash,
        outcome:{declarationId:created.id} as Prisma.InputJsonValue,
      }});
      return view(created);
    }, {timeout:15000});
  }
}
