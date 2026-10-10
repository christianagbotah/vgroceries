import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import {
  normalizeAllocationQuantity,
  validateAllocationLines,
} from "./allocation.values";
import type {
  AllocationLotResult,
  CreateAllocationInput,
} from "./allocation.types";

type PositionRow = {
  id: string;
  variantId: string;
  unit: string;
  safetyStock: Prisma.Decimal;
};

type LotRow = {
  id: string;
  quantity: Prisma.Decimal;
  reserved: Prisma.Decimal;
  expiryDate: Date | null;
  createdAt: Date;
};

@Injectable()
export class AllocationService {
  constructor(private readonly db: Database) {}

  async create(
    tx: Prisma.TransactionClient,
    input: CreateAllocationInput,
  ): Promise<AllocationLotResult[]> {
    validateAllocationLines(input.lines);
    if (!(input.expiresAt instanceof Date) || input.expiresAt.getTime() <= Date.now())
      throw new ApiProblem(400, "VALIDATION_FAILED", "Allocation expiry must be in the future.");

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

    const requestedByVariant = new Map<string, Prisma.Decimal>();
    const normalizedLines = input.lines.map((line) => {
      const position = positions.get(line.variantId);
      if (!position)
        throw new ApiProblem(409, "OUT_OF_STOCK", "One or more requested variants are unavailable.", {
          conflicts: [{ variantId: line.variantId, requested: line.quantity, available: "0" }],
        });
      const quantity = normalizeAllocationQuantity(line.quantity, position.unit);
      requestedByVariant.set(
        line.variantId,
        (requestedByVariant.get(line.variantId) ?? new Prisma.Decimal(0)).plus(quantity),
      );
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
      const available = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        physicalAfterHolds.minus(position.safetyStock),
      );
      const requested = requestedByVariant.get(variantId) ?? new Prisma.Decimal(0);
      if (requested.gt(available))
        conflicts.push({
          variantId,
          requested: requested.toString(),
          available: available.toString(),
        });
    }
    if (conflicts.length)
      throw new ApiProblem(409, "OUT_OF_STOCK", "Requested stock is no longer available.", { conflicts });

    const remainingByLot = new Map<string, Prisma.Decimal>();
    for (const lots of lotsByVariant.values())
      for (const lot of lots)
        remainingByLot.set(
          lot.id,
          Prisma.Decimal.max(new Prisma.Decimal(0), lot.quantity.minus(lot.reserved)),
        );

    const results: AllocationLotResult[] = [];
    for (const line of normalizedLines) {
      const position = positions.get(line.variantId)!;
      let remaining = line.quantity;
      for (const lot of lotsByVariant.get(line.variantId) ?? []) {
        if (remaining.lte(0)) break;
        const lotAvailable = remainingByLot.get(lot.id) ?? new Prisma.Decimal(0);
        if (lotAvailable.lte(0)) continue;
        const take = Prisma.Decimal.min(remaining, lotAvailable);
        const reservation = await tx.reservation.create({
          data: {
            id: randomUUID(),
            positionId: position.id,
            lotId: lot.id,
            claimType: input.claimType,
            claimId: input.claimId,
            claimLineId: line.claimLineId,
            quantity: take,
            state: "active",
            expiresAt: input.expiresAt,
          },
        });
        results.push({
          reservationId: reservation.id,
          claimLineId: line.claimLineId,
          variantId: line.variantId,
          lotId: lot.id,
          quantity: take.toString(),
          expiryDate: lot.expiryDate?.toISOString().slice(0, 10) ?? null,
        });
        remaining = remaining.minus(take);
        remainingByLot.set(lot.id, lotAvailable.minus(take));
      }
      if (remaining.gt(0))
        throw new ApiProblem(409, "OUT_OF_STOCK", "Stock changed while allocating.");
    }
    return results;
  }

  async release(
    tx: Prisma.TransactionClient,
    claimType: string,
    claimId: string,
  ): Promise<number> {
    const result = await tx.reservation.updateMany({
      where: { claimType, claimId, state: "active" },
      data: { state: "released" },
    });
    return result.count;
  }

  async expire(tx: Prisma.TransactionClient, now: Date): Promise<number> {
    const result = await tx.reservation.updateMany({
      where: { state: "active", expiresAt: { lte: now } },
      data: { state: "expired" },
    });
    return result.count;
  }
}
