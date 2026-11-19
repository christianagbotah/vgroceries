import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  codSupervisorCountRequestSchema, codSupervisorCountViewSchema,
  type CodSupervisorCountRequest, type CodSupervisorCountView,
} from "@variety/contracts";
import { Database } from "../database/database";
import { API_CONFIG, type ApiConfig } from "../config";
import { ApiProblem } from "../http/errors";

const operation = "cod.supervisor_independent_count";
const canonical = (data: CodSupervisorCountRequest) => ({
  amountMinor: data.amountMinor, physicalCashPresentConfirmed: true,
  independentCountConfirmed: true, note: data.note.trim(),
});
const payloadHash = (declarationId: string, data: CodSupervisorCountRequest) =>
  createHash("sha256").update(JSON.stringify({ declarationId, data: canonical(data) })).digest("hex");

type CountRow = { id: string; declarationId: string; sequence: number;
  amountMinor: number; createdAt: Date };
function view(row: CountRow, status: CodSupervisorCountView["status"]): CodSupervisorCountView {
  return codSupervisorCountViewSchema.parse({
    id: row.id, declarationId: row.declarationId, sequence: row.sequence,
    amountMinor: row.amountMinor, recordedAt: row.createdAt.toISOString(),
    status, cashAccepted: false, paymentStatusChanged: false, remitted: false,
  });
}

/**
 * D2 only: independent, append-only human statements about cash physically
 * counted. Even two matching statements are NOT business cash acceptance,
 * customer payment, rider debt settlement, or remittance.
 *
 * D3 physical transfer/custody and D4 finance authority do not exist here.
 * Default-disabled in every environment.
 */
@Injectable()
export class CodSupervisorCountService {
  constructor(private readonly db: Database, @Inject(API_CONFIG) private readonly cfg: ApiConfig) {}

  async observe(
    actorId: string, declarationId: string, key: string, requestId: string,
    raw: CodSupervisorCountRequest,
  ): Promise<CodSupervisorCountView> {
    if (!this.cfg.codCashDeclarationsEnabled || !this.cfg.codSupervisorCountEnabled)
      throw new ApiProblem(503, "COD_SUPERVISOR_COUNT_DISABLED", "Independent COD counting is disabled.");
    const parsed = codSupervisorCountRequestSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Physical cash count input is invalid.");
    if (!actorId || !declarationId || !requestId || !/^[A-Za-z0-9:_-]{8,128}$/.test(key))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Authenticated reviewer, declaration and replay key are required.");
    const input = canonical(parsed.data);
    const requestHash = payloadHash(declarationId, parsed.data);
    return this.db.$transaction(async tx => {
      // Actor-key lock enables safe original-response replay even after the
      // second reviewer later submits their independent observation.
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(
        hashtextextended(${JSON.stringify([actorId, operation, key])}, 0))`;
      const prior = await tx.idempotency.findUnique({ where: {
        actorId_operation_key: {actorId, operation, key},
      } });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "This replay key belongs to a different cash count.");
        return codSupervisorCountViewSchema.parse(prior.outcome);
      }
      // All reviewers of one declaration serialize on its immutable row.
      const locked = await tx.$queryRaw<Array<{id:string}>>`
        SELECT id FROM "CodCashDeclaration" WHERE id=${declarationId} FOR UPDATE`;
      if (!locked.length) throw new ApiProblem(404, "NOT_FOUND", "Rider declaration not found.");

      const [declaration, reviewer, counts] = await Promise.all([
        tx.codCashDeclaration.findUnique({ where:{id:declarationId},
          include:{order:true,deliveryJob:{include:{proof:true}}} }),
        tx.user.findUnique({ where:{id:actorId}, select:{id:true,role:true,active:true} }),
        tx.codSupervisorCount.findMany({ where:{declarationId}, orderBy:{sequence:"asc"} }),
      ]);
      if (!declaration || !reviewer || !reviewer.active || reviewer.role !== "admin" ||
          reviewer.id === declaration.declaredByUserId)
        throw new ApiProblem(403, "FORBIDDEN", "Only a distinct active administrator may count this cash.");
      const order = declaration.order, job = declaration.deliveryJob;
      if (!order || !job || !job.proof || job.status !== "delivered" ||
          !job.deliveredAt || job.custodyState !== "customer" ||
          order.fulfilment !== "delivery" || order.fulfilmentStatus !== "delivered" ||
          order.deliveryStatus !== "delivered" || order.paymentMethod !== "cash_on_delivery" ||
          order.paymentStatus !== "unpaid" || order.cancelledAt || !order.stockConsumedAt)
        throw new ApiProblem(409, "COD_COUNT_NOT_ELIGIBLE", "Only proven, unpaid COD rider declarations can be independently counted.");
      if (counts.length >= 2)
        throw new ApiProblem(409, "COD_REVIEW_FULL", "Two independent counts are already recorded. Escalate discrepancies.");
      if (counts.some(row => row.reviewerUserId === actorId))
        throw new ApiProblem(409, "COD_INDEPENDENCE_REQUIRED", "A different administrator must perform the second physical count.");

      const count = await tx.codSupervisorCount.create({data:{
        declarationId, reviewerUserId:actorId, sequence:counts.length+1,
        amountMinor:input.amountMinor, physicalCashPresentConfirmed:true,
        independentCountConfirmed:true, note:input.note, requestId,
      }});
      const status:CodSupervisorCountView["status"] = counts.length === 0
        ? "first_count_recorded_unverified"
        : counts[0].amountMinor === count.amountMinor && count.amountMinor === declaration.amountMinor
          ? "dual_count_agreed_unverified"
          : "count_disagreement_requires_review";
      await tx.auditEvent.create({data:{
        actorId, action:"cod.supervisor_cash_count_attested", entityId:count.id, requestId,
        details:{ declarationId, sequence:count.sequence, status,
          // Review results are not accepted cash or a payment event.
          cashAccepted:false, remitted:false, paymentStatusChanged:false } as Prisma.InputJsonValue,
      }});
      await tx.outboxEvent.create({data:{
        type:"cod.supervisor_cash_count_attested", aggregateId:declaration.orderId,
        payload:{declarationId, sequence:count.sequence, status, requestId} as Prisma.InputJsonValue,
      }});
      const result=view(count,status);
      await tx.idempotency.create({data:{actorId,operation,key,requestHash,
        outcome:result as Prisma.InputJsonValue,
      }});
      return result;
    }, { timeout:15000 });
  }
}
