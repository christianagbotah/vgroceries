import { Prisma } from "@prisma/client";
import type { CartLineInput, CompleteOrderRequest } from "@variety/contracts";
import { createHash } from "node:crypto";
import { ApiProblem } from "../http/errors";

const validation = (message: string) =>
  new ApiProblem(400, "VALIDATION_FAILED", message);

export function roundLineTotalMinor(unitPriceMinor: number, quantity: string): number {
  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0)
    throw validation("Invalid unit price.");
  let q: Prisma.Decimal;
  try { q = new Prisma.Decimal(quantity); } catch { throw validation("Invalid quantity."); }
  if (!q.isFinite() || q.lte(0) || q.decimalPlaces() > 3)
    throw validation("Invalid quantity.");
  const rounded = new Prisma.Decimal(unitPriceMinor)
    .mul(q)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  if (rounded.gt(Number.MAX_SAFE_INTEGER)) throw validation("Line total is too large.");
  return rounded.toNumber();
}

export function validateCheckoutLines(
  lines: CartLineInput[],
  unitsByVariant: ReadonlyMap<string, string>,
): void {
  if (!Array.isArray(lines) || !lines.length || lines.length > 100)
    throw validation("Checkout requires 1 to 100 lines.");
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line.variantId || seen.has(line.variantId))
      throw validation("Checkout lines must contain unique variants.");
    seen.add(line.variantId);
    let q: Prisma.Decimal;
    try { q = new Prisma.Decimal(line.quantity); } catch { throw validation("Invalid quantity."); }
    if (!/^\d+(\.\d{1,3})?$/.test(line.quantity) || q.lte(0))
      throw validation("Invalid quantity.");
    const unit = unitsByVariant.get(line.variantId);
    if (unit && !["kg", "litre"].includes(unit) && !q.isInteger())
      throw validation("This variant requires whole base units.");
  }
}

const ghPhone = /^\+233(?:2\d|5\d)\d{7}$/;
const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const gps = /^[A-Z]{2}-\d{3,4}-\d{3,4}$/;
export function normalizeGhanaPhone(value: string) {
  return value.replace(/[\s-]/g, "");
}
export function validateCheckoutContact(input: CompleteOrderRequest): void {
  if (!input.customerName?.trim()) throw validation("Customer name is required.");
  if (!ghPhone.test(normalizeGhanaPhone(input.customerPhone ?? "")))
    throw validation("A valid Ghana customer phone is required.");
  if (input.customerEmail && !email.test(input.customerEmail.trim()))
    throw validation("Customer email is invalid.");
  const a = input.guestAddress;
  if (a) {
    if (![a.recipientName, a.locality, a.street].every((v) => v?.trim()))
      throw validation("Delivery address fields are required.");
    if (!ghPhone.test(normalizeGhanaPhone(a.phone ?? "")))
      throw validation("Delivery phone is invalid.");
    if (a.ghanaPostGps && !gps.test(a.ghanaPostGps.trim().toUpperCase()))
      throw validation("GhanaPostGPS address is invalid.");
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(input).sort().flatMap((key) => {
        const v = input[key];
        return v === undefined ? [] : [[key, canonical(v)]];
      }),
    );
  }
  return value;
}
export function canonicalCheckoutRequest(input: CompleteOrderRequest): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    lines: input.lines.map((line) => ({
      variantId: line.variantId,
      quantity: new Prisma.Decimal(line.quantity).toString(),
    })),
    customerName: input.customerName.trim(),
    customerPhone: normalizeGhanaPhone(input.customerPhone),
    customerEmail: input.customerEmail?.trim().toLowerCase(),
    addressId: input.addressId,
    guestAddress: input.guestAddress
      ? {
          label: input.guestAddress.label?.trim(),
          recipientName: input.guestAddress.recipientName.trim(),
          phone: normalizeGhanaPhone(input.guestAddress.phone),
          locality: input.guestAddress.locality.trim(),
          street: input.guestAddress.street.trim(),
          landmark: input.guestAddress.landmark?.trim(),
          ghanaPostGps: input.guestAddress.ghanaPostGps?.trim().toUpperCase(),
        }
      : undefined,
    fulfilment: input.fulfilment,
    zoneId: input.zoneId,
    slotId: input.slotId,
    paymentMethod: input.paymentMethod,
    note: input.note?.trim(),
  };
  return canonical(normalized) as Record<string, unknown>;
}
export function checkoutRequestHash(input: CompleteOrderRequest): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalCheckoutRequest(input)))
    .digest("hex");
}
