import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

export type DispatchCommandContext = {
  actorId: string;
  requestId: string;
  idempotencyKey: string;
};

export type AssignRiderInput = {
  orderId: string;
  riderId: string;
};

export type RiderActionInput = {
  action: "accept" | "pickup" | "out" | "deliver" | "fail" | "note";
  proofMethod?: "pin" | "signature" | "photo_note";
  proofDetail?: string;
  reason?: string;
  note?: string;
};

type DeliveryOutcome = {
  jobId: string;
  orderId: string;
  riderId: string;
  status: string;
};

const DISPATCH_ASSIGN_OPERATION = "dispatch.assign";
const RIDER_ACTION_OPERATION = "rider.job.action";
const ACTIVE_RIDER_STATUSES = [
  "assigned",
  "accepted",
  "picked_up",
  "out_for_delivery",
  "rescheduled",
];

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function notFound(): never {
  throw new ApiProblem(404, "NOT_FOUND", "Delivery job not found.");
}

@Injectable()
export class DispatchRiderService {
  constructor(private readonly db: Database) {}

  async queue() {
    const ready = await this.db.order.findMany({
      where: {
        fulfilment: "delivery",
        fulfilmentStatus: "dispatched",
        stockConsumedAt: { not: null },
        deliveryStatus: "unassigned",
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        reference: true,
        customerName: true,
        customerPhone: true,
        zoneId: true,
        deliveryStatus: true,
        createdAt: true,
      },
    });
    return {
      ready: ready.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
      })),
    };
  }

  private async advisory(
    tx: Prisma.TransactionClient,
    operation: string,
    context: DispatchCommandContext,
  ) {
    const lockKey = JSON.stringify([context.actorId, operation, context.idempotencyKey]);
    await tx.$queryRaw<Array<{ locked: number }>>`
      SELECT 1::int AS locked
      FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `;
  }

  private replay(outcome: Prisma.JsonValue): DeliveryOutcome {
    if (
      !outcome ||
      typeof outcome !== "object" ||
      Array.isArray(outcome) ||
      typeof (outcome as Record<string, unknown>).jobId !== "string" ||
      typeof (outcome as Record<string, unknown>).orderId !== "string" ||
      typeof (outcome as Record<string, unknown>).riderId !== "string" ||
      typeof (outcome as Record<string, unknown>).status !== "string"
    ) {
      throw new ApiProblem(409, "CONFLICT", "Delivery command replay state is incomplete.");
    }
    return outcome as DeliveryOutcome;
  }

  async assign(input: AssignRiderInput, context: DispatchCommandContext): Promise<DeliveryOutcome> {
    const requestHash = hash({ orderId: input.orderId, riderId: input.riderId });
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, DISPATCH_ASSIGN_OPERATION, context);
      const replay = await tx.idempotency.findUnique({
        where: {
          actorId_operation_key: {
            actorId: context.actorId,
            operation: DISPATCH_ASSIGN_OPERATION,
            key: context.idempotencyKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== requestHash)
          throw new ApiProblem(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was already used with a different dispatch assignment.",
          );
        return this.replay(replay.outcome);
      }

      // Order is the global lifecycle authority row. Lock it before any
      // dispatch state so cancellation/fulfilment/dispatch serialize safely.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${input.orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");
      if (
        order.fulfilment !== "delivery" ||
        order.fulfilmentStatus !== "dispatched" ||
        !order.stockConsumedAt
      ) {
        throw new ApiProblem(
          409,
          "DISPATCH_HANDOVER_REQUIRED",
          "Delivery assignment requires completed fulfilment handover.",
        );
      }
      if (order.deliveryStatus !== "unassigned")
        throw new ApiProblem(409, "ORDER_ALREADY_ASSIGNED", "Order already has delivery custody.");

      await tx.$queryRaw`SELECT id FROM "RiderProfile" WHERE "userId"=${input.riderId} FOR UPDATE`;
      const [profile, user] = await Promise.all([
        tx.riderProfile.findUnique({ where: { userId: input.riderId } }),
        tx.user.findUnique({ where: { id: input.riderId } }),
      ]);
      if (!profile || !user || !user.active || user.role !== "rider")
        throw new ApiProblem(404, "RIDER_NOT_FOUND", "Rider not found.");
      if (!profile.isAvailable)
        throw new ApiProblem(409, "RIDER_UNAVAILABLE", "Rider is not available for assignment.");

      const busy = await tx.deliveryJob.findFirst({
        where: {
          riderUserId: input.riderId,
          status: { in: ACTIVE_RIDER_STATUSES },
        },
        select: { id: true },
      });
      if (busy)
        throw new ApiProblem(409, "RIDER_BUSY", "Rider already has an active delivery job.");

      const job = await tx.deliveryJob.create({
        data: {
          orderId: order.id,
          assignmentKind: "rider",
          riderUserId: input.riderId,
          status: "assigned",
          assignedAt: new Date(),
          createdBy: context.actorId,
        },
      });
      await tx.deliveryJobEvent.create({
        data: {
          jobId: job.id,
          actorId: context.actorId,
          actorKind: "staff",
          action: "assigned",
          note: "Delivery custody assigned after fulfilment handover.",
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { deliveryStatus: "assigned", version: { increment: 1 } },
      });

      const outcome: DeliveryOutcome = {
        jobId: job.id,
        orderId: order.id,
        riderId: input.riderId,
        status: "assigned",
      };
      await tx.idempotency.create({
        data: {
          actorId: context.actorId,
          operation: DISPATCH_ASSIGN_OPERATION,
          key: context.idempotencyKey,
          requestHash,
          outcome,
        },
      });
      return outcome;
    }, { timeout: 15_000 });
  }

  async riderJobs(actorId: string) {
    const jobs = await this.db.deliveryJob.findMany({
      where: { riderUserId: actorId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      jobs: jobs.map((job) => ({
        id: job.id,
        orderId: job.orderId,
        status: job.status,
        assignedAt: job.assignedAt?.toISOString() ?? null,
      })),
    };
  }

  async riderJob(actorId: string, jobId: string) {
    const job = await this.db.deliveryJob.findFirst({
      where: { id: jobId, riderUserId: actorId },
    });
    if (!job) notFound();
    return {
      id: job.id,
      orderId: job.orderId,
      status: job.status,
      assignedAt: job.assignedAt?.toISOString() ?? null,
      acceptedAt: job.acceptedAt?.toISOString() ?? null,
      pickedUpAt: job.pickedUpAt?.toISOString() ?? null,
      outForDeliveryAt: job.outForDeliveryAt?.toISOString() ?? null,
      deliveredAt: job.deliveredAt?.toISOString() ?? null,
    };
  }

  async riderAction(
    actorId: string,
    jobId: string,
    input: RiderActionInput,
    context: DispatchCommandContext,
  ): Promise<DeliveryOutcome> {
    const owned = await this.db.deliveryJob.findFirst({
      where: { id: jobId, riderUserId: actorId },
      select: { orderId: true },
    });
    if (!owned) notFound();
    const requestHash = hash({ jobId, ...input });

    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, RIDER_ACTION_OPERATION, context);
      const replay = await tx.idempotency.findUnique({
        where: {
          actorId_operation_key: {
            actorId,
            operation: RIDER_ACTION_OPERATION,
            key: context.idempotencyKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== requestHash)
          throw new ApiProblem(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was already used with a different rider action.",
          );
        return this.replay(replay.outcome);
      }

      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${owned.orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "DeliveryJob" WHERE id=${jobId} FOR UPDATE`;
      const job = await tx.deliveryJob.findFirst({ where: { id: jobId, riderUserId: actorId } });
      if (!job) notFound();

      let next = job.status;
      let event = "note";
      const now = new Date();
      const jobData: Prisma.DeliveryJobUpdateInput = { version: { increment: 1 } };
      let orderDeliveryStatus: string | undefined;

      if (input.action === "accept") {
        if (job.status !== "assigned")
          throw new ApiProblem(409, "INVALID_DELIVERY_TRANSITION", "Job is not awaiting acceptance.");
        next = "accepted";
        event = "accepted";
        orderDeliveryStatus = "accepted";
        Object.assign(jobData, { status: next, acceptedAt: now });
      } else if (input.action === "pickup") {
        if (job.status !== "accepted")
          throw new ApiProblem(409, "INVALID_DELIVERY_TRANSITION", "Job must be accepted before pickup.");
        next = "picked_up";
        event = "picked_up";
        orderDeliveryStatus = "picked_up";
        Object.assign(jobData, { status: next, pickedUpAt: now });
      } else if (input.action === "out") {
        if (job.status !== "picked_up")
          throw new ApiProblem(409, "INVALID_DELIVERY_TRANSITION", "Job must be picked up first.");
        next = "out_for_delivery";
        event = "out_for_delivery";
        orderDeliveryStatus = "out_for_delivery";
        Object.assign(jobData, { status: next, outForDeliveryAt: now });
      } else if (input.action === "deliver") {
        if (job.status !== "out_for_delivery")
          throw new ApiProblem(409, "INVALID_DELIVERY_TRANSITION", "Job is not out for delivery.");
        if (!input.proofMethod || !input.proofDetail)
          throw new ApiProblem(400, "VALIDATION_FAILED", "Delivery proof is required.");
        next = "delivered";
        event = "delivered";
        orderDeliveryStatus = "delivered";
        Object.assign(jobData, {
          status: next,
          deliveredAt: now,
          proofMethod: input.proofMethod,
          proofDetail: input.proofDetail,
          proofAt: now,
        });
      } else if (input.action === "fail") {
        if (!ACTIVE_RIDER_STATUSES.includes(job.status))
          throw new ApiProblem(409, "INVALID_DELIVERY_TRANSITION", "Only an active job can fail.");
        next = "failed";
        event = "failed";
        orderDeliveryStatus = "failed";
        Object.assign(jobData, { status: next, failedAt: now, failureReason: input.reason ?? null });
      } else if (input.action === "note") {
        if (!input.note)
          throw new ApiProblem(400, "VALIDATION_FAILED", "A note is required.");
      }

      await tx.deliveryJob.update({ where: { id: job.id }, data: jobData });
      await tx.deliveryJobEvent.create({
        data: {
          jobId: job.id,
          actorId,
          actorKind: "rider",
          action: event,
          note: input.note ?? input.reason ?? null,
        },
      });
      if (orderDeliveryStatus) {
        await tx.order.update({
          where: { id: job.orderId },
          data: { deliveryStatus: orderDeliveryStatus, version: { increment: 1 } },
        });
      }

      const outcome: DeliveryOutcome = {
        jobId: job.id,
        orderId: job.orderId,
        riderId: actorId,
        status: next,
      };
      await tx.idempotency.create({
        data: {
          actorId,
          operation: RIDER_ACTION_OPERATION,
          key: context.idempotencyKey,
          requestHash,
          outcome,
        },
      });
      return outcome;
    }, { timeout: 15_000 });
  }
}
