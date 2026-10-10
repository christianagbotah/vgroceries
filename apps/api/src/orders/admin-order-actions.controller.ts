import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { adminOrderFinancialActionRequestSchema, replayKeySchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { OrderFinancialActionService } from "./order-financial-action.service";

@ApiExcludeController()
@Controller("admin/orders")
@UseGuards(AccessGuard)
export class AdminOrderActionsController {
  constructor(private readonly actions: OrderFinancialActionService) {}

  @Post(":orderId/actions")
  @HttpCode(200)
  async apply(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Order financial actions require administrator access.");
    const parsed = adminOrderFinancialActionRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid order financial action request.", {
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
      });
    const key = replayKeySchema.safeParse(req.get("idempotency-key"));
    if (!key.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "A valid Idempotency-Key is required.");
    return { ok: true, data: await this.actions.apply(req, req.actor.id, orderId, parsed.data, key.data) };
  }
}
