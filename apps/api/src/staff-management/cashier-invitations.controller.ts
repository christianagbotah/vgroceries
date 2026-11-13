import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { API_CONFIG, type ApiConfig } from "../config";
import { ApiProblem, type ApiRequest } from "../http/errors";
import { trustedOrigin } from "../identity/identity.service";
import { acceptCashierInvitationSchema } from "./staff-management.contracts";
import { CashierInvitationsService } from "./cashier-invitations.service";

@ApiTags("staff-activation")
@Controller("auth/staff-invitations")
export class CashierInvitationsController {
  constructor(
    private readonly invitations: CashierInvitationsService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Post("accept")
  @ApiOperation({ summary: "Accept one-time cashier invitation and set own password" })
  async accept(@Req() req: ApiRequest, @Body() raw: unknown) {
    if (!this.config.staffManagementEnabled)
      throw new ApiProblem(503, "FEATURE_DISABLED", "Staff activation is not enabled.");
    // This is a public one-time-code exchange, not an authenticated staff
    // mutation. Require an approved web Origin; no session or CSRF cookie.
    trustedOrigin(req, this.config, true);
    const parsed = acceptCashierInvitationSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid activation request.");
    return {
      ok: true,
      data: await this.invitations.accept(
        req.requestId, req.ip ?? req.socket.remoteAddress ?? "unknown", parsed.data,
      ),
    };
  }
}
