import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiProblem } from "../http/errors";
import { normalizeAllocationQuantity, validateAllocationLines } from "./allocation.values";
import type {
  LockedClaimCoverage,
  LockedClaimReservation,
  LockExactClaimInput,
} from "./depletion.types";

type LockedReservationRow = LockedClaimReservation & { state: string };

function reservationLost(message: string): never {
  throw new ApiProblem(409, "RESERVATION_LOST", message);
}

function validateIdentity(input: LockExactClaimInput) {
  if (!input.claimType?.trim() || !input.claimId?.trim() || !input.locationId?.trim())
    throw new ApiProblem(400, "VALIDATION_FAILED", "Claim identity and location are required.");
  validateAllocationLines(input.lines);
}

@Injectable()
export class ClaimCoverageService {
  async lockExact(
    tx: Prisma.TransactionClient,
    input: LockExactClaimInput,
  ): Promise<LockedClaimCoverage> {
    validateIdentity(input);

    const variantIds = [...new Set(input.lines.map((line) => line.variantId))].sort();
    const variants = await tx.variant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, unit: true },
      orderBy: { id: "asc" },
    });
    const units = new Map(variants.map((variant) => [variant.id, variant.unit]));
    if (units.size !== variantIds.length)
      reservationLost("Reservation coverage references an unavailable variant.");

    const expected = new Map<string, { variantId: string; quantity: Prisma.Decimal }>();
    for (const line of input.lines) {
      const unit = units.get(line.variantId);
      if (!unit) reservationLost("Reservation coverage references an unavailable variant.");
      expected.set(line.claimLineId, {
        variantId: line.variantId,
        quantity: normalizeAllocationQuantity(line.quantity, unit),
      });
    }

    const rows = await tx.$queryRaw<LockedReservationRow[]>`SELECT
        r.id,
        r."positionId",
        r."lotId",
        r."claimLineId",
        r.generation,
        r.quantity,
        r.state,
        r."expiresAt",
        sp."variantId",
        sp."locationId",
        v.unit
      FROM "Reservation" r
      JOIN "StockPosition" sp ON sp.id=r."positionId"
      JOIN "Variant" v ON v.id=sp."variantId"
      WHERE r."claimType"=${input.claimType} AND r."claimId"=${input.claimId}
      ORDER BY r.generation ASC,r.id ASC
      FOR UPDATE OF r`;

    const now = new Date();
    const staleIds = rows
      .filter((row) => row.state === "active" && row.expiresAt.getTime() <= now.getTime())
      .map((row) => row.id);
    if (staleIds.length) {
      await tx.reservation.updateMany({
        where: { id: { in: staleIds }, state: "active" },
        data: { state: "expired" },
      });
    }

    const active = rows.filter(
      (row) => row.state === "active" && row.expiresAt.getTime() > now.getTime(),
    );
    if (active.length === 0)
      reservationLost("Active reservation coverage is missing.");

    const generations = [...new Set(active.map((row) => row.generation))];
    if (generations.length !== 1)
      reservationLost("Reservation coverage has multiple active generations.");

    const totals = new Map<string, Prisma.Decimal>();
    for (const row of active) {
      if (row.locationId !== input.locationId)
        reservationLost("Reservation coverage belongs to a different stock location.");
      const wanted = expected.get(row.claimLineId);
      if (!wanted || wanted.variantId !== row.variantId)
        reservationLost("Reservation coverage does not match the requested claim lines.");
      totals.set(
        row.claimLineId,
        (totals.get(row.claimLineId) ?? new Prisma.Decimal(0)).plus(row.quantity),
      );
    }

    if (totals.size !== expected.size)
      reservationLost("Reservation coverage is incomplete.");
    for (const [claimLineId, wanted] of expected) {
      const total = totals.get(claimLineId);
      if (!total || !total.eq(wanted.quantity))
        reservationLost("Reservation coverage quantity no longer matches the claim.");
    }

    return {
      generation: generations[0]!,
      reservations: active.map(({ state: _state, ...row }) => row),
    };
  }
}
