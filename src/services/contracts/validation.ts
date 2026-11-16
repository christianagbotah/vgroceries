/* Compatibility import for the existing web application. */
export * from "../../../packages/contracts/src/validation";

import { createCategoryRequestSchema } from "../../../packages/contracts/src/categories";
import { posQuoteRequestSchema } from "../../../packages/contracts/src/pos-quote";
import {
  requestSchemas as sharedRequestSchemas,
  validateRequest as sharedValidateRequest,
} from "../../../packages/contracts/src/validation";

/** Frontend must reject duplicate/zero items even before the server veto. */
const verifiedPosQuotePreviewSchema = posQuoteRequestSchema.superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const [i, line] of value.lines.entries()) {
    if (seen.has(line.variantId)) ctx.addIssue({
      code: "custom", path: ["lines", i, "variantId"], message: "Duplicate variant",
    });
    seen.add(line.variantId);
    if (Number(line.quantity) <= 0) ctx.addIssue({
      code: "custom", path: ["lines", i, "quantity"], message: "Quantity must be positive",
    });
  }
});

/** Web request validation additions kept in lockstep with production routes. */
export const requestSchemas = {
  ...sharedRequestSchemas,
  "admin.categories.create": createCategoryRequestSchema,
  "pos.verified.quote": verifiedPosQuotePreviewSchema,
};

export function validateRequest(
  op: string,
  body: unknown,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; issues: string[] } {
  if (op !== "admin.categories.create" && op !== "pos.verified.quote")
    return sharedValidateRequest(op, body);
  const schema = op === "pos.verified.quote" ? verifiedPosQuotePreviewSchema : createCategoryRequestSchema;
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, value: result.data as Record<string, unknown> };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}
