import { Controller, HttpCode, Param, Post, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiProblem, type ApiRequest } from "../http/errors";
import { PaymentEventService } from "./payment-event.service";

@ApiExcludeController()
@Controller("payments/providers")
export class PaymentEventsController {
  constructor(private readonly events: PaymentEventService) {}

  @Post(":provider/events")
  @HttpCode(200)
  async receive(@Param("provider") provider: string, @Req() req: Request & ApiRequest) {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0)
      throw new ApiProblem(400, "VALIDATION_FAILED", "A raw payment provider event body is required.");
    return {
      ok: true,
      data: await this.events.handle(provider, req.body, req.headers, req.requestId),
    };
  }
}
