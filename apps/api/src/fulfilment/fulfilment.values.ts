import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { ProductionFulfilmentAction } from "@variety/contracts";
import { ApiProblem } from "../http/errors";

export const FULFILMENT_OPERATION = "fulfilment.command";

export interface FulfilmentCommandContext {
  actorId: string;
  requestId: string;
  idempotencyKey: string;
}

export interface PickCommandInput {
  pickedQuantity: string;
  note?: string;
}

export interface PackCommandInput {
  note?: string;
}

export interface HandoverCommandInput {
  note?: string;
}

function validation(message: string): never {
  throw new ApiProblem(400, "VALIDATION_FAILED", message);
}

export function validateContext(context: FulfilmentCommandContext) {
  if (!context.actorId?.trim() || !context.requestId?.trim())
    validation("Fulfilment actor and request identity are required.");
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(context.idempotencyKey ?? ""))
    validation("A valid Idempotency-Key is required.");
}

export function normalizeNote(raw?: string): string | null {
  if (raw === undefined) return null;
  const value = raw.trim();
  if (value.length < 1 || value.length > 500)
    validation("Fulfilment notes must contain between 1 and 500 characters.");
  return value;
}

export function normalizePickedQuantity(raw: string, unit: string): Prisma.Decimal {
  if (!/^\d+(\.\d{1,3})?$/.test(raw))
    validation("Picked quantity must be a nonnegative decimal with at most three places.");
  const value = new Prisma.Decimal(raw);
  if (value.lt(0)) validation("Picked quantity cannot be negative.");
  if (!["kg", "litre"].includes(unit) && !value.isInteger())
    validation("This variant requires whole base units.");
  return value;
}

export function commandHash(input: {
  action: ProductionFulfilmentAction;
  orderId: string;
  reservationId?: string;
  pickedQuantity?: string;
  note?: string | null;
}) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}
