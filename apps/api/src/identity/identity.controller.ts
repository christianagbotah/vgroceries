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
import { loginRequestSchema, refreshRequestSchema, registerRequestSchema } from "@variety/contracts";
import { API_CONFIG, ApiConfig } from "../config";
import { ApiProblem, ApiRequest } from "../http/errors";
import { AccessGuard } from "./access.guard";
import { AuthRequest, IdentityService } from "./identity.service";
import { PasswordRecoveryService, requestPasswordResetSchema, completePasswordResetSchema } from "./password-recovery.service";

@ApiTags("identity")
@Controller("auth")
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly recovery: PasswordRecoveryService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  @Post("register")
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "phone", "password"],
      properties: {
        name: { type: "string", minLength: 2, maxLength: 120 },
        email: { type: "string", format: "email", maxLength: 254 },
        phone: { type: "string", minLength: 8, maxLength: 20 },
        password: { type: "string", minLength: 12, maxLength: 256 },
        client: { type: "string", enum: ["web", "native"], default: "web" },
      },
      additionalProperties: false,
    },
  })
  async register(
    @Body() body: unknown,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = registerRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid registration request.");
    const { name, email, phone, password, client } = parsed.data;
    const result = await this.identity.register(name, email, phone, password, client, req);
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
  @Post("sessions")
  @ApiBody({
    schema: {
      type: "object",
      required: ["password"],
      properties: {
        email: { type: "string", format: "email", description: "Email identity for staff, riders, or existing customers." },
        phone: { type: "string", description: "Ghana mobile identity for customer sign-in." },
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
    const { email, phone, password, client } = parsed.data;
    const result = await this.identity.login({ email, phone }, password, client, req);
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
  @Post("password-reset/request")
  @ApiBody({ schema: { type: "object", required: ["email"],
    properties: { email: { type: "string", format: "email", maxLength: 254 } },
    additionalProperties: false } })
  async requestPasswordReset(@Body() raw: unknown, @Req() req: ApiRequest) {
    const parsed = requestPasswordResetSchema.safeParse(raw);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", "Enter a valid recovery email.");
    return { ok: true, data: await this.recovery.requestReset(parsed.data.email, req) };
  }

  @Post("password-reset/complete")
  @ApiBody({ schema: { type: "object", required: ["token", "password"],
    properties: { token: { type: "string", pattern: "^[a-f0-9]{64}$" },
      password: { type: "string", minLength: 12, maxLength: 256 } },
    additionalProperties: false } })
  async completePasswordReset(@Body() raw: unknown, @Req() req: ApiRequest) {
    const parsed = completePasswordResetSchema.safeParse(raw);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid password reset request.");
    return { ok: true, data: await this.recovery.completeReset(parsed.data.token, parsed.data.password, req) };
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
