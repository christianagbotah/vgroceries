/* Compatibility import for the existing web application. */
export * from "../../../packages/contracts/src/validation";

import { createCategoryRequestSchema } from "../../../packages/contracts/src/categories";
import {
  requestSchemas as sharedRequestSchemas,
  validateRequest as sharedValidateRequest,
} from "../../../packages/contracts/src/validation";

/** Web request validation additions kept in lockstep with production routes. */
export const requestSchemas = {
  ...sharedRequestSchemas,
  "admin.categories.create": createCategoryRequestSchema,
};

export function validateRequest(
  op: string,
  body: unknown,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; issues: string[] } {
  if (op !== "admin.categories.create") return sharedValidateRequest(op, body);
  const result = createCategoryRequestSchema.safeParse(body);
  if (result.success) return { ok: true, value: result.data as Record<string, unknown> };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}
