import { Injectable } from "@nestjs/common";
import {
  riderAcceptRequestSchema,
  riderPickupRequestSchema,
  riderOutRequestSchema,
  riderDeliverRequestSchema,
  riderFailRequestSchema,
  riderNoteRequestSchema,
  riderAvailabilityRequestSchema,
  riderActionResponseSchema,
  type RiderAcceptRequest,
  type RiderPickupRequest,
  type RiderOutRequest,
  type RiderDeliverRequest,
  type RiderFailRequest,
  type RiderNoteRequest,
  type RiderAvailabilityRequest,
  type RiderActionResponse,
} from "@variety/contracts";
import { Prisma, type DeliveryJob } from "@prisma/client";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { DispatchEventService } from "./dispatch-event.service";
import { DispatchPolicyService } from "./dispatch-policy.service";
import {
  RIDER_OPERATION,
  dispatchCommandHash,
  normalizeDispatchNote,
  normalizeFailureReason,
  normalizeProof,
  validateDispatchContext,
} from "./dispatch.values";

export interface RiderCommandContext { requestId: string; idempotencyKey: string; }
type Tx = Prisma.TransactionClient;
function notFound(message: string): never { throw new ApiProblem(404, "NOT_FOUND", message); }
function rule(message: string): never { throw new ApiProblem(422, "RULE_VIOLATION", message); }
function validation(message: string): never { throw new ApiProblem(400, "VALIDATION_FAILED", message); }

@Injectable()
export class RiderCommandService {
  constructor(
    private readonly db: Database,
    private readonly policy: DispatchPolicyService,
    private readonly events: DispatchEventService,
  ) {}

  private parseInput<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) validation("Rider command input is invalid.");
    return parsed.data;
  }

  private async advisory(tx: Tx, userId: string, context: RiderCommandContext) {
    const key = JSON.stringify([userId, RIDER_OPERATION, context.idempotencyKey]);
    await tx.$queryRaw<Array<{ locked: number }>>`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  private parseAction(value: Prisma.JsonValue): RiderActionResponse {
    const parsed = riderActionResponseSchema.safeParse(value);
    if (!parsed.success) throw new ApiProblem(409, "CONFLICT", "Rider command replay state is incomplete.");
    return parsed.data;
  }

  private retryDue(job: DeliveryJob, custodyState: string): boolean {
    return job.status === "rescheduled" && job.custodyState === custodyState && Boolean(job.rescheduledFor) && job.rescheduledFor!.getTime() <= Date.now();
  }

  private actionResponse(job: DeliveryJob): RiderActionResponse {
    const decision = this.policy.riderJobDecision(job.status, job.custodyState, job.rescheduledFor);
    return riderActionResponseSchema.parse({
      jobId: job.id,
      orderId: job.orderId,
      deliveryStatus: job.status,
      allowedProofMethods: this.policy.allowedProofMethods(),
      allowedActions: decision.allowedActions,
      blockers: decision.blockers,
    });
  }

  private async lockOwnedJob(tx: Tx, userId: string, jobId: string) {
    const orderRows = await tx.$queryRaw<Array<{ orderId: string }>>`
      SELECT o.id AS "orderId" FROM "Order" o JOIN "DeliveryJob" j ON j."orderId"=o.id
      WHERE j.id=${jobId} FOR UPDATE OF o
    `;
    if (!orderRows[0]) notFound("Delivery job not found.");
    await tx.$queryRaw`SELECT rp.id FROM "RiderProfile" rp JOIN "User" u ON u.id=rp."userId" WHERE rp."userId"=${userId} FOR UPDATE OF rp`;
    const profile = await tx.riderProfile.findUnique({ where: { userId }, include: { user: true } });
    if (!profile || profile.user.role !== "rider" || !profile.user.active) notFound("Delivery job not found.");
    await tx.$queryRaw`SELECT id FROM "DeliveryJob" WHERE id=${jobId} FOR UPDATE`;
    const job = await tx.deliveryJob.findUnique({ where: { id: jobId } });
    if (!job) notFound("Delivery job not found.");
    if (job.assignmentKind !== "rider" || job.riderProfileId !== profile.id) notFound("Delivery job not found.");
    return { job, orderId: orderRows[0].orderId, profile };
  }

  private async executeJob(
    userId: string,
    jobId: string,
    action: string,
    body: unknown,
    context: RiderCommandContext,
    work: (tx: Tx, job: DeliveryJob, orderId: string) => Promise<RiderActionResponse>,
  ) {
    validateDispatchContext({ actorId: userId, requestId: context.requestId, idempotencyKey: context.idempotencyKey });
    const hash = dispatchCommandHash({ action, entityId: jobId, body });
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, userId, context);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId: userId, operation: RIDER_OPERATION, key: context.idempotencyKey } } });
      if (replay) {
        if (replay.requestHash !== hash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different rider command.");
        return this.parseAction(replay.outcome);
      }
      const { job, orderId } = await this.lockOwnedJob(tx, userId, jobId);
      const outcome = await work(tx, job, orderId);
      await tx.idempotency.create({ data: { actorId: userId, operation: RIDER_OPERATION, key: context.idempotencyKey, requestHash: hash, outcome: outcome as Prisma.InputJsonValue } });
      return outcome;
    }, { timeout: 15_000 });
  }

  async accept(userId: string, jobId: string, raw: RiderAcceptRequest, context: RiderCommandContext) {
    const input = this.parseInput(riderAcceptRequestSchema, raw);
    return this.executeJob(userId, jobId, "accept", input, context, async (tx, job, orderId) => {
      const retry = this.retryDue(job, "dispatch");
      if (!((job.status === "assigned" && job.custodyState === "dispatch") || retry)) rule("Delivery is not ready for rider acceptance.");
      const now = new Date();
      const updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "accepted", acceptedAt: now, ...(retry ? { failedAt: null, failureReasonCode: null, failureNote: null, rescheduledFor: null } : {}), version: { increment: 1 } } });
      await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: "accepted", version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "rider", actorId: userId, action: "accepted", fromStatus: job.status, toStatus: "accepted", requestId: context.requestId, safeMetadata: {} });
      return this.actionResponse(updated);
    });
  }

  async pickup(userId: string, jobId: string, raw: RiderPickupRequest, context: RiderCommandContext) {
    const input = this.parseInput(riderPickupRequestSchema, raw);
    const note = normalizeDispatchNote(input.note);
    return this.executeJob(userId, jobId, "pickup", { ...input, note }, context, async (tx, job, orderId) => {
      if (job.status !== "accepted" || job.custodyState !== "dispatch") rule("Delivery is not ready for rider pickup.");
      const now = new Date();
      const updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "picked_up", custodyState: "rider", pickedUpAt: now, version: { increment: 1 } } });
      await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: "picked_up", version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "rider", actorId: userId, action: "picked_up", fromStatus: job.status, toStatus: "picked_up", note, requestId: context.requestId, safeMetadata: { custodyState: "rider" } });
      return this.actionResponse(updated);
    });
  }

  async outForDelivery(userId: string, jobId: string, raw: RiderOutRequest, context: RiderCommandContext) {
    const input = this.parseInput(riderOutRequestSchema, raw);
    const note = normalizeDispatchNote(input.note);
    return this.executeJob(userId, jobId, "out_for_delivery", { ...input, note }, context, async (tx, job, orderId) => {
      const retry = this.retryDue(job, "rider");
      if (!((job.status === "picked_up" && job.custodyState === "rider") || retry)) rule("Delivery is not ready to leave for the customer.");
      const now = new Date();
      const updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "out_for_delivery", outForDeliveryAt: now, ...(retry ? { failedAt: null, failureReasonCode: null, failureNote: null, rescheduledFor: null } : {}), version: { increment: 1 } } });
      await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: "out_for_delivery", version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "rider", actorId: userId, action: "out_for_delivery", fromStatus: job.status, toStatus: "out_for_delivery", note, requestId: context.requestId, safeMetadata: {} });
      return this.actionResponse(updated);
    });
  }

  async deliver(userId: string, jobId: string, raw: RiderDeliverRequest, context: RiderCommandContext) {
    const input = this.parseInput(riderDeliverRequestSchema, raw);
    const proof = normalizeProof(input.proof);
    return this.executeJob(userId, jobId, "deliver", { proof }, context, async (tx, job, orderId) => {
      if (job.status !== "out_for_delivery" || job.custodyState !== "rider") rule("Delivery is not ready for completion.");
      const now = new Date();
      await tx.deliveryProof.create({ data: { deliveryJobId: job.id, method: proof.method, reference: proof.reference, note: proof.note, recordedByKind: "rider", recordedById: userId, recordedAt: now } });
      const updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "delivered", custodyState: "customer", deliveredAt: now, version: { increment: 1 } } });
      await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: "delivered", fulfilmentStatus: "delivered", version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "rider", actorId: userId, action: "delivered", fromStatus: job.status, toStatus: "delivered", note: proof.note, requestId: context.requestId, safeMetadata: { proofMethod: proof.method, custodyState: "customer" } });
      return this.actionResponse(updated);
    });
  }

  async fail(userId: string, jobId: string, raw: RiderFailRequest, context: RiderCommandContext) {
    const input = this.parseInput(riderFailRequestSchema, raw);
    const reason = normalizeFailureReason(input.reason);
    const note = normalizeDispatchNote(input.note);
    return this.executeJob(userId, jobId, "fail", { reason, note }, context, async (tx, job, orderId) => {
      if (!["accepted", "picked_up", "out_for_delivery"].includes(job.status)) rule("Delivery cannot fail from its current state.");
      const now = new Date();
      const updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "failed", failedAt: now, failureReasonCode: reason, failureNote: note, version: { increment: 1 } } });
      await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: "failed", version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "rider", actorId: userId, action: "failed", fromStatus: job.status, toStatus: "failed", note, requestId: context.requestId, safeMetadata: { failureReason: reason } });
      return this.actionResponse(updated);
    });
  }

  async note(userId: string, jobId: string, raw: RiderNoteRequest, context: RiderCommandContext) {
    const input = this.parseInput(riderNoteRequestSchema, raw);
    const note = normalizeDispatchNote(input.note)!;
    return this.executeJob(userId, jobId, "note", { note }, context, async (tx, job, orderId) => {
      const decision = this.policy.riderJobDecision(job.status, job.custodyState, job.rescheduledFor);
      if (!decision.allowedActions.includes("note")) rule("Notes are not accepted for this delivery state.");
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "rider", actorId: userId, action: "note", fromStatus: job.status, toStatus: job.status, note, requestId: context.requestId, safeMetadata: {} });
      return this.actionResponse(job);
    });
  }

  async setOwnAvailability(userId: string, raw: RiderAvailabilityRequest, context: RiderCommandContext) {
    const input = this.parseInput(riderAvailabilityRequestSchema, raw);
    validateDispatchContext({ actorId: userId, requestId: context.requestId, idempotencyKey: context.idempotencyKey });
    const hash = dispatchCommandHash({ action: "set_availability", entityId: userId, body: input });
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, userId, context);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId: userId, operation: RIDER_OPERATION, key: context.idempotencyKey } } });
      if (replay) {
        if (replay.requestHash !== hash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different rider command.");
        const value = replay.outcome as Record<string, Prisma.JsonValue>;
        return { riderProfileId: String(value.riderProfileId), availability: String(value.availability) as "available" | "offline" };
      }
      await tx.$queryRaw`SELECT rp.id FROM "RiderProfile" rp JOIN "User" u ON u.id=rp."userId" WHERE rp."userId"=${userId} FOR UPDATE OF rp`;
      const profile = await tx.riderProfile.findUnique({ where: { userId }, include: { user: true } });
      if (!profile || profile.user.role !== "rider" || !profile.user.active) notFound("Rider profile not found.");
      await tx.riderProfile.update({ where: { id: profile.id }, data: { availabilityState: input.availability, lastAvailabilityChangedAt: new Date(), version: { increment: 1 } } });
      const outcome = { riderProfileId: profile.id, availability: input.availability };
      await tx.auditEvent.create({ data: { actorId: userId, action: "rider.availability", entityId: profile.id, requestId: context.requestId, details: { availability: input.availability } } });
      await tx.outboxEvent.create({ data: { type: "rider.availability", aggregateId: profile.id, payload: { ...outcome, requestId: context.requestId } } });
      await tx.idempotency.create({ data: { actorId: userId, operation: RIDER_OPERATION, key: context.idempotencyKey, requestHash: hash, outcome } });
      return outcome;
    }, { timeout: 15_000 });
  }
}
