import { ApiProblem } from "../http/errors";

export function normalizeRefundReason(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 500)
    throw new ApiProblem(400, "VALIDATION_FAILED", "Refund reason must be between 1 and 500 characters.");
  return normalized;
}
