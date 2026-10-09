/**
 * Money helpers — GHS minor units (pesewas) as integers.
 * The backend will be the authoritative calculator of prices, discounts,
 * fees, tax and totals. These helpers only format and sum client-visible
 * mock values consistently.
 */

export const CURRENCY = "GHS" as const;

/** Format integer pesewas as a visible Ghana cedi amount, e.g. 1250 → "₵12.50". */
export function formatMoney(minor: number): string {
  const sign = minor < 0 ? "−" : "";
  const abs = Math.abs(Math.round(minor));
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}₵${whole.toLocaleString("en-GH")}.${String(cents).padStart(2, "0")}`;
}

/** Parse a user-typed amount like "12.50" into pesewas; null when invalid. */
export function parseMoneyToMinor(input: string): number | null {
  const trimmed = input.trim().replace(/^₵/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const cents = Number(frac.padEnd(2, "0") || "0");
  return Number(whole) * 100 + cents;
}

export function sumMinor(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
