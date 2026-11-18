/**
 * Reject an unsafe PostgreSQL session before any commerce/identity API starts.
 *
 * PrismaPg binds DateTime/timestamptz through the connection's timezone.
 * A non-UTC session can turn an expired reset token, invitation or POS stock
 * hold into a future deadline even when the server clocks agree.
 */
export interface DatabaseClockEvidence {
  timezone: string;
  epoch_seconds: number;
}

export const MAX_DATABASE_CLOCK_SKEW_MS = 60_000;

/** Pure and deterministic: no database access and no secrets in failures. */
export function assertUtcDeadlineClock(
  rows: readonly DatabaseClockEvidence[],
  sampledAtMs: number = Date.now(),
): void {
  if (rows.length !== 1 || !rows[0] || rows[0].timezone !== "UTC") {
    throw new Error("Unsafe PostgreSQL deadline configuration: UTC session required.");
  }
  const dbEpochMs = rows[0].epoch_seconds * 1_000;
  if (!Number.isFinite(dbEpochMs) || !Number.isFinite(sampledAtMs) ||
      Math.abs(dbEpochMs - sampledAtMs) > MAX_DATABASE_CLOCK_SKEW_MS) {
    throw new Error("Unsafe PostgreSQL deadline configuration: database clock cannot be trusted.");
  }
}
