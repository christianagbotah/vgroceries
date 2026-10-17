import { Injectable } from "@nestjs/common";
import {
  dispatchJobDetailResponseSchema,
  dispatchQueueResponseSchema,
  dispatchRiderDetailResponseSchema,
  dispatchRiderFleetResponseSchema,
  riderHistoryResponseSchema,
  riderJobResponseSchema,
  riderJobsResponseSchema,
  riderSelfResponseSchema,
  type DispatchListQuery,
  type DispatchJobDetailResponse,
  type DispatchRiderFleetResponse,
  type ProductionDispatchQueueResponse,
  type ProductionRiderHistoryResponse,
  type ProductionRiderJobResponse,
  type ProductionRiderJobsResponse,
  type ProductionRiderSelfResponse,
} from "@variety/contracts";
import { Prisma, type DeliveryJob, type DeliveryProof, type DeliveryEvent, type RiderProfile, type User } from "@prisma/client";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { DispatchPolicyService } from "./dispatch-policy.service";

const ACTIVE_RIDER_STATUSES = ["assigned", "accepted", "picked_up", "out_for_delivery", "failed", "rescheduled"];
const jobInclude = {
  riderProfile: { include: { user: true } },
  events: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  proof: true,
  order: {
    include: {
      zone: true,
      slot: true,
      fulfilmentRun: true,
      deliveryAddress: true,
      lines: { orderBy: { id: "asc" as const } },
    },
  },
} satisfies Prisma.DeliveryJobInclude;

type JobProjection = Prisma.DeliveryJobGetPayload<{ include: typeof jobInclude }>;
type ProfileProjection = RiderProfile & { user: User };

function missing(message: string): never { throw new ApiProblem(404, "NOT_FOUND", message); }

@Injectable()
export class DispatchQueryService {
  constructor(private readonly db: Database, private readonly policy: DispatchPolicyService) {}

  private activeWhere(profileId: string): Prisma.DeliveryJobWhereInput {
    return { riderProfileId: profileId, OR: [
      { status: { in: ACTIVE_RIDER_STATUSES } },
      { status: "return_to_store", returnedToStoreAt: null },
    ] };
  }

  private returnsInspectionMessage(job: { status: string; custodyState: string; returnedToStoreAt: Date | null } | null | undefined) {
    return job && ["return_to_store", "unassigned"].includes(job.status) && job.custodyState === "store_returned" && job.returnedToStoreAt
      ? "Returned to store — awaiting Returns inspection." as const
      : undefined;
  }

  private codDue(order: { paymentMethod: string; paymentStatus: string; totalMinor: number }) {
    return order.paymentMethod === "cash_on_delivery" && order.paymentStatus !== "succeeded" ? order.totalMinor : undefined;
  }

  private assignment(job: JobProjection | null) {
    if (!job || job.status === "unassigned") return undefined;
    if (job.assignmentKind === "rider") return {
      kind: "rider" as const,
      riderProfileId: job.riderProfileId ?? undefined,
      riderName: job.riderProfile?.user.name,
    };
    return {
      kind: "manual_provider" as const,
      providerKey: job.providerKey ?? undefined,
      providerName: job.providerNameSnapshot ?? undefined,
      manualProviderReference: job.manualProviderReference ?? undefined,
    };
  }

  private event(event: DeliveryEvent) {
    return { action: event.action, actorKind: event.actorKind as "staff" | "rider" | "system", actorId: event.actorId ?? undefined, at: event.createdAt.toISOString(), note: event.note ?? undefined };
  }

  private proof(proof: DeliveryProof | null) {
    if (!proof?.reference) return undefined;
    return { method: proof.method as "signature" | "photo_note", reference: proof.reference, note: proof.note ?? undefined };
  }

  async listDispatch(query: DispatchListQuery): Promise<ProductionDispatchQueueResponse> {
    const where: Prisma.OrderWhereInput = {
      fulfilment: "delivery",
      fulfilmentStatus: query.status === "delivered" ? "delivered" : "dispatched",
      cancelledAt: null,
      stockConsumedAt: { not: null },
      fulfilmentRun: { is: { handedOverAt: { not: null }, handoverKind: "dispatch" } },
      ...(query.status ? { deliveryStatus: query.status } : {}),
    };
    const [total, orders] = await this.db.$transaction([
      this.db.order.count({ where }),
      this.db.order.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.perPage, take: query.perPage, include: { zone: true, slot: true, fulfilmentRun: true, deliveryJob: { include: jobInclude } } }),
    ]);
    const items = orders.map((order) => {
      const job = order.deliveryJob;
      const decision = job ? this.policy.adminJobDecision(job) : { allowedActions: ["assign"] as const, blockers: [] as string[] };
      return {
        orderId: order.id, reference: order.reference, jobId: job?.id,
        customerName: order.customerName, customerPhone: order.customerPhone,
        zoneId: order.zoneId ?? undefined, zoneName: order.zone?.name,
        slotStartsAt: order.slot?.startsAt.toISOString(), handedOverAt: order.fulfilmentRun!.handedOverAt!.toISOString(),
        paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, codDueMinor: this.codDue(order),
        deliveryStatus: order.deliveryStatus, custodyState: job?.custodyState,
        assignment: this.assignment(job), failureReason: job?.failureReasonCode ?? undefined,
        rescheduledFor: job?.rescheduledFor?.toISOString(), returnsInspectionMessage: this.returnsInspectionMessage(job),
        allowedActions: [...decision.allowedActions], blockers: decision.blockers,
      };
    });
    return dispatchQueueResponseSchema.parse({ page: query.page, perPage: query.perPage, total, items });
  }

  async dispatchDetail(jobId: string): Promise<DispatchJobDetailResponse> {
    const job = await this.db.deliveryJob.findUnique({ where: { id: jobId }, include: jobInclude });
    if (!job) missing("Delivery job not found.");
    const decision = this.policy.adminJobDecision(job);
    return dispatchJobDetailResponseSchema.parse({
      orderId: job.orderId, reference: job.order.reference, jobId: job.id,
      deliveryStatus: job.status, custodyState: job.custodyState,
      customerName: job.order.customerName, customerPhone: job.order.customerPhone,
      paymentMethod: job.order.paymentMethod, paymentStatus: job.order.paymentStatus, codDueMinor: this.codDue(job.order),
      assignment: this.assignment(job), failureReason: job.failureReasonCode ?? undefined, failureNote: job.failureNote ?? undefined,
      rescheduledFor: job.rescheduledFor?.toISOString(), returnedToStoreAt: job.returnedToStoreAt?.toISOString(),
      returnsInspectionMessage: this.returnsInspectionMessage(job),
      proof: this.proof(job.proof), events: job.events.map((event) => this.event(event)), allowedActions: decision.allowedActions, blockers: decision.blockers,
    });
  }

  private async profileRow(profile: ProfileProjection) {
    const active = await this.db.deliveryJob.findFirst({ where: this.activeWhere(profile.id), orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
    const completedJobs = await this.db.deliveryJob.count({ where: { riderProfileId: profile.id, status: "delivered" } });
    return {
      riderProfileId: profile.id, userId: profile.userId, name: profile.user.name, phone: profile.phone,
      kind: profile.kind, vehicle: profile.vehicle, declaredAvailability: profile.availabilityState,
      effectiveAvailability: this.policy.effectiveRiderState({ availabilityState: profile.availabilityState, userActive: profile.user.active, hasActiveJob: Boolean(active) }),
      activeJobId: active?.id, completedJobs,
    };
  }

  async listRiders(): Promise<DispatchRiderFleetResponse> {
    const profiles = await this.db.riderProfile.findMany({ include: { user: true }, orderBy: [{ user: { name: "asc" } }, { id: "asc" }] });
    return dispatchRiderFleetResponseSchema.parse({ riders: await Promise.all(profiles.map((profile) => this.profileRow(profile))) });
  }

  async riderDetail(id: string) {
    const profile = await this.db.riderProfile.findUnique({ where: { id }, include: { user: true } });
    if (!profile) missing("Rider profile not found.");
    return dispatchRiderDetailResponseSchema.parse(await this.profileRow(profile));
  }

  private async riderProfile(userId: string): Promise<ProfileProjection> {
    const profile = await this.db.riderProfile.findUnique({ where: { userId }, include: { user: true } });
    if (!profile || profile.user.role !== "rider" || !profile.user.active) missing("Rider profile not found.");
    return profile;
  }

  async riderMe(userId: string): Promise<ProductionRiderSelfResponse> {
    const profile = await this.riderProfile(userId);
    const active = await this.db.deliveryJob.findFirst({ where: this.activeWhere(profile.id) });
    const effective = this.policy.effectiveRiderState({ availabilityState: profile.availabilityState, userActive: profile.user.active, hasActiveJob: Boolean(active) });
    return riderSelfResponseSchema.parse({
      riderProfileId: profile.id, userId: profile.userId, name: profile.user.name, phone: profile.phone, kind: profile.kind, vehicle: profile.vehicle,
      declaredAvailability: profile.availabilityState, effectiveAvailability: effective, activeJobId: active?.id,
      allowedActions: ["set_availability"], blockers: effective === "busy" ? ["rider_busy"] : [],
    });
  }

  private riderJobView(job: JobProjection): ProductionRiderJobResponse {
    const decision = this.policy.riderJobDecision(job.status, job.custodyState, job.rescheduledFor);
    const address = job.order.deliveryAddress ? {
      recipientName: job.order.deliveryAddress.recipientName, phone: job.order.deliveryAddress.phone,
      locality: job.order.deliveryAddress.locality, street: job.order.deliveryAddress.street,
      landmark: job.order.deliveryAddress.landmark ?? undefined, ghanaPostGps: job.order.deliveryAddress.ghanaPostGps ?? undefined,
    } : undefined;
    return riderJobResponseSchema.parse({
      jobId: job.id, orderId: job.orderId, orderReference: job.order.reference, deliveryStatus: job.status,
      customerName: job.order.customerName, customerPhone: job.order.customerPhone, address, instructions: job.order.note ?? undefined,
      items: job.order.lines.map((line) => ({ productName: line.productName, variantName: line.variantName, unit: line.unit, quantity: line.quantity.toString() })),
      paymentMethod: job.order.paymentMethod, paymentStatus: job.order.paymentStatus, codDueMinor: this.codDue(job.order),
      proof: this.proof(job.proof), failureReason: job.failureReasonCode ?? undefined, rescheduledFor: job.rescheduledFor?.toISOString(),
      allowedProofMethods: this.policy.allowedProofMethods(), allowedActions: decision.allowedActions, blockers: decision.blockers,
      events: job.events.map((event) => this.event(event)),
    });
  }

  async riderJobs(userId: string): Promise<ProductionRiderJobsResponse> {
    const profile = await this.riderProfile(userId);
    const jobs = await this.db.deliveryJob.findMany({ where: this.activeWhere(profile.id), include: jobInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
    return riderJobsResponseSchema.parse({ jobs: jobs.map((job) => this.riderJobView(job)), rider: await this.riderMe(userId) });
  }

  async riderJob(userId: string, jobId: string): Promise<ProductionRiderJobResponse> {
    const profile = await this.riderProfile(userId);
    const job = await this.db.deliveryJob.findFirst({ where: { id: jobId, riderProfileId: profile.id, status: { not: "unassigned" } }, include: jobInclude });
    if (!job) missing("Delivery job not found.");
    return this.riderJobView(job);
  }

  async riderHistory(userId: string): Promise<ProductionRiderHistoryResponse> {
    const profile = await this.riderProfile(userId);
    const jobs = await this.db.deliveryJob.findMany({ where: { riderProfileId: profile.id, OR: [{ status: "delivered" }, { status: "return_to_store", returnedToStoreAt: { not: null } }] }, include: jobInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 100 });
    return riderHistoryResponseSchema.parse({ jobs: jobs.map((job) => this.riderJobView(job)) });
  }
}
