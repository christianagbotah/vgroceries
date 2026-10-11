import { Injectable } from "@nestjs/common";
import {
  refundListQuerySchema,
  refundListResponseSchema,
  type RefundLedgerRow,
  type RefundListResponse,
} from "@variety/contracts";
import type { Prisma } from "@prisma/client";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

@Injectable()
export class RefundQueryService {
  constructor(private readonly db: Database) {}

  async list(query: unknown): Promise<RefundListResponse> {
    const parsed = refundListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid refund ledger query.", {
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
        ),
      });

    const input = parsed.data;
    const where: Prisma.RefundWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.method ? { method: input.method } : {}),
      ...(input.sourceType ? { sourceType: input.sourceType } : {}),
      ...(input.orderReference
        ? { order: { reference: { equals: input.orderReference, mode: "insensitive" } } }
        : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: new Date(input.from) } : {}),
              ...(input.to ? { lte: new Date(input.to) } : {}),
            },
          }
        : {}),
    };

    const [total, refunds] = await Promise.all([
      this.db.refund.count({ where }),
      this.db.refund.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.perPage,
        take: input.perPage,
        include: {
          order: { select: { id: true, reference: true } },
          paymentAttempt: { select: { amountMinor: true } },
          execution: {
            select: {
              status: true,
              reconciliationState: true,
              attemptCount: true,
              providerRefundReference: true,
              failureReason: true,
            },
          },
        },
      }),
    ]);

    const captureIds = [...new Set(refunds.map((refund) => refund.paymentAttemptId))];
    const [committedGroups, succeededGroups] = captureIds.length
      ? await Promise.all([
          this.db.refund.groupBy({
            by: ["paymentAttemptId"],
            where: { paymentAttemptId: { in: captureIds } },
            _sum: { amountMinor: true },
          }),
          this.db.refund.groupBy({
            by: ["paymentAttemptId"],
            where: { paymentAttemptId: { in: captureIds }, status: "succeeded" },
            _sum: { amountMinor: true },
          }),
        ])
      : [[], []];

    const committed = new Map(
      committedGroups.map((row) => [row.paymentAttemptId, row._sum.amountMinor ?? 0]),
    );
    const succeeded = new Map(
      succeededGroups.map((row) => [row.paymentAttemptId, row._sum.amountMinor ?? 0]),
    );

    const items: RefundLedgerRow[] = refunds.map((refund) => ({
      refundId: refund.id,
      orderId: refund.order.id,
      orderReference: refund.order.reference,
      paymentAttemptId: refund.paymentAttemptId,
      provider: refund.provider,
      method: refund.method as RefundLedgerRow["method"],
      currency: "GHS",
      captureAmountMinor: refund.paymentAttempt.amountMinor,
      refundAmountMinor: refund.amountMinor,
      alreadyRefundedMinor: succeeded.get(refund.paymentAttemptId) ?? 0,
      remainingRefundableMinor: Math.max(
        0,
        refund.paymentAttempt.amountMinor - (committed.get(refund.paymentAttemptId) ?? 0),
      ),
      status: refund.status as RefundLedgerRow["status"],
      sourceType: refund.sourceType as RefundLedgerRow["sourceType"],
      reason: refund.reason,
      requestedBy: refund.requestedBy,
      ...(refund.approvedBy ? { approvedBy: refund.approvedBy } : {}),
      ...(refund.execution
        ? {
            executionStatus: refund.execution.status as NonNullable<RefundLedgerRow["executionStatus"]>,
            reconciliationState:
              refund.execution.reconciliationState as NonNullable<
                RefundLedgerRow["reconciliationState"]
              >,
            attemptCount: refund.execution.attemptCount,
            ...(refund.execution.providerRefundReference
              ? { providerRefundReference: refund.execution.providerRefundReference }
              : {}),
          }
        : { attemptCount: 0 }),
      ...(refund.failureReason || refund.execution?.failureReason
        ? { failureReason: refund.failureReason ?? refund.execution!.failureReason! }
        : {}),
      createdAt: refund.createdAt.toISOString(),
      ...(refund.approvedAt ? { approvedAt: refund.approvedAt.toISOString() } : {}),
      ...(refund.resolvedAt ? { resolvedAt: refund.resolvedAt.toISOString() } : {}),
    }));

    return refundListResponseSchema.parse({
      page: input.page,
      perPage: input.perPage,
      total,
      items,
    });
  }
}
