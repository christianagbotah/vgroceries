import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { planShipmentRequestSchema, replayKeySchema, type PlanShipmentRequest } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { ShipmentPlanningService } from "./shipment-planning.service";

@ApiExcludeController()
@Controller("admin/logistics/orders")
@UseGuards(AccessGuard)
export class AdminLogisticsShipmentsController {
  constructor(private readonly planning: ShipmentPlanningService) {}
  private requireAdmin(req: AuthRequest) { if (req.actor.role !== "admin") throw new ApiProblem(403, "FORBIDDEN", "Administrator access required."); }
  private parse<T>(schema: { safeParse(input: unknown): any }, input: unknown, message: string): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", message, parsed.error.issues.map((issue: any) => ({ path: issue.path.map(String).join("."), message: issue.message })));
    return parsed.data as T;
  }
  private key(req: AuthRequest) { return this.parse<string>(replayKeySchema, req.get("idempotency-key"), "A valid Idempotency-Key header is required."); }

  @Post(":orderId/plan")
  @HttpCode(200)
  async plan(@Req() req: AuthRequest, @Param("orderId") orderId: string, @Body() body: unknown) {
    this.requireAdmin(req);
    const input = this.parse<PlanShipmentRequest>(planShipmentRequestSchema, body, "Shipment planning body is invalid.");
    return { ok: true, data: await this.planning.planLegacy(orderId, req.actor.id, this.key(req), input, req.requestId) };
  }
}
