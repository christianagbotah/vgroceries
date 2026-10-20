import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { accountProfileUpdateRequestSchema } from "@variety/contracts";
import { ApiProblem, ApiRequest } from "../http/errors";
import { IdentityService } from "../identity/identity.service";
import { AccountProfileService } from "./account-profile.service";

@ApiTags("account")
@Controller("account")
export class AccountController {
  constructor(
    private readonly identity: IdentityService,
    private readonly account: AccountProfileService,
  ) {}

  private async customer(req: ApiRequest) {
    const auth = await this.identity.authenticate(req);
    if (auth.actor.role !== "customer")
      throw new ApiProblem(403, "FORBIDDEN", "Customer account access required.");
    return auth;
  }

  @Get("summary")
  async summary(@Req() req: ApiRequest) {
    const auth = await this.customer(req);
    return { ok: true, data: await this.account.summary(auth.actor.id) };
  }

  @Get("profile")
  async profile(@Req() req: ApiRequest) {
    const auth = await this.customer(req);
    return { ok: true, data: await this.account.profile(auth.actor.id) };
  }

  @Post("profile")
  @HttpCode(200)
  async updateProfile(@Req() req: ApiRequest, @Body() body: unknown) {
    const auth = await this.customer(req);
    const parsed = accountProfileUpdateRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid account profile request.");
    return {
      ok: true,
      data: await this.account.updateProfile(auth.actor.id, req.requestId, parsed.data),
    };
  }
}
