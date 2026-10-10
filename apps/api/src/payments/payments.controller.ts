import { Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController, ApiTags } from "@nestjs/swagger";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { PaymentQueryService } from "./payment-query.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

@ApiExcludeController()
@ApiTags("payments")
@Controller("payments")
@UseGuards(AccessGuard)
export class PaymentsController {
  constructor(
    private readonly queries: PaymentQueryService,
    private readonly reconciliations: PaymentReconciliationService,
  ) {}

  private assertAdmin(req: AuthRequest) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Payment operations require administrator access.");
  }

  @Get()
  async list(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    this.assertAdmin(req);
    return { ok: true, data: await this.queries.list(query) };
  }

  @Post(":attemptId/reconcile")
  async reconcile(@Req() req: AuthRequest, @Param("attemptId") attemptId: string) {
    this.assertAdmin(req);
    if (!/^[0-9a-f-]{36}$/i.test(attemptId))
      throw new ApiProblem(404, "NOT_FOUND", "Payment attempt not found.");
    return {
      ok: true,
      data: await this.reconciliations.reconcile(attemptId, "staff", req.actor.id, req.requestId),
    };
  }
}
