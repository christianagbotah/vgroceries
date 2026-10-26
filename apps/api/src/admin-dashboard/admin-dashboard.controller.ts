import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { AdminDashboardService } from "./admin-dashboard.service";

@ApiTags("admin-dashboard")
@ApiCookieAuth()
@Controller("admin/dashboard")
@UseGuards(AccessGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get()
  @ApiOperation({ summary: "Administrator operations dashboard" })
  async view(@Req() req: AuthRequest) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Administrator access required.");
    return { ok: true, data: await this.dashboard.view() };
  }
}
