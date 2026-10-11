import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { refundActionRequestSchema, replayKeySchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { RefundActionService } from "./refund-action.service";

@ApiExcludeController()
@Controller("refunds")
@UseGuards(AccessGuard)
export class RefundsController {
  constructor(private readonly actions: RefundActionService) {}

  @Post(":refundId/actions")
  @HttpCode(200)
  async apply(@Req() req: AuthRequest, @Param("refundId") refundId: string, @Body() body: unknown) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Refund actions require administrator access.");
    const parsed = refundActionRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid refund action request.", {
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
      });
    const key = replayKeySchema.safeParse(req.get("idempotency-key"));
    if (!key.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "A valid Idempotency-Key is required.");
    return { ok: true, data: await this.actions.apply(req, req.actor.id, refundId, parsed.data.action, key.data) };
  }
}
