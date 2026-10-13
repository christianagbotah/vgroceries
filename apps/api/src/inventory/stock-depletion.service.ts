import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiProblem } from "../http/errors";
import { validateAllocationLines } from "./allocation.values";
import { ClaimCoverageService } from "./claim-coverage.service";
import type {
  ConsumeClaimInput,
  ConsumeClaimResult,
  StockDepletionLineResult,
} from "./depletion.types";

type LockedLotRow = {
  id: string;
  positionId: string;
  quantity: Prisma.Decimal;
  expiryDate: Date | null;
  quarantined: boolean;
  kind: string;
};

const depletionKinds = new Set([
  "dispatch_handover",
  "collection_handover",
  "pos_handover",
]);
const claimTypes = new Set(["order", "pos_draft"]);

function conflict(message: string): never {
  throw new ApiProblem(409, "CONFLICT", message);
}

function reservationLost(message: string): never {
  throw new ApiProblem(409, "RESERVATION_LOST", message);
}

function outOfStock(message: string): never {
  throw new ApiProblem(409, "OUT_OF_STOCK", message);
}

function validateInput(input: ConsumeClaimInput) {
  if (
    !claimTypes.has(input.claimType) ||
    !input.claimId?.trim() ||
    !input.locationId?.trim() ||
    !depletionKinds.has(input.kind) ||
    !input.actorId?.trim() ||
    !input.requestId?.trim()
  ) {
    throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid stock depletion request.");
  }
  validateAllocationLines(input.lines);
}

function persistedLines(
  rows: Array<{
    reservationId: string;
    claimLineId: string;
    variantId: string;
    lotId: string;
    quantity: Prisma.Decimal;
    lotQuantityBefore: Prisma.Decimal;
    lotQuantityAfter: Prisma.Decimal;
  }>,
): StockDepletionLineResult[] {
  return rows.map((row) => ({
    reservationId: row.reservationId,
    claimLineId: row.claimLineId,
    variantId: row.variantId,
    lotId: row.lotId,
    quantity: row.quantity.toString(),
    lotQuantityBefore: row.lotQuantityBefore.toString(),
    lotQuantityAfter: row.lotQuantityAfter.toString(),
  }));
}

function replayMatchesLines(
  input: ConsumeClaimInput,
  rows: Array<{ claimLineId: string; variantId: string; quantity: Prisma.Decimal }>,
) {
  const expected = new Map<string, Prisma.Decimal>();
  for (const line of input.lines) {
    expected.set(`${line.claimLineId}\u0000${line.variantId}`, new Prisma.Decimal(line.quantity));
  }
  const actual = new Map<string, Prisma.Decimal>();
  for (const line of rows) {
    const key = `${line.claimLineId}\u0000${line.variantId}`;
    actual.set(key, (actual.get(key) ?? new Prisma.Decimal(0)).plus(line.quantity));
  }
  if (actual.size !== expected.size) return false;
  for (const [key, quantity] of expected) {
    if (!(actual.get(key) ?? new Prisma.Decimal(-1)).eq(quantity)) return false;
  }
  return true;
}

@Injectable()
export class StockDepletionService {
  constructor(private readonly coverage: ClaimCoverageService) {}

  async consumeClaim(
    tx: Prisma.TransactionClient,
    input: ConsumeClaimInput,
  ): Promise<ConsumeClaimResult> {
    validateInput(input);

    const lockKey = `stock-depletion:${input.claimType}:${input.claimId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const existing = await tx.stockDepletion.findUnique({
      where: {
        claimType_claimId: {
          claimType: input.claimType,
          claimId: input.claimId,
        },
      },
      include: { lines: { orderBy: { reservationId: "asc" } } },
    });
    if (existing) {
      if (
        existing.locationId !== input.locationId ||
        existing.kind !== input.kind ||
        !replayMatchesLines(input, existing.lines)
      ) {
        conflict("Stock was already depleted for this claim with different handover identity.");
      }
      return {
        depletionId: existing.id,
        createdAt: existing.createdAt,
        lines: persistedLines(existing.lines),
        replayed: true,
      };
    }

    const lockedCoverage = await this.coverage.lockExact(tx, input);
    const reservationIds = lockedCoverage.reservations.map((row) => row.id);
    const lotIds = [...new Set(lockedCoverage.reservations.map((row) => row.lotId))].sort();
    const lockedLots = new Map<string, LockedLotRow>();
    for (const lotId of lotIds) {
      const rows = await tx.$queryRaw<LockedLotRow[]>`SELECT
          id,"positionId",quantity,"expiryDate",quarantined,kind
        FROM "StockLot"
        WHERE id=${lotId}
        FOR UPDATE`;
      const lot = rows[0];
      if (!lot) reservationLost("A reserved stock lot no longer exists.");
      lockedLots.set(lotId, lot);
    }

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const requiredByLot = new Map<string, Prisma.Decimal>();
    for (const reservation of lockedCoverage.reservations) {
      const lot = lockedLots.get(reservation.lotId);
      if (!lot || lot.positionId !== reservation.positionId)
        reservationLost("Reservation lot provenance no longer matches stock position.");
      if (
        lot.kind !== "regular" ||
        lot.quarantined ||
        (lot.expiryDate !== null && lot.expiryDate.getTime() <= todayUtc.getTime())
      ) {
        reservationLost("Reserved stock is no longer eligible for fulfilment.");
      }
      requiredByLot.set(
        reservation.lotId,
        (requiredByLot.get(reservation.lotId) ?? new Prisma.Decimal(0)).plus(reservation.quantity),
      );
    }

    for (const [lotId, required] of requiredByLot) {
      const lot = lockedLots.get(lotId)!;
      if (lot.quantity.lt(required))
        outOfStock("Reserved stock no longer has enough physical quantity for handover.");
    }

    const created = await tx.stockDepletion.create({
      data: {
        claimType: input.claimType,
        claimId: input.claimId,
        locationId: input.locationId,
        kind: input.kind,
        actorId: input.actorId,
        requestId: input.requestId,
      },
    });

    const workingByLot = new Map<string, Prisma.Decimal>(
      [...lockedLots.entries()].map(([lotId, lot]) => [lotId, lot.quantity]),
    );
    const lineData: Array<{
      reservationId: string;
      claimLineId: string;
      variantId: string;
      lotId: string;
      quantity: Prisma.Decimal;
      lotQuantityBefore: Prisma.Decimal;
      lotQuantityAfter: Prisma.Decimal;
    }> = [];
    for (const reservation of lockedCoverage.reservations) {
      const before = workingByLot.get(reservation.lotId)!;
      const after = before.minus(reservation.quantity);
      lineData.push({
        reservationId: reservation.id,
        claimLineId: reservation.claimLineId,
        variantId: reservation.variantId,
        lotId: reservation.lotId,
        quantity: reservation.quantity,
        lotQuantityBefore: before,
        lotQuantityAfter: after,
      });
      workingByLot.set(reservation.lotId, after);
    }

    for (const lotId of lotIds) {
      await tx.stockLot.update({
        where: { id: lotId },
        data: { quantity: workingByLot.get(lotId)! },
      });
    }

    const consumed = await tx.reservation.updateMany({
      where: { id: { in: reservationIds }, state: "active" },
      data: { state: "consumed" },
    });
    if (consumed.count !== reservationIds.length)
      reservationLost("Reservation state changed while stock was being handed over.");

    for (const line of lineData) {
      await tx.stockDepletionLine.create({
        data: {
          depletionId: created.id,
          reservationId: line.reservationId,
          claimLineId: line.claimLineId,
          variantId: line.variantId,
          lotId: line.lotId,
          quantity: line.quantity,
          lotQuantityBefore: line.lotQuantityBefore,
          lotQuantityAfter: line.lotQuantityAfter,
        },
      });
    }

    const safeDetails = {
      claimType: input.claimType,
      locationId: input.locationId,
      kind: input.kind,
      depletionId: created.id,
      reservationIds,
      lotIds,
    };
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId,
        action: "inventory.depleted",
        entityId: input.claimId,
        requestId: input.requestId,
        details: safeDetails,
      },
    });
    await tx.outboxEvent.create({
      data: {
        type: "inventory.depleted",
        aggregateId: input.claimId,
        payload: {
          claimType: input.claimType,
          claimId: input.claimId,
          locationId: input.locationId,
          kind: input.kind,
          depletionId: created.id,
          reservationIds,
          lotIds,
        },
      },
    });

    return {
      depletionId: created.id,
      createdAt: created.createdAt,
      lines: persistedLines(lineData),
      replayed: false,
    };
  }
}
