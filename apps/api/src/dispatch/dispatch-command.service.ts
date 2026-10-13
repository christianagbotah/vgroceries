import { Injectable } from "@nestjs/common";
import {
  dispatchActionResponseSchema,
  type DispatchActionResponse,
  type ProductionDispatchAssignRequest,
  type ProductionDispatchReassignRequest,
  type ProductionDispatchUnassignRequest,
  type ProductionDispatchRescheduleRequest,
  type ProductionDispatchReturnRequest,
  type ProductionDispatchReturnedRequest,
  type DispatchProviderTransitionRequest,
  type RiderAvailabilityRequest,
} from "@variety/contracts";
import { Prisma, type DeliveryJob } from "@prisma/client";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { DispatchEventService } from "./dispatch-event.service";
import { DispatchPolicyService } from "./dispatch-policy.service";
import { ManualProviderService } from "./manual-provider.service";
import {
  DISPATCH_OPERATION,
  dispatchCommandHash,
  normalizeDispatchNote,
  normalizeFailureReason,
  normalizeProof,
  type DispatchCommandContext,
  validateDispatchContext,
} from "./dispatch.values";

type AssignmentInput = ProductionDispatchAssignRequest | ProductionDispatchReassignRequest;
type Tx = Prisma.TransactionClient;
const ACTIVE_RIDER_STATUSES = ["assigned", "accepted", "picked_up", "out_for_delivery", "failed", "rescheduled"];

function conflict(message: string): never { throw new ApiProblem(409, "CONFLICT", message); }
function notFound(message: string): never { throw new ApiProblem(404, "NOT_FOUND", message); }
function rule(message: string): never { throw new ApiProblem(422, "RULE_VIOLATION", message); }

@Injectable()
export class DispatchCommandService {
  constructor(
    private readonly db: Database,
    private readonly policy: DispatchPolicyService,
    private readonly events: DispatchEventService,
    private readonly manualProvider: ManualProviderService = new ManualProviderService(),
  ) {}

  private async advisory(tx: Tx, context: DispatchCommandContext) {
    const key = JSON.stringify([context.actorId, DISPATCH_OPERATION, context.idempotencyKey]);
    await tx.$queryRaw<Array<{ locked: number }>>`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  private async execute<T extends object>(
    action: string,
    entityId: string,
    body: unknown,
    context: DispatchCommandContext,
    parse: (value: Prisma.JsonValue) => T,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    validateDispatchContext(context);
    if (!entityId?.trim()) throw new ApiProblem(400, "VALIDATION_FAILED", "Dispatch entity identity is required.");
    const requestHash = dispatchCommandHash({ action, entityId, body });
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, context);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId: context.actorId, operation: DISPATCH_OPERATION, key: context.idempotencyKey } } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different dispatch command.");
        return parse(replay.outcome);
      }
      const outcome = await work(tx);
      await tx.idempotency.create({ data: { actorId: context.actorId, operation: DISPATCH_OPERATION, key: context.idempotencyKey, requestHash, outcome: outcome as Prisma.InputJsonValue } });
      return outcome;
    }, { timeout: 15_000 });
  }

  private parseAction(value: Prisma.JsonValue): DispatchActionResponse {
    const parsed = dispatchActionResponseSchema.safeParse(value);
    if (!parsed.success) conflict("Dispatch command replay state is incomplete.");
    return parsed.data;
  }

  private actionResponse(job: DeliveryJob): DispatchActionResponse {
    const decision = this.policy.adminJobDecision(job);
    return dispatchActionResponseSchema.parse({ jobId: job.id, orderId: job.orderId, deliveryStatus: job.status, custodyState: job.custodyState, allowedActions: decision.allowedActions, blockers: decision.blockers });
  }

  private async lockOrderForJob(tx: Tx, jobId: string): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT o.id FROM "Order" o JOIN "DeliveryJob" j ON j."orderId"=o.id
      WHERE j.id=${jobId} FOR UPDATE OF o
    `;
    if (!rows[0]) notFound("Delivery job not found.");
    return rows[0].id;
  }

  private async lockJob(tx: Tx, jobId: string) {
    await tx.$queryRaw`SELECT id FROM "DeliveryJob" WHERE id=${jobId} FOR UPDATE`;
    const job = await tx.deliveryJob.findUnique({ where: { id: jobId } });
    if (!job) notFound("Delivery job not found.");
    return job;
  }

  private async lockOrderJob(tx: Tx, orderId: string) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { fulfilmentRun: true } });
    if (!order) notFound("Order not found.");
    await tx.$queryRaw`SELECT id FROM "DeliveryJob" WHERE "orderId"=${orderId} FOR UPDATE`;
    const job = await tx.deliveryJob.findUnique({ where: { orderId } });
    return { order, job };
  }

  private async lockAssignmentTarget(tx: Tx, input: AssignmentInput, currentJobId?: string) {
    if (input.riderProfileId) {
      await tx.$queryRaw`SELECT id FROM "RiderProfile" WHERE id=${input.riderProfileId} FOR UPDATE`;
      const profile = await tx.riderProfile.findUnique({ where: { id: input.riderProfileId }, include: { user: true } });
      if (!profile || profile.user.role !== "rider") notFound("Rider profile not found.");
      await tx.$queryRaw`
        SELECT id FROM "DeliveryJob" WHERE "riderProfileId"=${profile.id}
        AND (${currentJobId ?? null}::text IS NULL OR id <> ${currentJobId ?? null})
        AND (status IN ('assigned','accepted','picked_up','out_for_delivery','failed','rescheduled') OR (status='return_to_store' AND "returnedToStoreAt" IS NULL))
        FOR UPDATE
      `;
      const active = await tx.deliveryJob.findFirst({ where: {
        riderProfileId: profile.id,
        ...(currentJobId ? { id: { not: currentJobId } } : {}),
        OR: [{ status: { in: ACTIVE_RIDER_STATUSES } }, { status: "return_to_store", returnedToStoreAt: null }],
      } });
      this.policy.assertRiderAssignable({ availabilityState: profile.availabilityState as "available" | "offline", userActive: profile.user.active, hasActiveJob: Boolean(active) });
      return { assignmentKind: "rider", riderProfileId: profile.id, providerKey: null, providerNameSnapshot: null, manualProviderReference: null } as const;
    }
    if (!input.manualProvider) rule("A rider or manual provider target is required.");
    return {
      assignmentKind: "manual_provider",
      riderProfileId: null,
      providerKey: input.manualProvider.providerKey.trim(),
      providerNameSnapshot: (input.manualProvider.providerName ?? input.manualProvider.providerKey).trim(),
      manualProviderReference: input.manualProvider.reference?.trim() ?? null,
    } as const;
  }

  async assign(orderId: string, input: ProductionDispatchAssignRequest, context: DispatchCommandContext) {
    const note = normalizeDispatchNote(input.note);
    return this.execute("assign", orderId, { ...input, note }, context, (v) => this.parseAction(v), async (tx) => {
      const { order, job: existing } = await this.lockOrderJob(tx, orderId);
      this.policy.assertDispatchEligible(order, order.fulfilmentRun);
      if (existing && existing.status !== "unassigned") conflict("Order already has an active delivery assignment.");
      const target = await this.lockAssignmentTarget(tx, input, existing?.id);
      const data = { ...target, status: "assigned", custodyState: "dispatch", assignedBy: context.actorId, assignedAt: new Date(), acceptedAt: null, pickedUpAt: null, outForDeliveryAt: null, deliveredAt: null, failedAt: null, failureReasonCode: null, failureNote: null, rescheduledFor: null, returnedToStoreAt: null };
      const job = existing
        ? await tx.deliveryJob.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
        : await tx.deliveryJob.create({ data: { orderId, ...data } });
      await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: "assigned", version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "staff", actorId: context.actorId, action: "assigned", fromStatus: existing?.status ?? "unassigned", toStatus: "assigned", note, safeMetadata: { assignmentKind: target.assignmentKind, riderProfileId: target.riderProfileId, providerKey: target.providerKey }, requestId: context.requestId });
      return this.actionResponse(job);
    });
  }

  async unassign(jobId: string, input: ProductionDispatchUnassignRequest, context: DispatchCommandContext) {
    const note = normalizeDispatchNote(input.note);
    return this.execute("unassign", jobId, { note }, context, (v) => this.parseAction(v), async (tx) => {
      const orderId = await this.lockOrderForJob(tx, jobId);
      const job = await this.lockJob(tx, jobId);
      if (job.status === "unassigned") conflict("Delivery job is already unassigned.");
      if (!this.policy.canReassign(job)) conflict("Delivery custody is not safe for unassignment.");
      const updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "unassigned", version: { increment: 1 } } });
      await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: "unassigned", version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "staff", actorId: context.actorId, action: "unassigned", fromStatus: job.status, toStatus: "unassigned", note, safeMetadata: {}, requestId: context.requestId });
      return this.actionResponse(updated);
    });
  }

  async reassign(jobId: string, input: ProductionDispatchReassignRequest, context: DispatchCommandContext) {
    const note = normalizeDispatchNote(input.note);
    return this.execute("reassign", jobId, { ...input, note }, context, (v) => this.parseAction(v), async (tx) => {
      const orderId = await this.lockOrderForJob(tx, jobId);
      const job = await this.lockJob(tx, jobId);
      if (!this.policy.canReassign(job)) conflict("Delivery custody is not safe for reassignment.");
      const target = await this.lockAssignmentTarget(tx, input, job.id);
      const updated = await tx.deliveryJob.update({ where: { id: job.id }, data: {
        ...target, status: "assigned", custodyState: "dispatch", assignedBy: context.actorId, assignedAt: new Date(),
        acceptedAt: null, pickedUpAt: null, outForDeliveryAt: null, deliveredAt: null, failedAt: null,
        failureReasonCode: null, failureNote: null, rescheduledFor: null, returnedToStoreAt: null, version: { increment: 1 },
      } });
      await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: "assigned", version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "staff", actorId: context.actorId, action: "reassigned", fromStatus: job.status, toStatus: "assigned", note, safeMetadata: { assignmentKind: target.assignmentKind, riderProfileId: target.riderProfileId, providerKey: target.providerKey }, requestId: context.requestId });
      return this.actionResponse(updated);
    });
  }

  async reschedule(jobId: string, input: ProductionDispatchRescheduleRequest, context: DispatchCommandContext) {
    const note = normalizeDispatchNote(input.note);
    const when = new Date(input.when);
    if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now())
      throw new ApiProblem(400, "VALIDATION_FAILED", "Reschedule time must be a future UTC timestamp.");
    return this.execute("reschedule", jobId, { when: when.toISOString(), note }, context, (v) => this.parseAction(v), async (tx) => {
      const orderId = await this.lockOrderForJob(tx, jobId);
      const job = await this.lockJob(tx, jobId);
      if (job.status !== "failed") rule("Only a failed delivery can be rescheduled.");
      const updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "rescheduled", rescheduledFor: when, version: { increment: 1 } } });
      await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: "rescheduled", version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "staff", actorId: context.actorId, action: "rescheduled", fromStatus: job.status, toStatus: "rescheduled", note, safeMetadata: { rescheduledFor: when.toISOString() }, requestId: context.requestId });
      return this.actionResponse(updated);
    });
  }

  async returnToStore(jobId: string, input: ProductionDispatchReturnRequest, context: DispatchCommandContext) {
    const note = normalizeDispatchNote(input.note);
    return this.execute("return_to_store", jobId, { note }, context, (v) => this.parseAction(v), async (tx) => {
      const orderId = await this.lockOrderForJob(tx, jobId);
      const job = await this.lockJob(tx, jobId);
      if (!["failed", "rescheduled"].includes(job.status) || !["rider", "provider"].includes(job.custodyState))
        rule("Only failed/rescheduled goods still in rider/provider custody can be instructed to return.");
      const updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "return_to_store", custodyState: "return_pending", returnedToStoreAt: null, version: { increment: 1 } } });
      await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: "return_to_store", version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "staff", actorId: context.actorId, action: "return_to_store", fromStatus: job.status, toStatus: "return_to_store", note, safeMetadata: { custodyState: "return_pending" }, requestId: context.requestId });
      return this.actionResponse(updated);
    });
  }

  async receiveReturnedGoods(jobId: string, input: ProductionDispatchReturnedRequest, context: DispatchCommandContext) {
    const note = normalizeDispatchNote(input.note);
    return this.execute("receive_returned_goods", jobId, { note }, context, (v) => this.parseAction(v), async (tx) => {
      const orderId = await this.lockOrderForJob(tx, jobId);
      const job = await this.lockJob(tx, jobId);
      if (job.status !== "return_to_store" || job.custodyState !== "return_pending" || job.returnedToStoreAt)
        rule("Delivery is not awaiting physical return receipt.");
      const receivedAt = new Date();
      const updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { custodyState: "store_returned", returnedToStoreAt: receivedAt, version: { increment: 1 } } });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "staff", actorId: context.actorId, action: "returned_goods_received", fromStatus: job.status, toStatus: job.status, note, safeMetadata: { custodyState: "store_returned", returnedAt: receivedAt.toISOString() }, requestId: context.requestId });
      return this.actionResponse(updated);
    });
  }

  async manualProviderTransition(jobId: string, input: DispatchProviderTransitionRequest, context: DispatchCommandContext) {
    const note = normalizeDispatchNote(input.note);
    const failureReason = input.failureReason ? normalizeFailureReason(input.failureReason) : null;
    const proof = input.proof ? normalizeProof(input.proof) : null;
    return this.execute("manual_provider_transition", jobId, { ...input, note, failureReason, proof }, context, (v) => this.parseAction(v), async (tx) => {
      const orderId = await this.lockOrderForJob(tx, jobId);
      const job = await this.lockJob(tx, jobId);
      this.manualProvider.assertTransition(job, input.action);
      const now = new Date();
      let updated: DeliveryJob;
      if (input.action === "picked_up") {
        updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "picked_up", custodyState: "provider", pickedUpAt: now, version: { increment: 1 } } });
      } else if (input.action === "out_for_delivery") {
        updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "out_for_delivery", custodyState: "provider", outForDeliveryAt: now, version: { increment: 1 } } });
      } else if (input.action === "failed") {
        if (!failureReason) rule("Failure reason is required.");
        updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "failed", failedAt: now, failureReasonCode: failureReason, failureNote: note, version: { increment: 1 } } });
      } else {
        if (!proof) rule("Proof is required for delivery completion.");
        await tx.deliveryProof.create({ data: { deliveryJobId: job.id, method: proof.method, reference: proof.reference, note: proof.note, recordedByKind: "staff", recordedById: context.actorId, recordedAt: now } });
        updated = await tx.deliveryJob.update({ where: { id: job.id }, data: { status: "delivered", custodyState: "customer", deliveredAt: now, version: { increment: 1 } } });
      }
      const orderData = input.action === "delivered"
        ? { deliveryStatus: "delivered", fulfilmentStatus: "delivered", version: { increment: 1 } }
        : { deliveryStatus: updated.status, version: { increment: 1 } };
      await tx.order.update({ where: { id: orderId }, data: orderData });
      await this.events.recordTransition(tx, { deliveryJobId: job.id, orderId, actorKind: "staff", actorId: context.actorId, action: `provider_${input.action}`, fromStatus: job.status, toStatus: updated.status, note, safeMetadata: { providerKey: job.providerKey, proofMethod: proof?.method ?? null, failureReason }, requestId: context.requestId });
      return this.actionResponse(updated);
    });
  }

  async setRiderAvailability(riderProfileId: string, input: RiderAvailabilityRequest, context: DispatchCommandContext) {
    const parse = (value: Prisma.JsonValue) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) conflict("Rider availability replay state is incomplete.");
      const row = value as Record<string, Prisma.JsonValue>;
      if (row.riderProfileId !== riderProfileId || !["available", "offline"].includes(String(row.availability))) conflict("Rider availability replay state is incomplete.");
      return { riderProfileId, availability: String(row.availability) as "available" | "offline" };
    };
    return this.execute("set_rider_availability", riderProfileId, input, context, parse, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RiderProfile" WHERE id=${riderProfileId} FOR UPDATE`;
      const profile = await tx.riderProfile.findUnique({ where: { id: riderProfileId }, include: { user: true } });
      if (!profile || profile.user.role !== "rider") notFound("Rider profile not found.");
      if (input.availability === "available" && !profile.user.active) rule("Inactive rider cannot be made available.");
      await tx.riderProfile.update({ where: { id: riderProfileId }, data: { availabilityState: input.availability, lastAvailabilityChangedAt: new Date(), version: { increment: 1 } } });
      await tx.auditEvent.create({ data: { actorId: context.actorId, action: "rider.availability", entityId: riderProfileId, requestId: context.requestId, details: { availability: input.availability } } });
      await tx.outboxEvent.create({ data: { type: "rider.availability", aggregateId: riderProfileId, payload: { availability: input.availability } } });
      return { riderProfileId, availability: input.availability };
    });
  }
}
