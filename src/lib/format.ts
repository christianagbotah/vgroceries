/** Formatting helpers shared by all interfaces. */

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

/** Validate a +233-compatible Ghana mobile number, e.g. +233 24 123 4567. */
export function isValidGhanaPhone(phone: string): boolean {
  return /^\+233\d{9}$/.test(phone.replace(/[\s-]/g, ""));
}

export function normalisePhone(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

/** GhanaPostGPS digital addresses look like GA-457-2029; no geocoding claimed. */
export function isValidGhanaPostGps(code: string): boolean {
  return /^[A-Z]{2}-\d{3,4}-\d{3,4}$/.test(code.trim().toUpperCase());
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Exact placed-date format for Ghana operations; preserve legacy display-only labels. */
export function formatPlacedDateTime(value: string): string {
  // Only interpret unambiguous, offset-bearing ISO timestamps as instants.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return value || "—";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")} ${part("hour")}:${part("minute")}:${part("second")}`;
}
