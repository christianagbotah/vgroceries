import { Inject, Injectable } from "@nestjs/common";
import { pickupAttendanceInputSchema, pickupAttendanceRecordSchema, pickupAttendanceContextSchema, type PickupAttendanceInput } from "@variety/contracts";
export { pickupAttendanceInputSchema } from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { logisticsCommandHash } from "./logistics.values";

function view(record: {
  id: string; orderId: string; nodeId: string;
  appointmentBookedAt: Date; startsAt: Date; endsAt: Date;
  kind: string; reason: string; note: string | null;
  observedAt: Date; recordedById: string;
}) {
  return pickupAttendanceRecordSchema.parse({
    id: record.id, orderId: record.orderId, nodeId: record.nodeId,
    appointmentBookedAt: record.appointmentBookedAt.toISOString(),
    startsAt: record.startsAt.toISOString(), endsAt: record.endsAt.toISOString(),
    kind: record.kind, reason: record.reason, note: record.note,
    observedAt: record.observedAt.toISOString(), recordedById: record.recordedById,
  });
}

/**
 * Staff/admin observation of attendance: evidence only.
 * Never performs handover, changes booking status, releases capacity/stock,
 * cancels orders, charges/refunds, or contacts a customer.
 */
@Injectable()
export class PickupAttendanceService {
  constructor(private readonly db: Database, @Inject(API_CONFIG) private readonly config: ApiConfig) {}

  /**
   * Advisory admin UI context. Does not reserve a slot or grant mutation
   * authority: record() always rechecks all evidence within its order lock.
   */
  async context(orderId: string) {
    const order = await this.db.order.findUnique({ where: { id: orderId }, select: {
      paymentStatus: true, fulfilmentStatus: true, cancelledAt: true,
      stockConsumedAt: true,
      pickupAppointment: true,
      pickupSnapshot: { select: { nodeId: true } },
      refunds: { select: { status: true } },
      shipments: { where: { sequence: 1 }, take: 1, select: {
        status: true, destinationKind: true, finalPickupNodeId: true,
        currentNodeId: true, custody: true, completedAt: true, currentLegId: true,
      } },
    } });
    if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");
    const appointment = order.pickupAppointment;
    const shipment = order.shipments[0];
    const centre = appointment ? await this.db.logisticsNode.findUnique({
      where: { id: appointment.nodeId }, select: {
        active: true, customerVisible: true, kind: true,
        pickupAppointmentPolicy: { select: { active: true } },
      },
    }) : null;
    const enabled = this.config.customerPickupEnabled &&
      this.config.shipmentExecutionEnabled && this.config.pickupAttendanceEnabled;
    const eligible = !!(enabled && appointment?.status === "booked" &&
      order.paymentStatus === "succeeded" && order.fulfilmentStatus === "dispatched" &&
      !order.cancelledAt && order.stockConsumedAt &&
      order.pickupSnapshot?.nodeId === appointment.nodeId &&
      shipment?.status === "ready_for_pickup" &&
      shipment.destinationKind === "pickup_point" &&
      shipment.finalPickupNodeId === appointment.nodeId &&
      shipment.currentNodeId === appointment.nodeId &&
      ["node_staff", "source_staff"].includes(shipment.custody ?? "") &&
      !shipment.currentLegId && !shipment.completedAt &&
      !order.refunds.some(r => ["awaiting_approval", "approved", "processing",
        "requires_review", "succeeded"].includes(r.status)) &&
      centre?.active && centre.customerVisible &&
      centre.kind === "pickup_point" && centre.pickupAppointmentPolicy?.active);
    const now = Date.now();
    return pickupAttendanceContextSchema.parse({
      enabled,
      canRecordLateArrival: eligible && now >= appointment!.startsAt.getTime(),
      canRecordMissedWindow: eligible && now >= appointment!.endsAt.getTime(),
      appointment: appointment ? {
        status: appointment.status,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        bookedAt: appointment.bookedAt.toISOString(),
      } : null,
    });
  }

  async list(orderId: string) {
    const order = await this.db.order.findUnique({
      where: { id: orderId }, select: { id: true },
    });
    if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");
    const rows = await this.db.pickupAttendanceRecord.findMany({
      where: { orderId },
      orderBy: [{ observedAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    return rows.map(view);
  }

  async record(
    orderId: string,
    actorId: string,
    key: string,
    input: PickupAttendanceInput,
    requestId: string,
    now = new Date(),
  ) {
    if (!this.config.customerPickupEnabled ||
        !this.config.shipmentExecutionEnabled || !this.config.pickupAttendanceEnabled)
      throw new ApiProblem(503, "UNAVAILABLE", "Pickup attendance recording is not enabled.");
    if (!Number.isFinite(now.getTime())) throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid observation time.");
    const validated = pickupAttendanceInputSchema.parse(input);
    const operation = `pickup.attendance.${validated.kind}:${orderId}`;
    const requestHash = logisticsCommandHash({ orderId, ...validated });

    return this.db.$transaction(async tx => {
      // Order-first lock matches booking/rescheduling and physical handover.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
      const previous = await tx.idempotency.findUnique({
        where: { actorId_operation_key: { actorId, operation, key } },
      });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT",
            "Attendance idempotency key was reused with different observations.");
        return pickupAttendanceRecordSchema.parse(previous.outcome);
      }

      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          paymentStatus: true, fulfilmentStatus: true, cancelledAt: true,
          stockConsumedAt: true,
          pickupSnapshot: { select: { nodeId: true } },
          pickupAppointment: true,
          refunds: { select: { status: true } },
          shipments: { where: { sequence: 1 }, take: 1, select: {
            status: true, destinationKind: true, finalPickupNodeId: true,
            currentNodeId: true, custody: true, completedAt: true, currentLegId: true,
          } },
        },
      });
      if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");
      const appointment = order.pickupAppointment;
      const shipment = order.shipments[0];
      if (!appointment || appointment.status !== "booked" ||
          order.paymentStatus !== "succeeded" ||
          order.fulfilmentStatus !== "dispatched" ||
          order.cancelledAt || !order.stockConsumedAt ||
          order.pickupSnapshot?.nodeId !== appointment.nodeId ||
          shipment?.status !== "ready_for_pickup" ||
          shipment.destinationKind !== "pickup_point" ||
          shipment.finalPickupNodeId !== appointment.nodeId ||
          shipment.currentNodeId !== appointment.nodeId ||
          !["node_staff", "source_staff"].includes(shipment.custody ?? "") ||
          shipment.currentLegId || shipment.completedAt ||
          order.refunds.some(r => ["awaiting_approval", "approved", "processing",
            "requires_review", "succeeded"].includes(r.status))) {
        throw new ApiProblem(422, "PICKUP_ATTENDANCE_NOT_ALLOWED",
          "Attendance can be recorded only for a paid, booked parcel waiting at its pickup centre.");
      }

      const centre = await tx.logisticsNode.findUnique({
        where: { id: appointment.nodeId },
        select: { active: true, customerVisible: true, kind: true,
          pickupAppointmentPolicy: { select: { active: true } } },
      });
      if (!centre || !centre.active || !centre.customerVisible ||
          centre.kind !== "pickup_point" || !centre.pickupAppointmentPolicy?.active)
        throw new ApiProblem(422, "PICKUP_CENTRE_UNAVAILABLE",
          "The pickup centre is not eligible for attendance observations.");

      if (now.getTime() < appointment.startsAt.getTime() ||
          (validated.kind === "missed_window" && now.getTime() < appointment.endsAt.getTime()))
        throw new ApiProblem(422, "PICKUP_ATTENDANCE_TOO_EARLY",
          "Late arrival requires the slot to have started; missed window requires it to have ended.");

      const existing = await tx.pickupAttendanceRecord.findFirst({
        where: { orderId, appointmentBookedAt: appointment.bookedAt, kind: validated.kind },
        select: { id: true },
      });
      if (existing)
        throw new ApiProblem(409, "PICKUP_ATTENDANCE_ALREADY_RECORDED",
          "This booking already has a staff observation of this type.");

      const record = await tx.pickupAttendanceRecord.create({
        data: {
          orderId, nodeId: appointment.nodeId,
          appointmentBookedAt: appointment.bookedAt,
          startsAt: appointment.startsAt, endsAt: appointment.endsAt,
          kind: validated.kind, reason: validated.reason,
          note: validated.note ?? null, observedAt: now,
          recordedById: actorId, requestId,
        },
      });
      await tx.auditEvent.create({ data: {
        actorId, action: "pickup.attendance." + record.kind, entityId: orderId,
        requestId, details: {
          recordId: record.id, nodeId: record.nodeId,
          appointmentBookedAt: record.appointmentBookedAt.toISOString(),
          startsAt: record.startsAt.toISOString(), endsAt: record.endsAt.toISOString(),
          observedAt: record.observedAt.toISOString(), reason: record.reason,
          authority: "observation_only",
        },
      } });
      await tx.orderEvent.create({ data: {
        orderId, actorKind: "staff", actorId,
        action: "pickup.attendance." + record.kind,
        note: "Internal pickup attendance observation recorded.",
        customerSafe: false,
      } });
      const result = view(record);
      await tx.idempotency.create({ data: {
        actorId, operation, key, requestHash, outcome: result,
      } });
      return result;
    }, { timeout: 15000 });
  }
}
