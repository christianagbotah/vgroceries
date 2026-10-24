import { Body, Controller, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { ApiRequest } from "../http/errors";
import { HubtelRefundCallbackService } from "./hubtel-refund-callback.service";

@Controller("refunds/providers/hubtel/callback")
export class HubtelRefundCallbackController {
  constructor(private readonly callbacks: HubtelRefundCallbackService) {}

  @Post(":secret")
  @HttpCode(200)
  async receive(@Param("secret") secret: string, @Body() body: unknown, @Req() req: ApiRequest) {
    return { ok: true, data: await this.callbacks.apply(secret, body, req.requestId) };
  }
}
