/** Read only a server-provided retry interval. Never guess or hard-code the lockout. */
export function retryAfterSeconds(details: unknown): number | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const seconds = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0 || seconds > 86400)
    return null;
  return Math.ceil(seconds);
}

/** Compact, mobile-friendly countdown preserving hours for the SMS hourly quota. */
export function formatRetryCountdown(seconds: number): string {
  const left = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const secs = left % 60;
  if (hours) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}
