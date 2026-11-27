/* Compatibility import for the existing web application. */
export * from "../../../packages/contracts/src/validation";

import { fulfilmentPickRequestSchema, fulfilmentConfirmRequestSchema, fulfilmentStartPickingRequestSchema, fulfilmentPackRequestSchema, fulfilmentHandoverRequestSchema } from "../../../packages/contracts/src/fulfilment";
import { createCategoryRequestSchema } from "../../../packages/contracts/src/categories";
import { cashierTillOpenSchema,cashierTillMoveSchema,cashierTillCloseSchema } from "../../../packages/contracts/src/cashier-tills";
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

const fulfilmentSchemas = {
  "pos.verified.till.open":cashierTillOpenSchema,
  "pos.verified.till.move":cashierTillMoveSchema,
  "pos.verified.till.close":cashierTillCloseSchema,
  "admin.verified.fulfilment.pick": fulfilmentPickRequestSchema,
  "admin.verified.fulfilment.confirm": fulfilmentConfirmRequestSchema,
  "admin.verified.fulfilment.start-picking": fulfilmentStartPickingRequestSchema,
  "admin.verified.fulfilment.pack": fulfilmentPackRequestSchema,
  "admin.verified.fulfilment.handover": fulfilmentHandoverRequestSchema,
} as const;

/** Web request validation additions kept in lockstep with production routes. */
export const requestSchemas = {
  ...sharedRequestSchemas,
  ...fulfilmentSchemas,
  "admin.categories.create": createCategoryRequestSchema,
  "pos.verified.quote": verifiedPosQuotePreviewSchema,
};

export function validateRequest(
  op: string,
  body: unknown,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; issues: string[] } {
  const schema = Object.hasOwn(fulfilmentSchemas, op) ? fulfilmentSchemas[op as keyof typeof fulfilmentSchemas] : op === "pos.verified.quote" ? verifiedPosQuotePreviewSchema : op === "admin.categories.create" ? createCategoryRequestSchema : undefined;
  if (!schema) return sharedValidateRequest(op, body);
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, value: result.data as Record<string, unknown> };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}
