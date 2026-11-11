import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { createCashierSchema, manageCashierSchema } from "./staff-management.contracts";
import { StaffManagementService } from "./staff-management.service";

@ApiTags("admin-staff")
@ApiCookieAuth()
@Controller("admin/staff")
@UseGuards(AccessGuard)
export class StaffManagementController {
  constructor(private readonly service: StaffManagementService) {}

  private requireAdmin(request: AuthRequest) {
    if (request.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Administrator-only staff management.");
  }

  @Get()
  @ApiOperation({ summary: "List real staff and branch assignments (administrator)" })
  async list(@Req() request: AuthRequest) {
    this.requireAdmin(request);
    return { ok: true, data: await this.service.list() };
  }

  @Post()
  @ApiOperation({ summary: "Provision one cashier with specified active branches (administrator)" })
  async create(@Req() request: AuthRequest, @Body() raw: unknown) {
    this.requireAdmin(request);
    const parsed = createCashierSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid cashier details.", parsed.error.issues);
    return {
      ok: true, data: await this.service.create(request.actor.id, request.requestId, parsed.data),
    };
  }

  @Post(":staffId/actions")
  @ApiOperation({ summary: "Change cashier branches, activate/deactivate, or reset password (administrator)" })
  async action(
    @Req() request: AuthRequest, @Param("staffId") staffId: string, @Body() raw: unknown,
  ) {
    this.requireAdmin(request);
    const parsed = manageCashierSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid cashier action.", parsed.error.issues);
    return {
      ok: true,
      data: await this.service.manage(request.actor.id, request.requestId, staffId, parsed.data),
    };
  }
}
