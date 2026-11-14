/**
 * One inventory lot appears in exactly one exception queue. Classification
 * never changes stock; it only reports recorded physical lot state.
 * All comparisons are against an ISO calendar date (Ghana/UTC).
 */
export type ExpiryException = "expired" | "soon" | "quarantined" | "damaged";
export type ExpiryLotState = {
  kind: string;
  quarantined: boolean;
  expiryDate: string | null;
};
export type ExpiryClassification = { queue: ExpiryException; daysLeft?: number } | null;
const DAY_MS = 86_400_000;

export function classifyInventoryLot(
  lot: ExpiryLotState,
  today: string,
  horizonDays = 7,
): ExpiryClassification {
  // Unsafe lots are non-sellable and should not be proposed for promotion.
  if (/^(damaged|waste|disposed|unsafe|spoilage)$/.test(lot.kind)) {
    return { queue: "damaged" };
  }
  if (lot.quarantined || lot.kind !== "regular") {
    return { queue: "quarantined" };
  }
  if (!lot.expiryDate) return null;
  const expiry = Date.parse(`${lot.expiryDate}T00:00:00.000Z`);
  const now = Date.parse(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(expiry) || !Number.isFinite(now)) return null;
  const remaining = Math.round((expiry - now) / DAY_MS);
  // Match variant_availability: a lot dated TODAY is already not sellable.
  if (remaining <= 0) return { queue: "expired" };
  if (remaining <= horizonDays) return { queue: "soon", daysLeft: remaining };
  return null;
}
