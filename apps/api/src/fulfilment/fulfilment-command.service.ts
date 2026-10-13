import { Injectable } from "@nestjs/common";
import {
  fulfilmentActionResponseSchema,
  type FulfilmentActionResponse,
  type ProductionFulfilmentAction,
} from "@variety/contracts";
import { Prisma, type Order, type OrderLine } from "@prisma/client";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { ClaimCoverageService } from "../inventory/claim-coverage.service";
import type { LockedClaimCoverage } from "../inventory/depletion.types";
import { StockDepletionService } from "../inventory/stock-depletion.service";
import { PaymentCaptureService } from "../payments/payment-capture.service";
import { FulfilmentPolicyService } from "./fulfilment-policy.service";
import {
  commandHash,
  FULFILMENT_OPERATION,
  normalizeNote,
  normalizePickedQuantity,
  type FulfilmentCommandContext,
  type HandoverCommandInput,
  type PackCommandInput,
  type PickCommandInput,
  validateContext,
} from "./fulfilment.values";

type LockedOrder = Order & { lines: OrderLine[] };

type CommandWork = (
  tx: Prisma.TransactionClient,
  order: LockedOrder,
) => Promise<FulfilmentActionResponse>;

function conflict(message: string): never {
  throw new ApiProblem(409, "CONFLICT", message);
}

function reservationLost(message: string): never {
  throw new ApiProblem(409, "RESERVATION_LOST", message);
}

function ruleViolation(message: string): never {
  throw new ApiProblem(422, "RULE_VIOLATION", message);
}

function paymentBlocked(code: string, message: string): never {
  throw new ApiProblem(422, code, message);
}

@Injectable()
export class FulfilmentCommandService {
  constructor(
    private readonly db: Database,
    private readonly coverage: ClaimCoverageService,
    private readonly policy: FulfilmentPolicyService,
    private readonly paymentCapture: PaymentCaptureService,
    private readonly stockDepletion: StockDepletionService,
  ) {}

  private response(
    orderId: string,
    fulfilmentStatus: string,
    handover?: { stockConsumedAt: Date; depletionId: string },
  ): FulfilmentActionResponse {
    return fulfilmentActionResponseSchema.parse({
      orderId,
      fulfilmentStatus,
      stockConsumedAt: handover?.stockConsumedAt.toISOString(),
      depletionId: handover?.depletionId,
      allowedActions: this.policy.allowedActions(fulfilmentStatus),
    });
  }

  private parseReplay(outcome: Prisma.JsonValue): FulfilmentActionResponse {
    const parsed = fulfilmentActionResponseSchema.safeParse(outcome);
    if (!parsed.success)
      conflict("Fulfilment command replay state is incomplete.");
    return parsed.data;
  }

  private async advisory(
    tx: Prisma.TransactionClient,
    context: FulfilmentCommandContext,
  ) {
    const lockKey = JSON.stringify([
      context.actorId,
      FULFILMENT_OPERATION,
      context.idempotencyKey,
    ]);
    await tx.$queryRaw<Array<{ locked: number }>>`
      SELECT 1::int AS locked
      FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `;
  }

  private async execute(
    action: ProductionFulfilmentAction,
    orderId: string,
    context: FulfilmentCommandContext,
    semantic: { reservationId?: string; pickedQuantity?: string; note?: string | null },
    work: CommandWork,
  ): Promise<FulfilmentActionResponse> {
    validateContext(context);
    if (!orderId?.trim())
      throw new ApiProblem(400, "VALIDATION_FAILED", "Order identity is required.");
    const hash = commandHash({ action, orderId, ...semantic });

    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, context);
      const replay = await tx.idempotency.findUnique({
        where: {
          actorId_operation_key: {
            actorId: context.actorId,
            operation: FULFILMENT_OPERATION,
            key: context.idempotencyKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== hash)
          throw new ApiProblem(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was already used with a different fulfilment command.",
          );
        return this.parseReplay(replay.outcome);
      }

      // Global order lifecycle lock order begins with Order. Cancellation,
      // payments and fulfilment use this same authority row first.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { lines: { orderBy: { id: "asc" } } },
      });
      if (!order) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");
      if (order.fulfilmentStatus === "cancelled")
        conflict("Cancelled orders cannot advance through fulfilment.");
      if (order.stockConsumedAt)
        conflict("Physical stock was already consumed for this order.");

      const outcome = await work(tx, order);
      await tx.idempotency.create({
        data: {
          actorId: context.actorId,
          operation: FULFILMENT_OPERATION,
          key: context.idempotencyKey,
          requestHash: hash,
          outcome,
        },
      });
      return outcome;
    }, { timeout: 15_000 });
  }

  private expectedLines(order: LockedOrder) {
    if (order.lines.length === 0)
      reservationLost("Order has no fulfilment lines.");
    return order.lines.map((line) => ({
      claimLineId: line.id,
      variantId: line.variantId,
      quantity: line.quantity.toString(),
    }));
  }

  private async deriveLocation(
    tx: Prisma.TransactionClient,
    order: LockedOrder,
  ): Promise<string> {
    const rows = await tx.reservation.findMany({
      where: { claimType: "order", claimId: order.id, state: "active" },
      select: { position: { select: { locationId: true } } },
    });
    const locations = [...new Set(rows.map((row) => row.position.locationId))];
    if (locations.length !== 1)
      reservationLost("Order reservation coverage does not resolve to one stock location.");
    return locations[0]!;
  }

  private async lockCoverage(
    tx: Prisma.TransactionClient,
    order: LockedOrder,
    locationId?: string,
  ): Promise<{ locationId: string; coverage: LockedClaimCoverage }> {
    const resolvedLocation = locationId ?? await this.deriveLocation(tx, order);
    const coverage = await this.coverage.lockExact(tx, {
      claimType: "order",
      claimId: order.id,
      locationId: resolvedLocation,
      lines: this.expectedLines(order),
    });
    return { locationId: resolvedLocation, coverage };
  }

  private async lockRun(tx: Prisma.TransactionClient, orderId: string) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "FulfilmentRun" WHERE "orderId"=${orderId} FOR UPDATE
    `;
    return tx.fulfilmentRun.findUnique({ where: { orderId } });
  }

  private async requireCompletePicks(
    tx: Prisma.TransactionClient,
    order: LockedOrder,
    runId: string,
    coverage: LockedClaimCoverage,
  ) {
    const reservationIds = coverage.reservations.map((row) => row.id);
    const picks = await tx.fulfilmentPick.findMany({
      where: { reservationId: { in: reservationIds } },
      orderBy: { reservationId: "asc" },
    });
    if (picks.length !== reservationIds.length)
      ruleViolation("Every active reservation must be picked before this action.");

    const pickByReservation = new Map(picks.map((pick) => [pick.reservationId, pick]));
    for (const reservation of coverage.reservations) {
      const pick = pickByReservation.get(reservation.id);
      if (!pick)
        ruleViolation("Every active reservation must be picked before this action.");
      if (
        pick.orderId !== order.id ||
        pick.fulfilmentRunId !== runId ||
        pick.orderLineId !== reservation.claimLineId ||
        pick.variantId !== reservation.variantId ||
        pick.lotId !== reservation.lotId ||
        !pick.quantity.eq(reservation.quantity)
      ) {
        reservationLost("Recorded pick provenance no longer matches the active reservation.");
      }
      if (pick.state !== "picked" || !pick.pickedQuantity.eq(reservation.quantity))
        ruleViolation("All shortages must be resolved before this action.");
    }
  }

  private async assertPaymentHandover(
    tx: Prisma.TransactionClient,
    order: LockedOrder,
  ) {
    if (order.fulfilment === "collection" && ["cash_counter", "cash_on_delivery"].includes(order.paymentMethod)) {
      paymentBlocked(
        "COLLECTION_CASH_UNVERIFIED",
        "Collection cash settlement is not yet an authorized handover boundary.",
      );
    }

    if (order.fulfilment === "delivery" && order.paymentMethod === "cash_on_delivery") {
      if (!order.zoneId)
        paymentBlocked("PAYMENT_REQUIRES_REVIEW", "COD delivery is missing delivery-zone authority.");
      const zone = await tx.deliveryZone.findUnique({ where: { id: order.zoneId } });
      if (!zone || !zone.active || !zone.codEnabled)
        paymentBlocked("PAYMENT_REQUIRES_REVIEW", "COD is not enabled for this delivery zone.");
      return;
    }

    const financial = await this.paymentCapture.getHandoverCoverage(tx, order.id);
    if (["requires_review", "refund_pending", "failed", "expired", "refunded"].includes(order.paymentStatus))
      paymentBlocked("PAYMENT_REQUIRES_REVIEW", "Order payment state requires financial review before handover.");
    if (financial.liveOrUncertain)
      paymentBlocked("PAYMENT_PENDING", "Payment or refund evidence is still live or uncertain.");
    if (financial.retainedMinor < order.totalMinor)
      paymentBlocked("PAYMENT_INSUFFICIENT", "Verified retained payment does not cover the order total.");
    if (!["succeeded", "partially_refunded"].includes(order.paymentStatus))
      paymentBlocked("PAYMENT_REQUIRES_REVIEW", "Order payment projection is inconsistent with verified capture coverage.");
  }

  private async recordTransition(
    tx: Prisma.TransactionClient,
    context: FulfilmentCommandContext,
    order: LockedOrder,
    action: string,
    toStatus: string,
    note: string | null,
    details: Record<string, Prisma.JsonValue>,
    customerSafe = true,
  ) {
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        actorKind: "staff",
        actorId: context.actorId,
        action,
        fromStatus: order.fulfilmentStatus,
        toStatus,
        note,
        customerSafe,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: context.actorId,
        action,
        entityId: order.id,
        requestId: context.requestId,
        details,
      },
    });
    await tx.outboxEvent.create({
      data: {
        type: action,
        aggregateId: order.id,
        payload: { orderId: order.id, toStatus, ...details },
      },
    });
  }

  async confirm(
    orderId: string,
    context: FulfilmentCommandContext,
  ): Promise<FulfilmentActionResponse> {
    return this.execute("confirm", orderId, context, {}, async (tx, order) => {
      if (order.fulfilmentStatus !== "awaiting_confirmation")
        conflict("Order is not awaiting fulfilment confirmation.");

      const { locationId } = await this.lockCoverage(tx, order);
      const existing = await tx.fulfilmentRun.findUnique({ where: { orderId } });
      if (existing)
        conflict("Fulfilment run already exists for an unconfirmed order.");

      const now = new Date();
      await tx.fulfilmentRun.create({
        data: {
          orderId,
          locationId,
          confirmedBy: context.actorId,
          confirmedAt: now,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { fulfilmentStatus: "confirmed", version: { increment: 1 } },
      });
      await this.recordTransition(
        tx,
        context,
        order,
        "fulfilment.confirmed",
        "confirmed",
        null,
        { locationId },
      );
      return this.response(orderId, "confirmed");
    });
  }

  async startPicking(
    orderId: string,
    context: FulfilmentCommandContext,
  ): Promise<FulfilmentActionResponse> {
    return this.execute("start_picking", orderId, context, {}, async (tx, order) => {
      if (order.fulfilmentStatus !== "confirmed")
        conflict("Order must be confirmed before picking starts.");
      const run = await tx.fulfilmentRun.findUnique({ where: { orderId } });
      if (!run || !run.confirmedAt)
        conflict("Fulfilment run is missing confirmation provenance.");

      await this.lockCoverage(tx, order, run.locationId);
      const now = new Date();
      await tx.fulfilmentRun.update({
        where: { orderId },
        data: {
          pickingStartedBy: context.actorId,
          pickingStartedAt: now,
          version: { increment: 1 },
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { fulfilmentStatus: "picking", version: { increment: 1 } },
      });
      await this.recordTransition(
        tx,
        context,
        order,
        "fulfilment.picking_started",
        "picking",
        null,
        { locationId: run.locationId },
      );
      return this.response(orderId, "picking");
    });
  }

  async recordPick(
    orderId: string,
    reservationId: string,
    input: PickCommandInput,
    context: FulfilmentCommandContext,
  ): Promise<FulfilmentActionResponse> {
    const note = normalizeNote(input.note);
    return this.execute(
      "record_pick",
      orderId,
      context,
      { reservationId, pickedQuantity: input.pickedQuantity, note },
      async (tx, order) => {
        if (order.fulfilmentStatus !== "picking")
          conflict("Order must be actively picking before a pick can be recorded.");
        const run = await tx.fulfilmentRun.findUnique({ where: { orderId } });
        if (!run || !run.pickingStartedAt)
          conflict("Fulfilment run is missing picking provenance.");

        const locked = await this.lockCoverage(tx, order, run.locationId);
        const reservation = locked.coverage.reservations.find((row) => row.id === reservationId);
        if (!reservation)
          conflict("Reservation does not belong to this order's active fulfilment coverage.");
        const orderLine = order.lines.find((line) => line.id === reservation.claimLineId);
        if (!orderLine || orderLine.variantId !== reservation.variantId)
          reservationLost("Reservation provenance does not match the order line.");

        const picked = normalizePickedQuantity(input.pickedQuantity, reservation.unit);
        if (picked.gt(reservation.quantity))
          ruleViolation("Picked quantity cannot exceed the reserved quantity.");
        const state = picked.eq(reservation.quantity) ? "picked" : "shortage";
        const now = new Date();
        await tx.fulfilmentPick.upsert({
          where: { reservationId },
          create: {
            fulfilmentRunId: run.id,
            orderId,
            orderLineId: reservation.claimLineId,
            reservationId,
            lotId: reservation.lotId,
            variantId: reservation.variantId,
            quantity: reservation.quantity,
            pickedQuantity: picked,
            state,
            note,
            recordedBy: context.actorId,
            recordedAt: now,
          },
          update: {
            pickedQuantity: picked,
            state,
            note,
            recordedBy: context.actorId,
            recordedAt: now,
            version: { increment: 1 },
          },
        });
        await tx.fulfilmentRun.update({
          where: { id: run.id },
          data: { version: { increment: 1 } },
        });
        await this.recordTransition(
          tx,
          context,
          order,
          "fulfilment.pick_recorded",
          "picking",
          note,
          {
            reservationId,
            orderLineId: reservation.claimLineId,
            variantId: reservation.variantId,
            lotId: reservation.lotId,
            expectedQuantity: reservation.quantity.toString(),
            pickedQuantity: picked.toString(),
            state,
          },
          false,
        );
        return this.response(orderId, "picking");
      },
    );
  }

  async pack(
    orderId: string,
    input: PackCommandInput,
    context: FulfilmentCommandContext,
  ): Promise<FulfilmentActionResponse> {
    const note = normalizeNote(input.note);
    return this.execute("pack", orderId, context, { note }, async (tx, order) => {
      if (order.fulfilmentStatus !== "picking")
        conflict("Order must be actively picking before it can be packed.");
      const run = await this.lockRun(tx, orderId);
      if (!run || !run.pickingStartedAt)
        conflict("Fulfilment run is missing picking provenance.");
      if (run.packedAt || run.packedBy)
        conflict("Fulfilment run is already packed.");

      const locked = await this.lockCoverage(tx, order, run.locationId);
      await this.requireCompletePicks(tx, order, run.id, locked.coverage);

      const targetStatus = order.fulfilment === "delivery" ? "packed" : "ready_for_collection";
      const now = new Date();
      await tx.fulfilmentRun.update({
        where: { orderId },
        data: {
          packedBy: context.actorId,
          packedAt: now,
          packNote: note,
          version: { increment: 1 },
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { fulfilmentStatus: targetStatus, version: { increment: 1 } },
      });
      await this.recordTransition(
        tx,
        context,
        order,
        "fulfilment.packed",
        targetStatus,
        note,
        { locationId: run.locationId },
      );
      return this.response(orderId, targetStatus);
    });
  }

  async handover(
    orderId: string,
    input: HandoverCommandInput,
    context: FulfilmentCommandContext,
  ): Promise<FulfilmentActionResponse> {
    const note = normalizeNote(input.note);
    return this.execute("handover", orderId, context, { note }, async (tx, order) => {
      const expectedStatus = order.fulfilment === "delivery" ? "packed" : "ready_for_collection";
      if (order.fulfilmentStatus !== expectedStatus)
        conflict("Order is not in the required packed state for handover.");

      const run = await this.lockRun(tx, orderId);
      if (!run || !run.packedAt || !run.packedBy)
        conflict("Fulfilment run is missing packed provenance.");
      if (run.handedOverAt || run.handedOverBy || run.handoverKind)
        conflict("Fulfilment run was already handed over.");

      // Financial authority locks PaymentAttempt/Refund evidence after Order
      // and FulfilmentRun, matching the established Order-first payment order.
      await this.assertPaymentHandover(tx, order);

      const locked = await this.lockCoverage(tx, order, run.locationId);
      await this.requireCompletePicks(tx, order, run.id, locked.coverage);

      const depletion = await this.stockDepletion.consumeClaim(tx, {
        claimType: "order",
        claimId: order.id,
        locationId: run.locationId,
        lines: this.expectedLines(order),
        kind: order.fulfilment === "delivery" ? "dispatch_handover" : "collection_handover",
        actorId: context.actorId,
        requestId: context.requestId,
      });

      const now = new Date();
      const targetStatus = order.fulfilment === "delivery" ? "dispatched" : "collected";
      const handoverKind = order.fulfilment === "delivery" ? "dispatch" : "collection";
      await tx.fulfilmentRun.update({
        where: { orderId },
        data: {
          handedOverBy: context.actorId,
          handedOverAt: now,
          handoverKind,
          version: { increment: 1 },
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          fulfilmentStatus: targetStatus,
          stockConsumedAt: now,
          version: { increment: 1 },
        },
      });
      await this.recordTransition(
        tx,
        context,
        order,
        "fulfilment.handed_over",
        targetStatus,
        note,
        {
          locationId: run.locationId,
          depletionId: depletion.depletionId,
          handoverKind,
        },
      );
      return this.response(orderId, targetStatus, {
        stockConsumedAt: now,
        depletionId: depletion.depletionId,
      });
    });
  }
}
