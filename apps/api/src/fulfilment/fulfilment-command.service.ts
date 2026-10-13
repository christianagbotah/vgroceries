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
import { FulfilmentPolicyService } from "./fulfilment-policy.service";
import {
  commandHash,
  FULFILMENT_OPERATION,
  normalizeNote,
  normalizePickedQuantity,
  type FulfilmentCommandContext,
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

@Injectable()
export class FulfilmentCommandService {
  constructor(
    private readonly db: Database,
    private readonly coverage: ClaimCoverageService,
    private readonly policy: FulfilmentPolicyService,
  ) {}

  private response(orderId: string, fulfilmentStatus: string): FulfilmentActionResponse {
    return fulfilmentActionResponseSchema.parse({
      orderId,
      fulfilmentStatus,
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

      // Global order lifecycle lock order begins with Order. Cancellation and
      // handover use the same row first, so no fulfilment side effect can race
      // a competing terminal transition.
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
        actorKind: "admin",
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
}
