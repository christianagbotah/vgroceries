import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { refundActionRequestSchema, replayKeySchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { RefundActionService } from "./refund-action.service";
import { RefundQueryService } from "./refund-query.service";

@Controller("refunds")
@UseGuards(AccessGuard)
export class RefundsController {
  constructor(
    private readonly actions: RefundActionService,
    private readonly queries: RefundQueryService,
  ) {}

  private requireAdmin(req: AuthRequest) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Refund access requires administrator access.");
  }

  @Get()
  async list(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    this.requireAdmin(req);
    return { ok: true, data: await this.queries.list(query) };
  }

  @Post(":refundId/actions")
  @HttpCode(200)
  async apply(@Req() req: AuthRequest, @Param("refundId") refundId: string, @Body() body: unknown) {
    this.requireAdmin(req);
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
