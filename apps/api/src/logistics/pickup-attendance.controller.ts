import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { replayKeySchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { PickupAttendanceService, pickupAttendanceInputSchema } from "./pickup-attendance.service";

/**
 * Admin-only first rollout. Do not assume a location-scoped staff permission
 * exists; narrower centre/staff assignment is a separate authorization gate.
 */
@ApiExcludeController()
@Controller("admin/logistics/orders/:orderId/pickup-attendance")
@UseGuards(AccessGuard)
export class AdminPickupAttendanceController {
  constructor(private readonly attendance: PickupAttendanceService) {}

  private admin(req: AuthRequest) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Administrator access required.");
  }

  @Get()
  async list(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    this.admin(req);
    return { ok: true, data: await this.attendance.list(orderId) };
  }

  @Get("context")
  async context(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    this.admin(req);
    return { ok: true, data: await this.attendance.context(orderId) };
  }

  @Post() @HttpCode(200)
  async record(@Req() req: AuthRequest, @Param("orderId") orderId: string, @Body() raw: unknown) {
    this.admin(req);
    const parsed = pickupAttendanceInputSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid pickup attendance evidence.",
        parsed.error.issues.map(issue => ({
          path: issue.path.map(String).join("."), message: issue.message,
        })));
    const token = replayKeySchema.safeParse(req.get("idempotency-key"));
    if (!token.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "A valid Idempotency-Key header is required.");
    return { ok: true, data: await this.attendance.record(
      orderId, req.actor.id, token.data, parsed.data, req.requestId,
    ) };
  }
}
