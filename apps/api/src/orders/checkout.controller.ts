import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { checkoutQuoteRequestSchema } from "@variety/contracts";
import { ApiProblem, ApiRequest } from "../http/errors";
import { CheckoutQuoteService } from "./checkout-quote.service";
import { GuestCheckoutService } from "./guest-checkout.service";

@ApiTags("checkout")
@Controller("checkout")
export class CheckoutController {
  constructor(private readonly quoteService: CheckoutQuoteService, private readonly guests: GuestCheckoutService) {}
  @Post("quote") @HttpCode(200)
  async quote(@Body() body: unknown,@Req() req: ApiRequest,@Res({passthrough:true}) res: Response) {
    const parsed=checkoutQuoteRequestSchema.safeParse(body);
    if (!parsed.success) throw new ApiProblem(400,"VALIDATION_FAILED","Invalid checkout quote request.",{issues:parsed.error.issues.map(i=>`${i.path.join(".")||"(root)"}: ${i.message}`)});
    if (!req.get("authorization") && !(req.get("cookie")??"").includes("vg_session=")) await this.guests.ensure(req,res);
    return {ok:true,data:await this.quoteService.quote(parsed.data)};
  }
}
