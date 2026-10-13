import { Injectable } from "@nestjs/common";
import {
  fulfilmentDetailResponseSchema,
  fulfilmentListQuerySchema,
  fulfilmentQueueResponseSchema,
  type FulfilmentBlockingReason,
  type FulfilmentDetailResponse,
  type FulfilmentListQuery,
  type FulfilmentQueueResponse,
  type ProductionFulfilmentAction,
} from "@variety/contracts";
import { Prisma, type FulfilmentPick, type FulfilmentRun, type Order, type OrderEvent, type OrderLine, type Reservation, type StockLot, type StockPosition } from "@prisma/client";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { PaymentCaptureService } from "../payments/payment-capture.service";
import { FulfilmentPolicyService } from "./fulfilment-policy.service";

type ReservationProjection = Reservation & {
  position: Pick<StockPosition, "locationId" | "variantId">;
  lot: Pick<StockLot, "id" | "lotNumber" | "expiryDate">;
  fulfilmentPick: FulfilmentPick | null;
};

type OrderProjection = Order & {
  lines: OrderLine[];
  fulfilmentRun: FulfilmentRun | null;
  zone: { active: boolean; codEnabled: boolean } | null;
};

type DetailProjection = OrderProjection & { events: OrderEvent[] };

type CoverageState = {
  reservations: ReservationProjection[];
  locationId: string;
  reservationLost: boolean;
  reservationCount: number;
  pickedReservationCount: number;
  shortageCount: number;
  picksIncomplete: boolean;
};

function pushUnique<T>(values: T[], value: T) {
  if (!values.includes(value)) values.push(value);
}

function decimalSum(values: Prisma.Decimal[]) {
  return values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
}

@Injectable()
export class FulfilmentQueryService {
  constructor(
    private readonly db: Database,
    private readonly policy: FulfilmentPolicyService,
    private readonly paymentCapture: PaymentCaptureService,
  ) {}

  private fallbackLocation() {
    return process.env.COMMERCE_LOCATION_ID ?? process.env.API_STOCK_LOCATION_ID ?? "unresolved";
  }

  private selectReservations(
    order: OrderProjection,
    rows: ReservationProjection[],
  ): ReservationProjection[] {
    const wantedState = order.stockConsumedAt ? "consumed" : "active";
    return rows.filter((row) => row.state === wantedState);
  }

  private coverageState(
    order: OrderProjection,
    allRows: ReservationProjection[],
  ): CoverageState {
    const rows = this.selectReservations(order, allRows);
    const locations = [...new Set(rows.map((row) => row.position.locationId))];
    const locationId = order.fulfilmentRun?.locationId ?? locations[0] ?? this.fallbackLocation();

    if (order.stockConsumedAt) {
      return {
        reservations: rows,
        locationId,
        reservationLost: false,
        reservationCount: rows.length,
        pickedReservationCount: rows.filter((row) => row.fulfilmentPick?.state === "picked").length,
        shortageCount: rows.filter((row) => row.fulfilmentPick?.state === "shortage").length,
        picksIncomplete: false,
      };
    }

    const now = Date.now();
    const expected = new Map(order.lines.map((line) => [line.id, line]));
    const generations = new Set<number>();
    let reservationLost = locations.length !== 1 || rows.some((row) => row.expiresAt.getTime() <= now);
    const totals = new Map<string, Prisma.Decimal>();

    for (const row of rows) {
      generations.add(row.generation);
      const line = expected.get(row.claimLineId);
      if (!line || line.variantId !== row.position.variantId) {
        reservationLost = true;
        continue;
      }
      totals.set(
        row.claimLineId,
        (totals.get(row.claimLineId) ?? new Prisma.Decimal(0)).plus(row.quantity),
      );
    }
    if (generations.size !== 1) reservationLost = true;
    if (rows.length === 0) reservationLost = true;
    for (const line of order.lines) {
      if (!(totals.get(line.id) ?? new Prisma.Decimal(-1)).eq(line.quantity))
        reservationLost = true;
    }

    const pickedReservationCount = rows.filter((row) => {
      const pick = row.fulfilmentPick;
      return Boolean(
        pick &&
        pick.orderId === order.id &&
        pick.orderLineId === row.claimLineId &&
        pick.lotId === row.lotId &&
        pick.state === "picked" &&
        pick.quantity.eq(row.quantity) &&
        pick.pickedQuantity.eq(row.quantity),
      );
    }).length;
    const shortageCount = rows.filter((row) => row.fulfilmentPick?.state === "shortage").length;

    return {
      reservations: rows,
      locationId,
      reservationLost,
      reservationCount: rows.length,
      pickedReservationCount,
      shortageCount,
      picksIncomplete: rows.length === 0 || pickedReservationCount !== rows.length,
    };
  }

  private async financialBlockers(order: OrderProjection): Promise<FulfilmentBlockingReason[]> {
    const reasons: FulfilmentBlockingReason[] = [];
    if (!["packed", "ready_for_collection"].includes(order.fulfilmentStatus)) return reasons;

    if (order.fulfilment === "collection" && ["cash_counter", "cash_on_delivery"].includes(order.paymentMethod)) {
      reasons.push("collection_cash_unverified");
      return reasons;
    }
    if (order.fulfilment === "delivery" && order.paymentMethod === "cash_on_delivery") {
      if (!order.zone || !order.zone.active || !order.zone.codEnabled)
        reasons.push("payment_requires_review");
      return reasons;
    }

    const coverage = await this.db.$transaction((tx) =>
      this.paymentCapture.getHandoverCoverage(tx, order.id),
    );
    if (["requires_review", "refund_pending", "failed", "expired", "refunded"].includes(order.paymentStatus))
      pushUnique(reasons, "payment_requires_review");
    if (coverage.liveOrUncertain) pushUnique(reasons, "payment_pending");
    if (coverage.retainedMinor < order.totalMinor) pushUnique(reasons, "payment_insufficient");
    if (!["succeeded", "partially_refunded"].includes(order.paymentStatus))
      pushUnique(reasons, "payment_requires_review");
    return reasons;
  }

  private async actionState(
    order: OrderProjection,
    coverage: CoverageState,
  ): Promise<{
    blockingReasons: FulfilmentBlockingReason[];
    allowedActions: ProductionFulfilmentAction[];
    handoverAllowed: boolean;
  }> {
    const reasons: FulfilmentBlockingReason[] = [];
    if (order.stockConsumedAt || order.fulfilmentRun?.handedOverAt) {
      reasons.push("already_handed_over");
      return { blockingReasons: reasons, allowedActions: [], handoverAllowed: false };
    }

    if (coverage.reservationLost) pushUnique(reasons, "reservation_lost");
    if (order.fulfilmentStatus === "picking") {
      if (coverage.picksIncomplete) pushUnique(reasons, "picks_incomplete");
      if (coverage.shortageCount > 0) pushUnique(reasons, "shortage");
    }
    if (["packed", "ready_for_collection"].includes(order.fulfilmentStatus)) {
      if (coverage.picksIncomplete) pushUnique(reasons, "picks_incomplete");
      if (coverage.shortageCount > 0) pushUnique(reasons, "shortage");
      for (const reason of await this.financialBlockers(order)) pushUnique(reasons, reason);
    }

    const base = this.policy.allowedActions(order.fulfilmentStatus);
    const allowedActions = base.filter((action) => {
      if (coverage.reservationLost) return false;
      if (action === "record_pick") return true;
      if (action === "pack")
        return !reasons.includes("picks_incomplete") && !reasons.includes("shortage");
      if (action === "handover") return reasons.length === 0;
      return true;
    });
    return {
      blockingReasons: reasons,
      allowedActions,
      handoverAllowed: allowedActions.includes("handover"),
    };
  }

  private async reservationsForOrders(orderIds: string[]) {
    if (orderIds.length === 0) return new Map<string, ReservationProjection[]>();
    const rows = await this.db.reservation.findMany({
      where: { claimType: "order", claimId: { in: orderIds } },
      include: {
        position: { select: { locationId: true, variantId: true } },
        lot: { select: { id: true, lotNumber: true, expiryDate: true } },
        fulfilmentPick: true,
      },
      orderBy: [{ claimId: "asc" }, { generation: "asc" }, { id: "asc" }],
    });
    const grouped = new Map<string, ReservationProjection[]>();
    for (const row of rows as ReservationProjection[]) {
      const list = grouped.get(row.claimId) ?? [];
      list.push(row);
      grouped.set(row.claimId, list);
    }
    return grouped;
  }

  private orderInclude() {
    return {
      lines: { orderBy: { id: "asc" as const } },
      fulfilmentRun: true,
      zone: { select: { active: true, codEnabled: true } },
    } as const;
  }

  async list(raw: FulfilmentListQuery): Promise<FulfilmentQueueResponse> {
    const input = fulfilmentListQuerySchema.parse(raw);
    const where = input.status ? { fulfilmentStatus: input.status } : {};
    const [total, orders] = await Promise.all([
      this.db.order.count({ where }),
      this.db.order.findMany({
        where,
        include: this.orderInclude(),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.perPage,
        take: input.perPage,
      }),
    ]);
    const reservations = await this.reservationsForOrders(orders.map((order) => order.id));
    const items = [];
    for (const order of orders as OrderProjection[]) {
      const state = this.coverageState(order, reservations.get(order.id) ?? []);
      const actions = await this.actionState(order, state);
      const quantitySummary = decimalSum(order.lines.map((line) => line.quantity)).toString();
      items.push({
        orderId: order.id,
        reference: order.reference,
        createdAt: order.createdAt.toISOString(),
        fulfilment: order.fulfilment,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        fulfilmentStatus: order.fulfilmentStatus,
        deliveryStatus: order.deliveryStatus,
        locationId: state.locationId,
        lineCount: order.lines.length,
        quantitySummary,
        pickedReservationCount: state.pickedReservationCount,
        reservationCount: state.reservationCount,
        shortageCount: state.shortageCount,
        ...(order.fulfilmentRun?.packedAt ? { packedAt: order.fulfilmentRun.packedAt.toISOString() } : {}),
        ...(order.fulfilmentRun?.handedOverAt ? { handedOverAt: order.fulfilmentRun.handedOverAt.toISOString() } : {}),
        handoverAllowed: actions.handoverAllowed,
        blockingReasons: actions.blockingReasons,
        allowedActions: actions.allowedActions,
      });
    }
    return fulfilmentQueueResponseSchema.parse({
      page: input.page,
      perPage: input.perPage,
      total,
      items,
    });
  }

  async detail(orderId: string): Promise<FulfilmentDetailResponse> {
    if (!orderId?.trim())
      throw new ApiProblem(400, "VALIDATION_FAILED", "Order identity is required.");
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: {
        ...this.orderInclude(),
        events: {
          where: { action: { startsWith: "fulfilment." } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!order) throw new ApiProblem(404, "NOT_FOUND", "Fulfilment order not found.");

    const projected = order as DetailProjection;
    const reservationMap = await this.reservationsForOrders([orderId]);
    const state = this.coverageState(projected, reservationMap.get(orderId) ?? []);
    const actions = await this.actionState(projected, state);
    const reservationByLine = new Map<string, ReservationProjection[]>();
    for (const reservation of state.reservations) {
      const list = reservationByLine.get(reservation.claimLineId) ?? [];
      list.push(reservation);
      reservationByLine.set(reservation.claimLineId, list);
    }

    const lines = projected.lines.map((line) => ({
      orderLineId: line.id,
      productName: line.productName,
      variantName: line.variantName,
      unit: line.unit,
      orderedQuantity: line.quantity.toString(),
      reservations: (reservationByLine.get(line.id) ?? []).map((reservation) => {
        const pick = reservation.fulfilmentPick;
        return {
          reservationId: reservation.id,
          orderLineId: reservation.claimLineId,
          variantId: line.variantId,
          lotId: reservation.lotId,
          lotNumber: reservation.lot.lotNumber,
          ...(reservation.lot.expiryDate ? { expiryDate: reservation.lot.expiryDate.toISOString().slice(0, 10) } : {}),
          expectedQuantity: reservation.quantity.toString(),
          ...(pick ? { pickedQuantity: pick.pickedQuantity.toString(), pickState: pick.state } : {}),
          ...(pick?.state === "shortage" && pick.note ? { shortageNote: pick.note } : {}),
        };
      }),
    }));

    return fulfilmentDetailResponseSchema.parse({
      orderId: projected.id,
      reference: projected.reference,
      fulfilment: projected.fulfilment,
      fulfilmentStatus: projected.fulfilmentStatus,
      paymentMethod: projected.paymentMethod,
      paymentStatus: projected.paymentStatus,
      deliveryStatus: projected.deliveryStatus,
      locationId: state.locationId,
      ...(projected.fulfilmentRun?.confirmedBy ? { confirmedBy: projected.fulfilmentRun.confirmedBy } : {}),
      ...(projected.fulfilmentRun?.confirmedAt ? { confirmedAt: projected.fulfilmentRun.confirmedAt.toISOString() } : {}),
      ...(projected.fulfilmentRun?.pickingStartedBy ? { pickingStartedBy: projected.fulfilmentRun.pickingStartedBy } : {}),
      ...(projected.fulfilmentRun?.pickingStartedAt ? { pickingStartedAt: projected.fulfilmentRun.pickingStartedAt.toISOString() } : {}),
      ...(projected.fulfilmentRun?.packedBy ? { packedBy: projected.fulfilmentRun.packedBy } : {}),
      ...(projected.fulfilmentRun?.packedAt ? { packedAt: projected.fulfilmentRun.packedAt.toISOString() } : {}),
      ...(projected.fulfilmentRun?.handedOverBy ? { handedOverBy: projected.fulfilmentRun.handedOverBy } : {}),
      ...(projected.fulfilmentRun?.handedOverAt ? { handedOverAt: projected.fulfilmentRun.handedOverAt.toISOString() } : {}),
      ...(projected.fulfilmentRun?.handoverKind ? { handoverKind: projected.fulfilmentRun.handoverKind } : {}),
      ...(projected.stockConsumedAt ? { stockConsumedAt: projected.stockConsumedAt.toISOString() } : {}),
      lines,
      timeline: projected.events.map((event) => ({
        action: event.action,
        ...(event.actorId ? { actorId: event.actorId } : {}),
        at: event.createdAt.toISOString(),
        ...(event.note ? { note: event.note } : {}),
      })),
      blockingReasons: actions.blockingReasons,
      allowedActions: actions.allowedActions,
    });
  }
}
