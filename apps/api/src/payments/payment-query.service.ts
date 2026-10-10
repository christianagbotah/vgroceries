import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { electronicPaymentMethodSchema } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

const ATTEMPT_STATES = new Set(["initiated", "pending", "succeeded", "failed", "expired"]);
const SETTLEMENT_STATES = new Set(["unsettled", "settled", "reconciled", "exception"]);

function integerQuery(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : null;
}

function dateQuery(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 64) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

@Injectable()
export class PaymentQueryService {
  constructor(private readonly db: Database) {}

  async list(query: Record<string, unknown>) {
    const page = integerQuery(query.page, 1, 1_000_000);
    const perPage = integerQuery(query.perPage, 25, 100);
    if (page === null || perPage === null)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid payment pagination.");

    const status = query.status;
    if (status !== undefined && (typeof status !== "string" || !ATTEMPT_STATES.has(status)))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid payment status filter.");
    const settlementState = query.settlementState;
    if (settlementState !== undefined && (typeof settlementState !== "string" || !SETTLEMENT_STATES.has(settlementState)))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid settlement state filter.");
    const provider = query.provider;
    if (provider !== undefined && (typeof provider !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(provider)))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid provider filter.");
    const method = query.method;
    if (method !== undefined && (typeof method !== "string" || !electronicPaymentMethodSchema.safeParse(method).success))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid payment method filter.");
    const orderReference = query.orderReference;
    if (orderReference !== undefined && (typeof orderReference !== "string" || orderReference.length < 1 || orderReference.length > 128))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid order reference filter.");
    const from = dateQuery(query.from);
    const to = dateQuery(query.to);
    if (from === null || to === null || (from && to && from > to))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid payment date range.");

    const where: Prisma.PaymentAttemptWhereInput = {
      ...(status ? { status: status as string } : {}),
      ...(settlementState ? { settlementState: settlementState as string } : {}),
      ...(provider ? { provider: provider as string } : {}),
      ...(method ? { method: method as string } : {}),
      ...(orderReference ? { order: { reference: orderReference as string } } : {}),
      ...((from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const [total, rows] = await this.db.$transaction([
      this.db.paymentAttempt.count({ where }),
      this.db.paymentAttempt.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        include: { order: { select: { reference: true } } },
      }),
    ]);

    return {
      page,
      perPage,
      total,
      items: rows.map((row) => ({
        attemptId: row.id,
        orderId: row.orderId,
        orderReference: row.order.reference,
        provider: row.provider,
        method: row.method,
        currency: row.currency,
        amountMinor: row.amountMinor,
        status: row.status,
        initiationState: row.initiationState,
        settlementState: row.settlementState,
        callbackCount: row.callbackCount,
        ...(row.providerRef ? { providerReference: row.providerRef } : {}),
        ...(row.failureReason ? { failureReason: row.failureReason } : {}),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        ...(row.resolvedAt ? { resolvedAt: row.resolvedAt.toISOString() } : {}),
      })),
    };
  }
}
