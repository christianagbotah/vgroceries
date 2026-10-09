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
