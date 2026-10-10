import { Prisma } from "@prisma/client";
import { ApiProblem } from "../http/errors";
import type { AllocationLineInput } from "./allocation.types";

function validation(message: string): never {
  throw new ApiProblem(400, "VALIDATION_FAILED", message);
}

export function normalizeAllocationQuantity(
  raw: string,
  unit: string,
): Prisma.Decimal {
  if (!/^\d+(\.\d{1,3})?$/.test(raw))
    return validation("Quantity must be a positive decimal with at most three places.");
  const quantity = new Prisma.Decimal(raw);
  if (!quantity.gt(0)) return validation("Quantity must be greater than zero.");
  if (!["kg", "litre"].includes(unit) && !quantity.isInteger())
    return validation("This variant requires whole base units.");
  return quantity;
}

export function validateAllocationLines(lines: AllocationLineInput[]): void {
  if (lines.length === 0) validation("At least one allocation line is required.");
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line.claimLineId || !line.variantId)
      validation("Allocation line identifiers are required.");
    if (seen.has(line.claimLineId))
      validation("Allocation claim line identifiers must be unique.");
    seen.add(line.claimLineId);
  }
}
