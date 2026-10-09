/** Stable ID + reference generation for the mock service. */

let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36).padStart(6, "0")}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/** Customer-visible order reference, e.g. VG-8F3K2Q. */
export function orderReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "";
  for (let i = 0; i < 6; i++) {
    ref += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `VG-${ref}`;
}

/** Tracking verification code paired with the order reference. */
export function verificationCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function receiptNumber(seq: number): string {
  return `R-${String(seq).padStart(5, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoPlusMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function isoPlusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function isoMinusDays(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function isoMinusMinutes(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}
