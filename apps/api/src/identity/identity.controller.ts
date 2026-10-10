import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { loginRequestSchema, refreshRequestSchema } from "@variety/contracts";
import { API_CONFIG, ApiConfig } from "../config";
import { ApiProblem, ApiRequest } from "../http/errors";
import { AccessGuard } from "./access.guard";
import { AuthRequest, IdentityService } from "./identity.service";

@ApiTags("identity")
@Controller("auth")
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  @Post("sessions")
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", maxLength: 256 },
        client: { type: "string", enum: ["web", "native"], default: "web" },
      },
      additionalProperties: false,
    },
  })
  async login(
    @Body() body: unknown,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid login request.");
    const { email, password, client } = parsed.data;
    const result = await this.identity.login(email, password, client, req);
    if (result.secret)
      res.cookie("vg_session", result.secret, {
        httpOnly: true,
        secure: this.config.secureCookies,
        sameSite: "lax",
        path: "/api/v1",
        maxAge: 8 * 60 * 60 * 1000,
      });
    return { ok: true, data: result.data };
  }
  @Get("me")
  @ApiCookieAuth()
  @UseGuards(AccessGuard)
  me(@Req() req: AuthRequest) {
    return {
      ok: true,
      data: {
        actor: req.actor,
        ...(req.csrfToken ? { csrfToken: req.csrfToken } : {}),
      },
    };
  }
  @Post("logout")
  @ApiCookieAuth()
  @UseGuards(AccessGuard)
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.identity.logout(req);
    if (req.channel === "web")
      res.clearCookie("vg_session", {
        httpOnly: true,
        secure: this.config.secureCookies,
        sameSite: "lax",
        path: "/api/v1",
      });
    return { ok: true, data };
  }
  @Post("refresh")
  @ApiBody({
    schema: {
      type: "object",
      required: ["refreshToken"],
      properties: {
        refreshToken: { type: "string", pattern: "^[a-f0-9]{64}$" },
      },
      additionalProperties: false,
    },
  })
  async refresh(@Body() body: unknown, @Req() req: ApiRequest) {
    const parsed = refreshRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(
        400,
        "VALIDATION_FAILED",
        "Invalid refresh request.",
      );
    return {
      ok: true,
      data: await this.identity.refresh(parsed.data.refreshToken, req),
    };
  }
}
