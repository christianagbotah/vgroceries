import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProblem } from "../http/errors";
import { API_CONFIG, type ApiConfig } from "../config";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { createCashierSchema, inviteCashierSchema, manageCashierSchema } from "./staff-management.contracts";
import { StaffManagementService } from "./staff-management.service";
import { CashierInvitationsService } from "./cashier-invitations.service";

@ApiTags("admin-staff")
@ApiCookieAuth()
@Controller("admin/staff")
@UseGuards(AccessGuard)
export class StaffManagementController {
  constructor(
    private readonly service: StaffManagementService,
    private readonly invitations: CashierInvitationsService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private requireAdmin(request: AuthRequest) {
    if (!this.config.staffManagementEnabled)
      throw new ApiProblem(503, "FEATURE_DISABLED", "Staff management is not enabled for this environment.");
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
    if (!this.config.staffDirectCashierCreateEnabled)
      throw new ApiProblem(503, "FEATURE_DISABLED",
        "Administrator-issued passwords are retired; use one-time cashier invitations.");
    const parsed = createCashierSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid cashier details.", parsed.error.issues);
    return {
      ok: true, data: await this.service.create(request.actor.id, request.requestId, parsed.data),
    };
  }

  @Post("invitations")
  @ApiOperation({ summary: "Issue or reissue a one-time cashier activation code (administrator)" })
  async invite(@Req() request: AuthRequest, @Body() raw: unknown) {
    this.requireAdmin(request);
    const parsed = inviteCashierSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED",
        "Invalid cashier invitation details.", parsed.error.issues);
    return {
      ok: true,
      data: await this.invitations.issue(request.actor.id, request.requestId, parsed.data),
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
