import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { AdminCustomersService } from "./admin-customers.service";

@ApiTags("admin-customers")
@ApiCookieAuth()
@Controller("admin/customers")
@UseGuards(AccessGuard)
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  private requireAdmin(req: AuthRequest) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Administrator access required.");
  }

  @Get()
  @ApiOperation({ summary: "List customer accounts for administrators" })
  async list(@Req() req: AuthRequest) {
    this.requireAdmin(req);
    return { ok: true, data: await this.customers.list() };
  }

  @Get(":customerId")
  @ApiOperation({ summary: "Read customer account detail for administrators" })
  async detail(@Req() req: AuthRequest, @Param("customerId") customerId: string) {
    this.requireAdmin(req);
    return { ok: true, data: await this.customers.detail(customerId) };
  }
}
