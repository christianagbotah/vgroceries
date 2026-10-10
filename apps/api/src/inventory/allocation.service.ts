import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { normalizeAllocationQuantity, validateAllocationLines } from "./allocation.values";
import type {
  AllocationLotResult,
  AllocationOperationContext,
  CreateAllocationInput,
  EnsureClaimCoverageInput,
  EnsureClaimCoverageResult,
} from "./allocation.types";

type PositionRow = { id: string; variantId: string; unit: string; safetyStock: Prisma.Decimal };
type LotRow = { id: string; quantity: Prisma.Decimal; reserved: Prisma.Decimal; expiryDate: Date | null; createdAt: Date };
type ClaimRow = {
  id: string;
  generation: number;
  claimLineId: string;
  quantity: Prisma.Decimal;
  expiresAt: Date;
  variantId: string;
};

@Injectable()
export class AllocationService {
  constructor(private readonly db: Database) {}

  private validateExpiry(expiresAt: Date) {
    if (!(expiresAt instanceof Date) || expiresAt.getTime() <= Date.now())
      throw new ApiProblem(400, "VALIDATION_FAILED", "Allocation expiry must be in the future.");
  }

  private async positionsFor(
    tx: Prisma.TransactionClient,
    input: CreateAllocationInput | EnsureClaimCoverageInput,
  ) {
    const location = await tx.location.findUnique({ where: { id: input.locationId } });
    if (!location?.active)
      throw new ApiProblem(409, "OUT_OF_STOCK", "The selected stock location is unavailable.");
    const variantIds = [...new Set(input.lines.map((line) => line.variantId))].sort();
    const positions = new Map<string, PositionRow>();
    for (const variantId of variantIds) {
      const rows = await tx.$queryRaw<PositionRow[]>`SELECT sp.id,sp."variantId",sp."safetyStock",v.unit
        FROM "StockPosition" sp JOIN "Variant" v ON v.id=sp."variantId"
        WHERE sp."variantId"=${variantId} AND sp."locationId"=${input.locationId} AND v.active
        FOR UPDATE OF sp`;
      const row = rows[0];
      if (row) positions.set(variantId, row);
    }
    return { variantIds, positions };
  }

  private async allocateGeneration(
    tx: Prisma.TransactionClient,
    input: CreateAllocationInput | EnsureClaimCoverageInput,
    generation: number,
    eventType: "inventory.allocated" | "inventory.reacquired",
  ): Promise<AllocationLotResult[]> {
    validateAllocationLines(input.lines);
    this.validateExpiry(input.expiresAt);
    const { variantIds, positions } = await this.positionsFor(tx, input);

    const requestedByVariant = new Map<string, Prisma.Decimal>();
    const normalizedLines = input.lines.map((line) => {
      const position = positions.get(line.variantId);
      if (!position)
        throw new ApiProblem(409, "OUT_OF_STOCK", "One or more requested variants are unavailable.", {
          conflicts: [{ variantId: line.variantId, requested: line.quantity, available: "0" }],
        });
      const quantity = normalizeAllocationQuantity(line.quantity, position.unit);
      requestedByVariant.set(line.variantId, (requestedByVariant.get(line.variantId) ?? new Prisma.Decimal(0)).plus(quantity));
      return { ...line, quantity };
    });

    const lotsByVariant = new Map<string, LotRow[]>();
    const conflicts: { variantId: string; requested: string; available: string }[] = [];
    for (const variantId of variantIds) {
      const position = positions.get(variantId);
      if (!position) continue;
      const lots = await tx.$queryRaw<LotRow[]>`SELECT l.id,l.quantity,l."expiryDate",l."createdAt",
          COALESCE(sum(r.quantity) FILTER (WHERE r.state='active' AND r."expiresAt">now()),0) AS reserved
        FROM "StockLot" l
        LEFT JOIN "Reservation" r ON r."lotId"=l.id
        WHERE l."positionId"=${position.id} AND l.kind='regular' AND NOT l.quarantined
          AND l.quantity>0
          AND (l."expiryDate" IS NULL OR l."expiryDate">(now() AT TIME ZONE 'UTC')::date)
        GROUP BY l.id,l.quantity,l."expiryDate",l."createdAt"
        ORDER BY l."expiryDate" ASC NULLS LAST,l."createdAt" ASC,l.id ASC`;
      lotsByVariant.set(variantId, lots);
      const physicalAfterHolds = lots.reduce(
        (total, lot) => total.plus(Prisma.Decimal.max(new Prisma.Decimal(0), lot.quantity.minus(lot.reserved))),
        new Prisma.Decimal(0),
      );
      const available = Prisma.Decimal.max(new Prisma.Decimal(0), physicalAfterHolds.minus(position.safetyStock));
      const requested = requestedByVariant.get(variantId) ?? new Prisma.Decimal(0);
      if (requested.gt(available)) conflicts.push({ variantId, requested: requested.toString(), available: available.toString() });
    }
    if (conflicts.length)
      throw new ApiProblem(409, "OUT_OF_STOCK", "Requested stock is no longer available.", { conflicts });

    const remainingByLot = new Map<string, Prisma.Decimal>();
    for (const lots of lotsByVariant.values())
      for (const lot of lots)
        remainingByLot.set(lot.id, Prisma.Decimal.max(new Prisma.Decimal(0), lot.quantity.minus(lot.reserved)));

    const results: AllocationLotResult[] = [];
    for (const line of normalizedLines) {
      const position = positions.get(line.variantId)!;
      let remaining = line.quantity;
      for (const lot of lotsByVariant.get(line.variantId) ?? []) {
        if (remaining.lte(0)) break;
        const lotAvailable = remainingByLot.get(lot.id) ?? new Prisma.Decimal(0);
        if (lotAvailable.lte(0)) continue;
        const take = Prisma.Decimal.min(remaining, lotAvailable);
        const reservation = await tx.reservation.create({ data: {
          id: randomUUID(), positionId: position.id, lotId: lot.id,
          claimType: input.claimType, claimId: input.claimId, claimLineId: line.claimLineId,
          generation, quantity: take, state: "active", expiresAt: input.expiresAt,
        } });
        results.push({
          reservationId: reservation.id, claimLineId: line.claimLineId, variantId: line.variantId,
          lotId: lot.id, quantity: take.toString(), expiryDate: lot.expiryDate?.toISOString().slice(0, 10) ?? null,
        });
        remaining = remaining.minus(take);
        remainingByLot.set(lot.id, lotAvailable.minus(take));
      }
      if (remaining.gt(0)) throw new ApiProblem(409, "OUT_OF_STOCK", "Stock changed while allocating.");
    }

    const reservationIds = results.map((row) => row.reservationId);
    const affectedVariantIds = [...new Set(results.map((row) => row.variantId))];
    await tx.auditEvent.create({ data: {
      actorId: input.actorId, action: eventType, entityId: input.claimId, requestId: input.requestId,
      details: { claimType: input.claimType, locationId: input.locationId, generation, reservationIds, variantIds: affectedVariantIds },
    } });
    await tx.outboxEvent.create({ data: {
      type: eventType, aggregateId: input.claimId,
      payload: { claimType: input.claimType, claimId: input.claimId, locationId: input.locationId, generation, reservationIds, variantIds: affectedVariantIds },
    } });
    return results;
  }

  async create(tx: Prisma.TransactionClient, input: CreateAllocationInput): Promise<AllocationLotResult[]> {
    return this.allocateGeneration(tx, input, 1, "inventory.allocated");
  }

  async ensureClaimCoverage(
    tx: Prisma.TransactionClient,
    input: EnsureClaimCoverageInput,
  ): Promise<EnsureClaimCoverageResult> {
    validateAllocationLines(input.lines);
    this.validateExpiry(input.expiresAt);

    await tx.$queryRaw`SELECT id FROM "Reservation"
      WHERE "claimType"=${input.claimType} AND "claimId"=${input.claimId}
      ORDER BY generation,id FOR UPDATE`;
    await tx.reservation.updateMany({
      where: { claimType: input.claimType, claimId: input.claimId, state: "active", expiresAt: { lte: new Date() } },
      data: { state: "expired" },
    });

    const { positions } = await this.positionsFor(tx, input);
    const requested = new Map<string, { variantId: string; quantity: Prisma.Decimal }>();
    for (const line of input.lines) {
      const position = positions.get(line.variantId);
      if (!position)
        throw new ApiProblem(409, "OUT_OF_STOCK", "One or more requested variants are unavailable.");
      requested.set(line.claimLineId, { variantId: line.variantId, quantity: normalizeAllocationQuantity(line.quantity, position.unit) });
    }

    const history = await tx.$queryRaw<ClaimRow[]>`SELECT r.id,r.generation,r."claimLineId",r.quantity,r."expiresAt",sp."variantId"
      FROM "Reservation" r JOIN "StockPosition" sp ON sp.id=r."positionId"
      WHERE r."claimType"=${input.claimType} AND r."claimId"=${input.claimId}
      ORDER BY r.generation,r.id`;
    const active = history.filter((row) => row.expiresAt.getTime() > Date.now()).filter((row) => {
      const stateRow = row;
      return stateRow;
    });
    const activeIds = new Set((await tx.reservation.findMany({
      where: { claimType: input.claimType, claimId: input.claimId, state: "active", expiresAt: { gt: new Date() } },
      select: { id: true },
    })).map((row) => row.id));
    const activeRows = active.filter((row) => activeIds.has(row.id));

    if (activeRows.length) {
      const generations = [...new Set(activeRows.map((row) => row.generation))];
      if (generations.length !== 1)
        throw new ApiProblem(409, "CONFLICT", "Reservation coverage has multiple active generations.");
      const totals = new Map<string, Prisma.Decimal>();
      let mismatch = false;
      for (const row of activeRows) {
        const wanted = requested.get(row.claimLineId);
        if (!wanted || wanted.variantId !== row.variantId) mismatch = true;
        totals.set(row.claimLineId, (totals.get(row.claimLineId) ?? new Prisma.Decimal(0)).plus(row.quantity));
      }
      for (const [claimLineId, wanted] of requested)
        if (!(totals.get(claimLineId) ?? new Prisma.Decimal(0)).eq(wanted.quantity)) mismatch = true;
      if (mismatch || totals.size !== requested.size)
        throw new ApiProblem(409, "RESERVATION_LOST", "Existing reservation coverage is partial or inconsistent.");

      const reservationIds = activeRows.map((row) => row.id);
      const changed = await tx.reservation.updateManyAndReturn({
        where: { id: { in: reservationIds }, expiresAt: { lt: input.expiresAt } },
        data: { expiresAt: input.expiresAt }, select: { id: true },
      });
      if (changed.length) {
        await tx.auditEvent.create({ data: {
          actorId: input.actorId, action: "inventory.reservation_extended", entityId: input.claimId,
          requestId: input.requestId, details: { generation: generations[0], reservationIds: changed.map((row) => row.id) },
        } });
        await tx.outboxEvent.create({ data: {
          type: "inventory.reservation_extended", aggregateId: input.claimId,
          payload: { claimType: input.claimType, claimId: input.claimId, generation: generations[0], reservationIds: changed.map((row) => row.id) },
        } });
      }
      return { generation: generations[0], reused: true, reservationIds };
    }

    const generation = Math.max(0, ...history.map((row) => row.generation)) + 1;
    const rows = await this.allocateGeneration(tx, input, generation, "inventory.reacquired");
    return { generation, reused: false, reservationIds: rows.map((row) => row.reservationId) };
  }

  async release(tx: Prisma.TransactionClient, claimType: string, claimId: string, context?: AllocationOperationContext): Promise<number> {
    const changed = await tx.reservation.updateManyAndReturn({ where: { claimType, claimId, state: "active" }, data: { state: "released" }, select: { id: true } });
    if (changed.length && context) {
      const reservationIds = changed.map((row) => row.id);
      await tx.auditEvent.create({ data: { actorId: context.actorId, action: "inventory.released", entityId: claimId, requestId: context.requestId, details: { claimType, reservationIds } } });
      await tx.outboxEvent.create({ data: { type: "inventory.released", aggregateId: claimId, payload: { claimType, claimId, reservationIds } } });
    }
    return changed.length;
  }

  async expire(tx: Prisma.TransactionClient, now: Date, context?: AllocationOperationContext): Promise<number> {
    const changed = await tx.reservation.updateManyAndReturn({ where: { state: "active", expiresAt: { lte: now } }, data: { state: "expired" }, select: { id: true, claimId: true, claimType: true } });
    if (changed.length && context) {
      const claims = new Map<string, { claimType: string; claimId: string; reservationIds: string[] }>();
      for (const row of changed) {
        const key = `${row.claimType}:${row.claimId}`;
        const claim = claims.get(key) ?? { claimType: row.claimType, claimId: row.claimId, reservationIds: [] };
        claim.reservationIds.push(row.id); claims.set(key, claim);
      }
      for (const claim of claims.values()) {
        await tx.auditEvent.create({ data: { actorId: context.actorId, action: "inventory.expired", entityId: claim.claimId, requestId: context.requestId, details: { claimType: claim.claimType, reservationIds: claim.reservationIds } } });
        await tx.outboxEvent.create({ data: { type: "inventory.expired", aggregateId: claim.claimId, payload: { claimType: claim.claimType, claimId: claim.claimId, reservationIds: claim.reservationIds, requestId: context.requestId } } });
      }
    }
    return changed.length;
  }
}
