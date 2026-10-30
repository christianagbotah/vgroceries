import { Controller, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem, type ApiRequest } from "../http/errors";
import { PaymentEventService } from "./payment-event.service";

@Controller("payments/providers/etranzact")
export class EtranzactReturnController {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly events: PaymentEventService,
    private readonly db: Database,
  ) {}

  @Post("return")
  async receive(@Req() req: Request & ApiRequest, @Res() res: Response) {
    const provider = this.config.etranzact;
    if (!provider || this.config.payments?.providerId !== "etranzact")
      throw new ApiProblem(404, "NOT_FOUND", "Payment provider endpoint not found.");
    if (!Buffer.isBuffer(req.body) || req.body.length === 0 || req.body.length > 64 * 1024)
      throw new ApiProblem(400, "VALIDATION_FAILED", "A raw eTranzact payment response is required.");

    const params = new URLSearchParams(req.body.toString("utf8"));
    const merchantReference = params.get("TRANSACTION_ID")?.trim();
    if (!merchantReference || !/^[A-Za-z0-9_-]{8,128}$/.test(merchantReference))
      throw new ApiProblem(400, "VALIDATION_FAILED", "The eTranzact transaction reference is invalid.");

    await this.events.handle("etranzact", req.body, req.headers, req.requestId);
    const attempt = await this.db.paymentAttempt.findUnique({
      where: { merchantReference },
      select: { orderId: true },
    });
    if (!attempt)
      throw new ApiProblem(404, "NOT_FOUND", "Payment attempt not found.");

    const returnUrl = provider.customerReturnUrl.replace(
      "{orderId}",
      encodeURIComponent(attempt.orderId),
    );
    return res.redirect(303, returnUrl);
  }
}
