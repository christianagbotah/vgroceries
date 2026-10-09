/**
 * Quantity helpers — decimal strings as stock authority.
 * Floating point is never used as stock authority; math is done on
 * scaled integers internally and serialised back to decimal strings.
 */

const SCALE = 1000; // three decimal places is enough for grocery quantities

/** Parse a decimal-string quantity to scaled integer (error when invalid). */
export function qtyToScaled(q: string): number {
  const trimmed = String(q).trim();
  if (!/^-?\d+(\.\d{1,3})?$/.test(trimmed)) {
    throw new Error(`Invalid quantity: ${q}`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  const fracScaled = Number(frac.padEnd(3, "0") || "0");
  const sign = whole.startsWith("-") ? -1 : 1;
  const wholeAbs = Math.abs(Number(whole));
  return sign * (wholeAbs * SCALE + fracScaled);
}

/** Scaled integer back to a canonical decimal string (trailing zeros trimmed). */
export function scaledToQty(s: number): string {
  const sign = s < 0 ? "-" : "";
  const abs = Math.abs(Math.round(s));
  const whole = Math.floor(abs / SCALE);
  const frac = abs % SCALE;
  if (frac === 0) return `${sign}${whole}`;
  let fracStr = String(frac).padStart(3, "0").replace(/0+$/, "");
  return `${sign}${whole}.${fracStr}`;
}

export function addQty(a: string, b: string): string {
  return scaledToQty(qtyToScaled(a) + qtyToScaled(b));
}

export function subQty(a: string, b: string): string {
  return scaledToQty(qtyToScaled(a) - qtyToScaled(b));
}

export function cmpQty(a: string, b: string): number {
  const x = qtyToScaled(a);
  const y = qtyToScaled(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function qtyPositive(a: string): boolean {
  return cmpQty(a, "0") > 0;
}

export function qtyNonNegative(a: string): boolean {
  return cmpQty(a, "0") >= 0;
}

/** Multiply a quantity by an integer count (e.g. 5 cartons × "12" pieces). */
export function mulQty(q: string, factor: number): string {
  return scaledToQty(qtyToScaled(q) * factor);
}

export function formatQty(q: string): string {
  const n = Number(q);
  return Number.isFinite(n) ? String(n) : q;
}
