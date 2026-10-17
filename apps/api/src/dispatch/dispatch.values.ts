import { createHash } from "node:crypto";
import {
  dispatchFailureReasonSchema,
  dispatchProofMethodSchema,
  type DispatchFailureReason,
  type DispatchProofMethod,
} from "@variety/contracts";
import { ApiProblem } from "../http/errors";

export const DISPATCH_OPERATION = "dispatch.command";
export const RIDER_OPERATION = "rider.command";

export interface DispatchCommandContext {
  actorId: string;
  requestId: string;
  idempotencyKey: string;
}

export interface NormalizedDeliveryProof {
  method: DispatchProofMethod;
  reference: string;
  note: string | null;
}

function validation(message: string): never {
  throw new ApiProblem(400, "VALIDATION_FAILED", message);
}

export function validateDispatchContext(context: DispatchCommandContext) {
  if (!context.actorId?.trim() || !context.requestId?.trim())
    validation("Dispatch actor and request identity are required.");
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(context.idempotencyKey ?? ""))
    validation("A valid Idempotency-Key is required.");
}

export function normalizeDispatchNote(raw?: string): string | null {
  if (raw === undefined) return null;
  const value = raw.trim();
  if (value.length < 1 || value.length > 500)
    validation("Dispatch notes must contain between 1 and 500 characters.");
  return value;
}

export function normalizeFailureReason(raw: string): DispatchFailureReason {
  const parsed = dispatchFailureReasonSchema.safeParse(raw);
  if (!parsed.success) validation("Unsupported delivery failure reason.");
  return parsed.data;
}

export function normalizeProof(input: {
  method: DispatchProofMethod;
  reference: string;
  note?: string;
}): NormalizedDeliveryProof {
  const method = dispatchProofMethodSchema.safeParse(input.method);
  if (!method.success) validation("Unsupported proof method.");
  const reference = input.reference?.trim();
  if (!reference || reference.length > 256)
    validation("Proof reference must contain between 1 and 256 characters.");
  return { method: method.data, reference, note: normalizeDispatchNote(input.note) };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
  return value;
}

export function dispatchCommandHash(input: {
  action: string;
  entityId: string;
  body: unknown;
}) {
  return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}
