import { Injectable } from "@nestjs/common";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { tokenHash } from "../identity/crypto";

/** Fixed 15-minute, database-atomic windows shared across all API replicas. */
const WINDOW_SECONDS = 15 * 60;
type Bucket = { key: string; limit: number };
type CounterRow = { attempts: number; windowStart: Date | string };

/**
 * Keep request-volume controls separate from failed private-code attempts.
 * Public status lookup and successful OTP flows are NOT authentication failures.
 */
@Injectable()
export class TrackingThrottleService {
  constructor(private readonly db: Database) {}

  private keys(clientKey: string, reference: string, kind: "lookup" | "failure"): Bucket[] {
    const normalized = reference.trim().toUpperCase();
    return kind === "lookup"
      ? [
          { key: tokenHash(`track:lookup:client:${clientKey}`), limit: 100 },
          { key: tokenHash(`track:lookup:pair:${clientKey}:${normalized}`), limit: 60 },
        ].sort((a,b) => a.key.localeCompare(b.key))
      : [
          { key: tokenHash(`track:client:${clientKey}`), limit: 100 },
          { key: tokenHash(`track:pair:${clientKey}:${normalized}`), limit: 5 },
        ].sort((a,b) => a.key.localeCompare(b.key));
  }

  private retrySeconds(windowStart: Date | string, now = Date.now()): number {
    const started = new Date(windowStart).getTime();
    if (!Number.isFinite(started)) return WINDOW_SECONDS;
    return Math.max(1, Math.min(WINDOW_SECONDS, Math.ceil((started + WINDOW_SECONDS * 1000 - now) / 1000)));
  }

  private blocked(retryAfterSeconds: number): never {
    throw new ApiProblem(429, "RATE_LIMITED",
      "Too many tracking attempts. Please try again after the countdown.",
      { retryAfterSeconds });
  }

  /** Read-only guard against bypassing an existing failed-attempt lock with a correct code. */
  async ensureNotBlocked(clientKey: string, reference: string): Promise<void> {
    const buckets = this.keys(clientKey, reference, "failure");
    const rows = await Promise.all(buckets.map(bucket =>
      this.db.trackingThrottle.findUnique({
        where: { key: bucket.key },
        select: { attempts: true, windowStart: true },
      }),
    ));
    let remaining = 0;
    const now = Date.now();
    for (const [i, bucket] of buckets.entries()) {
      const row = rows[i];
      if (!row || row.attempts < bucket.limit) continue;
      const wait = new Date(row.windowStart).getTime() + WINDOW_SECONDS * 1000 - now;
      if (wait > 0) remaining = Math.max(remaining, Math.ceil(wait / 1000));
    }
    if (remaining > 0) this.blocked(remaining);
  }

  private async register(clientKey: string, reference: string, kind: "lookup" | "failure"): Promise<void> {
    const buckets = this.keys(clientKey, reference, kind);
    // Lock rows in consistent hash order so simultaneous requests cannot evade
    // throttling or deadlock on two buckets. Every increment is atomic.
    const rows = await this.db.$transaction(async tx => {
      const counts: { limit: number; row: CounterRow }[] = [];
      for (const bucket of buckets) {
        const updated = await tx.$queryRaw<CounterRow[]>`
          INSERT INTO "TrackingThrottle" (key, "windowStart", attempts)
          VALUES (${bucket.key}, now(), 1)
          ON CONFLICT (key) DO UPDATE SET
            attempts = CASE WHEN "TrackingThrottle"."windowStart" <= now() - interval '15 minutes'
              THEN 1 ELSE "TrackingThrottle".attempts + 1 END,
            "windowStart" = CASE WHEN "TrackingThrottle"."windowStart" <= now() - interval '15 minutes'
              THEN now() ELSE "TrackingThrottle"."windowStart" END
          RETURNING attempts, "windowStart"
        `;
        if (!updated[0]) throw new Error("Tracking throttle could not be evaluated.");
        counts.push({ limit: bucket.limit, row: updated[0] });
      }
      return counts;
    });
    const waits = rows.filter(({ row, limit }) => row.attempts > limit)
      .map(({ row }) => this.retrySeconds(row.windowStart));
    if (waits.length) this.blocked(Math.max(...waits));
  }

  /** Applies to public status requests and OTP flow even when successful. */
  async registerLookup(clientKey: string, reference: string): Promise<void> {
    await this.register(clientKey, reference, "lookup");
  }

  /** Applies ONLY after a failed private-code or invalid SMS OTP verification. */
  async registerFailure(clientKey: string, reference: string): Promise<void> {
    await this.register(clientKey, reference, "failure");
  }
}
