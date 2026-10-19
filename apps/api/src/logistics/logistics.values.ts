import { createHash } from "node:crypto";
import { ApiProblem } from "../http/errors";

export function normalizeNodeCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!code || code.length > 64 || !/^[A-Z0-9_-]+$/.test(code))
    throw new ApiProblem(400, "VALIDATION_FAILED", "Node code must use 1-64 ASCII letters, numbers, underscores or hyphens.");
  return code;
}

export function normalizeMatchText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized || null;
}

export function boundedText(value: string | null | undefined, max: number, field: string): string | null {
  if (value == null) return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || text.length > max)
    throw new ApiProblem(400, "VALIDATION_FAILED", `${field} must contain 1-${max} characters.`);
  return text;
}

export function assertSafeCustomerLabel(value: string, field = "Customer label"): string {
  return boundedText(value, 160, field)!;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}

export function logisticsCommandHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
