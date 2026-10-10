import { Body, Controller, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { paymentInitiationRequestSchema, replayKeySchema } from "@variety/contracts";
import { CheckoutPrincipalService } from "../commerce-identity/checkout-principal.service";
import { ApiProblem, type ApiRequest } from "../http/errors";
import { PaymentInitiationService } from "./payment-initiation.service";

@ApiTags("payments")
@Controller("orders")
export class PaymentAttemptsController {
  constructor(
    private readonly principals: CheckoutPrincipalService,
    private readonly initiation: PaymentInitiationService,
  ) {}

  @Post(":orderId/payment-attempts")
  @HttpCode(201)
  async create(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = paymentInitiationRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid payment initiation request.", {
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
      });
    const key = replayKeySchema.safeParse(req.get("idempotency-key"));
    if (!key.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "A valid Idempotency-Key is required.");
    const principal = await this.principals.forMutation(req, res);
    return {
      ok: true,
      data: await this.initiation.initiate(req, principal, orderId, parsed.data, key.data),
    };
  }
}
